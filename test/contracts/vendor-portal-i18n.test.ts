/**
 * Strict i18n contract for the vendor portal ("Portal Productor").
 *
 * This test is intentionally narrow and aggressive: it scans every file that
 * is rendered inside /vendor/** (pages + the vendor-specific components under
 * `src/components/vendor/**`) and fails the build if it finds a hardcoded
 * user-facing literal. The goal is to stop the regression reported in
 * PR#304 where sidebar items, form labels, toasts and table headers drifted
 * back to Spanish-only even after the global locale switch.
 *
 * What counts as a "user-facing literal":
 *   - JSX text children with 3+ consecutive Latin letters between tags
 *   - aria-label / title / placeholder / alt attributes with literal strings
 *
 * Unlike the global `i18n-no-hardcoded-literals` test, this one has *no
 * allowlist*: every vendor-portal file must resolve its strings through
 * `useT()` / `getServerT()` or a `*-copy.ts` module.
 *
 * If you need to add a new string, add a key to both `src/i18n/locales/es.ts`
 * and `src/i18n/locales/en.ts` and reference it via `t('your.key')`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import es from '@/i18n/locales/es'
import en from '@/i18n/locales/en'

const REPO_ROOT = new URL('../../', import.meta.url).pathname

const VENDOR_SCAN_ROOTS = [
  new URL('../../src/app/(vendor)/', import.meta.url).pathname,
  new URL('../../src/components/vendor/', import.meta.url).pathname,
]

// Files we never scan — pure server/runtime concerns, no user-visible JSX.
const NEVER_SCAN_PATTERNS: RegExp[] = [
  /\.test\.tsx?$/,
  /\/route\.ts$/,
  /\/loading\.tsx$/,
  /\/error\.tsx$/,
  /\/not-found\.tsx$/,
]

const HAS_REAL_WORD = /[A-Za-záéíóúñÁÉÍÓÚÑ]{3,}/
const TECHNICAL_LITERAL = /^(text|bg|border|flex|grid|rounded|hover|focus|dark|sm|md|lg|xl|2xl)[-:]/
const ATTRS_REQUIRING_TRANSLATION = ['aria-label', 'title', 'placeholder', 'alt'] as const

function looksTechnical(value: string): boolean {
  if (!HAS_REAL_WORD.test(value)) return true
  if (value.length < 3) return true
  if (/^[\w:\-\s\[\]/.()]+$/.test(value) && /\s/.test(value) && /[a-z]-/.test(value)) {
    const tokens = value.split(/\s+/)
    if (tokens.every(t => /^[\w:\-\[\]/.()]+$/.test(t) && /[-:]/.test(t))) return true
  }
  if (TECHNICAL_LITERAL.test(value)) return true
  if (/^https?:\/\//.test(value)) return true
  if (/^[A-Z][A-Z0-9_]+$/.test(value)) return true
  // Allow tokens that are obviously examples (numbers, IBAN skeletons) shown
  // inside placeholders — the key heuristic is "no real word".
  return false
}

// A short allowlist of literal placeholder examples (phone numbers, IBAN
// format hints, example product regions). These are neutral across locales.
const ATTRIBUTE_VALUE_ALLOWLIST = new Set<string>([
  'ES123456789',                              // tracking number example
  'Correos, MRW, DHL...',                     // carrier brand names
  'Correos, MRW, DHL…',
  'ES76 2100 0418 4502 0005 1332',            // IBAN format example
  '18:00',                                    // cutoff time example
  'Navarra, Jaén, Girona...',                 // region list example
  'Navarra, Jaén, Girona…',
  'kg, caja, docena...',                      // unit example
  'kg, caja, docena…',
])

interface Violation {
  file: string
  line: number
  kind: 'jsx-text' | 'attribute'
  snippet: string
}

function scanFile(absPath: string): Violation[] {
  const source = readFileSync(absPath, 'utf8')
  const violations: Violation[] = []
  const lines = source.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    const jsxTextRe = />([^<>{}\n]{3,}?)</g
    let m: RegExpExecArray | null
    while ((m = jsxTextRe.exec(line)) !== null) {
      const raw = m[1]!.trim()
      if (looksTechnical(raw)) continue
      if (/^(\/\/|\*|import|export|type|interface|const|let|var)\b/.test(line.trim())) continue
      const before = line.slice(0, m.index).trimEnd()
      if (before.endsWith(':') || before.endsWith(',') || before.endsWith('=')) continue
      violations.push({
        file: relative(REPO_ROOT, absPath),
        line: i + 1,
        kind: 'jsx-text',
        snippet: raw,
      })
    }

    for (const attr of ATTRS_REQUIRING_TRANSLATION) {
      const re = new RegExp(`${attr}=(?:"([^"]+)"|'([^']+)')`, 'g')
      while ((m = re.exec(line)) !== null) {
        const value = (m[1] ?? m[2] ?? '').trim()
        if (looksTechnical(value)) continue
        if (ATTRIBUTE_VALUE_ALLOWLIST.has(value)) continue
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
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
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

test('vendor portal has no hardcoded user-facing literals', () => {
  const files = VENDOR_SCAN_ROOTS.flatMap(root => walk(root))
  assert.ok(files.length > 0, 'expected to find vendor portal files to scan')

  const violationsByFile = new Map<string, Violation[]>()
  for (const file of files) {
    const v = scanFile(file)
    if (v.length > 0) {
      violationsByFile.set(relative(REPO_ROOT, file), v)
    }
  }

  if (violationsByFile.size === 0) return

  const lines: string[] = [
    '',
    `Vendor portal has ${violationsByFile.size} file(s) with hardcoded user-facing literals.`,
    '',
    'Route them through useT() / getServerT() instead. Add the key to both',
    'src/i18n/locales/es.ts and src/i18n/locales/en.ts and reference it.',
    '',
  ]
  for (const [file, vs] of violationsByFile) {
    lines.push(`  ${file}`)
    for (const v of vs.slice(0, 10)) {
      lines.push(`    L${v.line}  [${v.kind}]  ${v.snippet}`)
    }
    if (vs.length > 10) lines.push(`    … +${vs.length - 10} more`)
  }
  assert.fail(lines.join('\n'))
})

test('vendor portal files are not listed in the global i18n allowlist', async () => {
  // Guard against "just re-add the file to the allowlist" workarounds.
  const allowlistSource = readFileSync(
    new URL('./i18n-no-hardcoded-literals.test.ts', import.meta.url).pathname,
    'utf8',
  )
  const vendorEntries = allowlistSource.match(/['"]src\/app\/\(vendor\)\/[^'"]+['"]/g) ?? []
  const vendorComponentEntries =
    allowlistSource.match(/['"]src\/components\/vendor\/[^'"]+['"]/g) ?? []
  assert.deepEqual(
    [...vendorEntries, ...vendorComponentEntries],
    [],
    'vendor portal files must not appear in ALLOWLIST_FILES — translate them instead',
  )
})

test('navigation.ts exposes vendor labels through i18n keys', async () => {
  const { vendorNavItems } = await import('@/lib/navigation')
  const esMap = es as unknown as Record<string, string>
  const enMap = en as unknown as Record<string, string>
  for (const item of vendorNavItems) {
    assert.ok(
      'labelKey' in item,
      `vendorNavItems entry for ${item.href} must use labelKey (not a hardcoded label)`,
    )
    const key = (item as { labelKey: string }).labelKey
    assert.ok(key in esMap, `missing Spanish translation for ${key}`)
    assert.ok(key in enMap, `missing English translation for ${key}`)
    assert.notEqual(esMap[key], enMap[key], `${key} appears identical in es/en — likely untranslated`)
  }
})

test('every vendor.* translation key is present in both locales', () => {
  const esMap = es as unknown as Record<string, string>
  const enMap = en as unknown as Record<string, string>
  const vendorKeys = Object.keys(esMap).filter(k => k.startsWith('vendor.'))
  assert.ok(vendorKeys.length > 50, `expected many vendor keys, got ${vendorKeys.length}`)
  for (const key of vendorKeys) {
    assert.ok(typeof esMap[key] === 'string' && esMap[key].length > 0, `missing es.${key}`)
    assert.ok(typeof enMap[key] === 'string' && enMap[key].length > 0, `missing en.${key}`)
  }
})
