/**
 * Static contract: every client-side mutation that hits an /api/*
 * route handler MUST either invalidate the Next.js Router Cache
 * (`router.refresh()`) or navigate away (`router.push`, full reload),
 * otherwise server-rendered pages downstream serve stale RSC payloads
 * after the mutation. See PR #1091 for the canonical bug (favorites)
 * and the follow-up PR for the bundled fix.
 *
 * This test scans every `.tsx`/`.ts` file in the catalog of client
 * mutation surfaces and fails the build if a NEW file appears that
 * mutates state via an API route without one of the recognized
 * invalidation primitives. Files known to be safe by construction
 * (controlled uploaders, full-reload signouts, server-action callers,
 * etc.) live in `EXEMPT_FILES` with a one-line reason — adding a new
 * exemption forces the author to think about why.
 *
 * What "safe by construction" means here:
 *   - The mutation is a controlled upload that just emits a URL to
 *     the parent (the URL is sent on the parent form submit, which
 *     hits a server action — that path invalidates correctly).
 *   - The handler does a full-page navigation (window.location.href,
 *     redirect, etc.) so Router Cache is bypassed entirely.
 *   - The mutation is to a route handler whose response has no SSR
 *     reader anywhere — flag this case explicitly in the exemption
 *     reason so a reviewer can challenge it.
 *
 * Heuristic note: this test is conservative — it looks for ANY use of
 * `router.refresh()` or `router.push(` in the same file as the fetch.
 * That accepts flows where success branches navigate away (push) and
 * flows where the same file invalidates (refresh). It can produce
 * false negatives if a mutation is buried in an early-return error
 * branch and only the success path navigates — review them by hand.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// Files that mutate via /api/* fetch but do not need router.refresh()
// or router.push(). Each entry MUST have a reason — when the file is
// changed substantially the next reviewer should re-validate the
// reason still holds.
const EXEMPT_FILES: Record<string, string> = {
  // Controlled uploaders: they just upload a binary and emit a URL to
  // the parent form via onChange. The parent submits that URL via a
  // server action / form-encoded POST whose own revalidatePath() flow
  // invalidates the Router Cache correctly.
  'src/components/incidents/IncidentAttachmentPicker.tsx':
    'controlled uploader — parent form is responsible for invalidation',
  'src/components/vendor/ImageUploader.tsx':
    'controlled uploader — parent form is responsible for invalidation',
  'src/components/vendor/VendorHeroUpload.tsx':
    'controlled uploader — parent form is responsible for invalidation',

  // 2FA enrollment: success path is a window.location.href full
  // reload via /api/auth/signout, which bypasses Router Cache by
  // construction. The previous "session" is also being torn down,
  // so router.refresh() would be wasted work.
  'src/app/(admin)/admin/security/enroll/EnrollClient.tsx':
    'verify success path does window.location.href to /api/auth/signout (full reload)',

  // Public contact form: no SSR aguas abajo reads the form's outcome.
  // The only feedback is a "thanks" UI flag local to the component.
  'src/app/(public)/contacto/ContactForm.tsx':
    'no SSR reader downstream — submission produces a local success banner only',

  // Auth recovery flows: each one ends with router.push to /login or
  // a success banner; there is no per-user SSR state mutated that
  // needs Router Cache invalidation.
  'src/app/(auth)/recuperar-contrasena/RequestForm.tsx':
    'recovery email request — no per-user SSR downstream',

  // Sign-up form: the response is a "check your email" success
  // banner; the user is not yet logged in and has no per-user SSR
  // surface to invalidate. The verification flow that follows is a
  // separate request hitting a fresh page.
  'src/components/auth/RegisterForm.tsx':
    'pre-auth signup — user has no session yet, no per-user SSR to invalidate',

  // Favorites store: this is the data layer (Zustand). The
  // invalidation responsibility lives in the UI caller
  // (FavoriteToggleButton), which IS pinned by the
  // "canonical fixed cases" subtest. Keeping router.refresh out of
  // the store keeps it framework-agnostic and testable in isolation.
  'src/domains/catalog/favorites-store.ts':
    'data layer — invalidation is the UI caller\'s responsibility (FavoriteToggleButton, pinned)',
}

// Detection regex — looks for any `fetch(` call whose argument string
// includes `/api/` AND whose options block names a mutating method.
// Two passes: first capture the full fetch(...) expression, then test
// the body for the method.
const FETCH_API_RE = /fetch\s*\(\s*[`'"][^`'"]*\/api\/[^`'"]*[`'"][^)]*\)/g
const MUTATING_METHOD_RE = /method\s*:\s*['"](POST|DELETE|PATCH|PUT)['"]/

// We accept either: explicit cache invalidation via router.refresh(),
// or programmatic navigation (router.push, redirect, window.location)
// which itself bypasses or replaces the cached entry.
const INVALIDATION_RE = /router\.refresh\s*\(\s*\)/
const NAVIGATION_RE = /router\.push\s*\(|window\.location\.(href|assign|replace)|next\/navigation['"][^]*\bredirect\b/

// We also accept files that import from `next/navigation` and use
// router.push elsewhere — see NAVIGATION_RE. Files that wrap the
// mutation in a server action (no `/api/` URL) are out of scope here
// because the audit is fetch-based.

function isClientFile(source: string): boolean {
  // Look for "use client" pragma in the first 5 lines (allows a
  // copyright/JSDoc block above it).
  const head = source.split('\n').slice(0, 8).join('\n')
  return /['"]use client['"]/.test(head)
}

function listClientMutationFiles(): string[] {
  // Use git ls-files so we don't pick up build artefacts. Then grep
  // for /api/ string literals as a fast first-pass filter.
  const all = execSync(
    `git ls-files 'src/components/*.tsx' 'src/components/**/*.tsx' 'src/app/**/*.tsx' 'src/app/**/*.ts' 'src/domains/**/*.ts' 'src/domains/**/*.tsx'`,
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)

  const candidates: string[] = []
  for (const file of all) {
    let src: string
    try {
      src = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (!isClientFile(src)) continue
    if (!/\/api\//.test(src)) continue
    // Skip files that don't fetch at all
    if (!/\bfetch\s*\(/.test(src)) continue
    candidates.push(file)
  }
  return candidates
}

function findMutatingFetches(source: string): string[] {
  const out: string[] = []
  const matches = source.match(FETCH_API_RE) ?? []
  for (const m of matches) {
    if (MUTATING_METHOD_RE.test(m)) out.push(m)
  }
  // Two-line patterns: `fetch(url, { ... method: 'POST' ... })` may
  // span multiple lines. Catch those by checking `fetch(...` blocks
  // up to the matching closing paren in a coarse grep.
  const multilineRe = /fetch\s*\(\s*[`'"][^`'"]*\/api\/[\s\S]*?\)/g
  let m: RegExpExecArray | null
  while ((m = multilineRe.exec(source))) {
    if (MUTATING_METHOD_RE.test(m[0]) && !out.includes(m[0])) out.push(m[0])
  }
  return out
}

describe('Router Cache invalidation contract', () => {
  test('every client component that mutates via /api/* invalidates or navigates', () => {
    const files = listClientMutationFiles()
    const violations: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const fetches = findMutatingFetches(source)
      if (fetches.length === 0) continue

      const exempt = EXEMPT_FILES[file]
      if (exempt) continue

      const invalidates = INVALIDATION_RE.test(source)
      const navigates = NAVIGATION_RE.test(source)
      if (!invalidates && !navigates) {
        violations.push(
          `${file}\n  mutates via fetch but never calls router.refresh() or navigates away.\n  Either add router.refresh() in the success branch, or add the file to EXEMPT_FILES with a reason.`
        )
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found ${violations.length} client component(s) with cache-invalidation gaps:\n\n${violations.join('\n\n')}`
    )
  })

  test('every entry in EXEMPT_FILES still exists', () => {
    // Drift guard: a renamed/deleted file with a stale exemption is a
    // foot-gun. Force the author of the rename to update the list.
    for (const path of Object.keys(EXEMPT_FILES)) {
      try {
        readFileSync(path, 'utf8')
      } catch {
        assert.fail(
          `EXEMPT_FILES references a missing path: ${path}\n` +
          `Update test/contracts/router-cache-invalidation.test.ts after the rename.`
        )
      }
    }
  })

  test('canonical fixed cases still carry router.refresh()', () => {
    // Pin the previously-fixed surfaces so a future refactor that
    // accidentally drops router.refresh() trips this test even if the
    // file moves out of the heuristic's reach.
    const pinned = [
      'src/components/catalog/FavoriteToggleButton.tsx',
      'src/app/(buyer)/cuenta/direcciones/DireccionesClient.tsx',
      'src/components/admin/IncidentDetailClient.tsx',
      'src/components/buyer/BuyerProfileForm.tsx',
    ]
    for (const file of pinned) {
      const src = readFileSync(file, 'utf8')
      assert.match(
        src,
        INVALIDATION_RE,
        `${file} must call router.refresh() after a successful mutation. ` +
        `If the file's mutation pattern changed, update this pin (and the docs entry).`
      )
    }
  })
})
