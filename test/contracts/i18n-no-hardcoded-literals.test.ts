/**
 * Contract test: no hardcoded user-facing literals in src/app/** (#230)
 *
 * This test fails the build if a route file under src/app/** contains a
 * Spanish-or-English literal that the user can read but that is NOT routed
 * through one of the two accepted i18n patterns:
 *
 *   - useT() / getServerT() for short strings
 *   - *-copy.ts files in src/i18n/ for static content blocks
 *
 * The detection is intentionally conservative (regex over source, like the
 * other contract tests in this repo). It catches the specific shapes of
 * regression we keep seeing in PRs (#193, #225, #228):
 *
 *   - JSX text children with 3+ consecutive Latin letters between tags
 *   - aria-label / title / placeholder / alt attributes with literal strings
 *
 * It does NOT try to parse TypeScript or recognize complex template
 * expressions — false negatives are fine, false positives in dynamic code
 * are not. When the regex is unsure, it errs on the side of allowing.
 *
 * Allowlist: any *file* listed in ALLOWLIST_FILES is exempt. The intent is
 * snapshot-style — the goal is to prevent NEW files from regressing while we
 * incrementally translate the existing ones in dedicated PRs (out of scope
 * per #230). The list MUST shrink over time, never grow without a comment.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const APP_DIR = new URL('../../src/app/', import.meta.url).pathname
const REPO_ROOT = new URL('../../', import.meta.url).pathname

// ─── allowlist ────────────────────────────────────────────────────────────────
//
// These files contain literals that have not yet been migrated to the
// i18n helpers. They are tracked here so the contract test can guard the
// rest of the codebase right now, without blocking on a full i18n sweep
// (out of scope per #230).
//
// Adding a new entry requires a one-line justification on the same line.
// Removing entries (when the file is fully translated) does NOT require any
// justification — that's the whole point.
const ALLOWLIST_FILES: ReadonlySet<string> = new Set([
  // Baseline (2026-04-13): files captured by the initial scan when the
  // contract test was introduced. To shrink this list, migrate the file's
  // visible strings to useT() / getServerT() or to an *-copy.ts and then
  // remove the entry from this set.
  //
  // Admin surfaces — internal-facing.
  // Localized: chrome (#826), dashboard, configuracion, analytics, informes (#834),
  // pedidos, productos, envios, comisiones, auditoria, liquidaciones, incidencias, notificaciones (#835).
  'src/app/(admin)/admin/productos/[id]/edit/page.tsx', // Admin-only edit surface — not localized yet.
  'src/app/(admin)/admin/productores/[id]/edit/page.tsx', // Admin-only edit surface — not localized yet.
  'src/app/(admin)/admin/promociones/[id]/edit/page.tsx', // Admin-only edit surface — not localized yet.
  'src/app/(admin)/admin/suscripciones/[id]/edit/page.tsx', // Admin-only edit surface — not localized yet.
  'src/app/(admin)/admin/ingestion/page.tsx', // Phase 3 ingestion review queue — feat-ingestion-admin gated, not localized yet.
  'src/app/(admin)/admin/ingestion/[itemId]/page.tsx', // Phase 3 ingestion review item detail — feat-ingestion-admin gated, not localized yet.
  'src/components/admin/ingestion/ReviewItemActions.tsx', // Phase 3 ingestion review actions — feat-ingestion-admin gated, not localized yet.
  'src/app/(buyer)/cuenta/reclamar-productor/page.tsx', // Phase 4 PR-E ghost-vendor claim — operator-facing via out-of-band code, not localized yet.
  'src/app/(buyer)/cuenta/reclamar-productor/ClaimVendorForm.tsx', // Phase 4 PR-E claim form — operator-facing, not localized yet.
  'src/app/(admin)/admin/ingestion/telegram/page.tsx', // Phase 1 PR-C Telegram onboarding admin — feat-ingestion-admin gated, not localized yet.
  'src/components/admin/ingestion/TelegramAuthForm.tsx', // Phase 1 PR-C onboarding form — admin-only, not localized yet.
  'src/components/admin/ingestion/TelegramChatPicker.tsx', // Phase 1 PR-C chat picker — admin-only, not localized yet.
  'src/components/admin/ingestion/TelegramSyncButton.tsx', // Phase 1 PR-C sync trigger — admin-only, not localized yet.
  // Auth flows — pending dedicated i18n PR.
  'src/app/(auth)/forgot-password/page.tsx',
  'src/app/(auth)/recuperar-contrasena/nueva/ResetForm.tsx',
  'src/app/(auth)/register/page.tsx',
  'src/app/(auth)/reset-password/[token]/page.tsx',
  // Checkout payment page (Stripe wrapper) — pending.
  'src/app/(buyer)/checkout/pago/page.tsx',
  // Public producer detail — partially localized.
  'src/app/(public)/productores/[slug]/page.tsx',
  // Vendor portal is now fully translated (#303 follow-up). Do not re-add
  // entries here without first translating the page — see
  // test/contracts/vendor-portal-i18n.test.ts which asserts the vendor area
  // stays out of the allowlist.
  //
  // Dev-only mock shipment preview rendered when MockShippingProvider is the
  // active shipping provider (i.e. Sendcloud credentials absent). Never
  // reachable in production and deliberately untranslated.
  'src/app/dev/mock-shipment/[ref]/page.tsx',
])

// Files we never scan — pure server/runtime concerns, no user-visible JSX.
const NEVER_SCAN_PATTERNS: RegExp[] = [
  /\.test\.tsx?$/,
  /\/route\.ts$/,             // API route handlers — server JSON, not JSX
  /\/loading\.tsx$/,          // Next.js loading shells — usually empty/skeleton
  /\/error\.tsx$/,            // error boundaries — short fallback strings
  /\/not-found\.tsx$/,        // 404 fallbacks
  /\/sitemap\.ts$/,
  /\/robots\.ts$/,
  /\/opengraph-image\.tsx$/,
  /\/icon\.tsx$/,
  /\/manifest\.ts$/,
  /\/middleware\.ts$/,
]

// ─── scanners ─────────────────────────────────────────────────────────────────

interface Violation {
  file: string
  line: number
  kind: 'jsx-text' | 'attribute'
  snippet: string
}

// 3+ consecutive Latin letters (incl. accents) is enough to distinguish
// "real text" from technical tokens like "ok", "id", "px".
const HAS_REAL_WORD = /[A-Za-záéíóúñÁÉÍÓÚÑ]{3,}/

// Strings that look like CSS class lists, technical IDs, file extensions,
// MIME types, brand names — never user-facing copy. Skip these.
const TECHNICAL_LITERAL = /^(text|bg|border|flex|grid|rounded|hover|focus|dark|sm|md|lg|xl|2xl)[-:]/

const ATTRS_REQUIRING_TRANSLATION = ['aria-label', 'title', 'placeholder', 'alt'] as const

function looksTechnical(value: string): boolean {
  if (!HAS_REAL_WORD.test(value)) return true
  if (value.length < 3) return true
  // CSS class strings (full Tailwind soup): ignore.
  if (/^[\w:\-\s\[\]/.()]+$/.test(value) && /\s/.test(value) && /[a-z]-/.test(value)) {
    // Heuristic: dashed tokens separated by spaces look like Tailwind classes.
    const tokens = value.split(/\s+/)
    if (tokens.every(t => /^[\w:\-\[\]/.()]+$/.test(t) && /[-:]/.test(t))) return true
  }
  if (TECHNICAL_LITERAL.test(value)) return true
  // URLs, emails, env keys.
  if (/^https?:\/\//.test(value)) return true
  if (/^[A-Z][A-Z0-9_]+$/.test(value)) return true
  return false
}

function scanFile(absPath: string): Violation[] {
  const source = readFileSync(absPath, 'utf8')
  const violations: Violation[] = []

  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // ── JSX text children: capture content between > and <
    // Stay on a single line — multi-line JSX is too noisy for regex.
    const jsxTextRe = />([^<>{}\n]{3,}?)</g
    let m: RegExpExecArray | null
    while ((m = jsxTextRe.exec(line)) !== null) {
      const raw = m[1]!.trim()
      if (looksTechnical(raw)) continue
      // Skip lines that are clearly type/interface/import/comment/object-literal context.
      const before = line.slice(0, m.index).trimEnd()
      if (/^(\/\/|\*|import|export|type|interface|const|let|var)\b/.test(line.trim())) continue
      if (before.endsWith(':') || before.endsWith(',') || before.endsWith('=')) continue
      violations.push({
        file: relative(REPO_ROOT, absPath),
        line: i + 1,
        kind: 'jsx-text',
        snippet: raw,
      })
    }

    // ── Attribute literals with required translation
    for (const attr of ATTRS_REQUIRING_TRANSLATION) {
      const re = new RegExp(`${attr}=(?:"([^"]+)"|'([^']+)')`, 'g')
      while ((m = re.exec(line)) !== null) {
        const value = (m[1] ?? m[2] ?? '').trim()
        if (looksTechnical(value)) continue
        violations.push({
          file: relative(REPO_ROOT, absPath),
          line: i + 1,
          kind: 'attribute',
          snippet: `${attr}="${value}"`,
        })
      }
    }
  }

  return violations
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(full, out)
      continue
    }
    if (!/\.(tsx|ts)$/.test(entry)) continue
    if (NEVER_SCAN_PATTERNS.some(p => p.test(full))) continue
    out.push(full)
  }
  return out
}

// ─── tests ────────────────────────────────────────────────────────────────────

test('no hardcoded user-facing literals outside the allowlist (#230)', () => {
  const files = walk(APP_DIR)
  const violationsByFile = new Map<string, Violation[]>()

  for (const file of files) {
    const rel = relative(REPO_ROOT, file)
    if (ALLOWLIST_FILES.has(rel)) continue
    const v = scanFile(file)
    if (v.length > 0) violationsByFile.set(rel, v)
  }

  if (violationsByFile.size === 0) return

  const lines: string[] = [
    '',
    `Found ${violationsByFile.size} file(s) with hardcoded user-facing literals.`,
    '',
    'Use one of the accepted i18n patterns instead:',
    "  • short strings:  const t = useT()  /  const t = await getServerT()",
    '                    then  t(\'some.key\')',
    '  • static content: add a *-copy.ts file under src/i18n/ and resolve it',
    '                    at render time (see src/i18n/catalog-copy.ts as a template)',
    '',
    'If a file is *intentionally* not user-facing (technical strings, debug, etc.),',
    'add it to ALLOWLIST_FILES at the top of test/i18n-no-hardcoded-literals.test.ts',
    'with an inline comment justifying why.',
    '',
  ]

  for (const [file, vs] of violationsByFile) {
    lines.push(`  ${file}`)
    for (const v of vs.slice(0, 5)) {
      lines.push(`    L${v.line}  [${v.kind}]  ${v.snippet}`)
    }
    if (vs.length > 5) lines.push(`    … +${vs.length - 5} more`)
  }

  assert.fail(lines.join('\n'))
})

test('the allowlist contract test catches a synthetic violation (#230)', () => {
  // Self-test: make sure the scanner WOULD catch a hardcoded literal if one
  // were introduced in a fresh file. If this synthetic check stops working
  // (e.g. because the regex broke), the main test above becomes silent — and
  // the whole guardrail is worthless. So we assert the scanner catches a
  // synthetic case directly.
  const tmp = join('/tmp', `i18n-contract-self-test-${process.pid}.tsx`)
  const synthetic = [
    'export default function Page() {',
    '  return (',
    '    <div>',
    '      <p>Hola mundo desde una página nueva</p>',
    '      <button aria-label="Cerrar el diálogo">x</button>',
    '    </div>',
    '  )',
    '}',
    '',
  ].join('\n')

  require('node:fs').writeFileSync(tmp, synthetic, 'utf8')
  try {
    const violations = scanFile(tmp)
    assert.ok(
      violations.some(v => v.kind === 'jsx-text' && /Hola mundo/.test(v.snippet)),
      'scanner must flag the JSX text child'
    )
    assert.ok(
      violations.some(v => v.kind === 'attribute' && /Cerrar el diálogo/.test(v.snippet)),
      'scanner must flag the aria-label attribute'
    )
  } finally {
    try {
      require('node:fs').unlinkSync(tmp)
    } catch {}
  }
})
