/**
 * Dark-mode regression contract for admin / vendor / auth / public panels.
 *
 * Static-analysis test: for a list of files previously audited and fixed, assert
 * that every className string using a light-mode-only palette token
 * (bg-white / bg-gray-N / text-gray-N / border-gray-N / bg-{color}-50|100) is
 * paired with a matching `dark:` variant on the same element, OR the file uses
 * CSS theme variables (var(--surface), var(--foreground), etc.).
 *
 * Why pair-based (instead of the stricter "no hardcoded colors" from
 * `buyer-pages-dark-mode.test.ts`): these panels still ship light-mode Tailwind
 * classes as the default, and the fix was to add explicit `dark:` counterparts.
 * This test guards against regressions where someone adds a new card/badge/input
 * using a light color without the dark counterpart.
 */
import { readFileSync } from 'fs'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'path'

function read(relPath: string) {
  return readFileSync(resolve(relPath), 'utf-8')
}

// Extract className="..." / className={`...`} string literals. We intentionally
// only inspect static strings — dynamic expressions are out of scope.
function extractClassNames(source: string): string[] {
  const out: string[] = []
  const re = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\}|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '')
  }
  return out
}

// Regexes over a single className string. A match means "this element uses a
// light-only token" — we then require an accompanying dark: variant in the
// same string.
const LIGHT_TOKENS: Array<{ label: string; light: RegExp; requiresDark: RegExp }> = [
  {
    label: 'bg-white / bg-gray-N',
    // Match only non-prefixed occurrences (no `dark:` / `hover:` / etc.).
    light: /(?:^|\s)(?:bg-white|bg-gray-(?:50|100|200|300))(?!\S)/,
    requiresDark: /dark:bg-/,
  },
  {
    label: 'text-gray-700/800/900',
    light: /(?:^|\s)text-gray-(?:700|800|900)(?!\S)/,
    requiresDark: /dark:text-/,
  },
  {
    label: 'border-gray-200/300',
    light: /(?:^|\s)border-gray-(?:200|300)(?!\S)/,
    requiresDark: /dark:border-/,
  },
  {
    label: 'bg-{color}-50/100 (tinted surfaces)',
    light: /(?:^|\s)bg-(?:red|green|yellow|blue|emerald|amber)-(?:50|100)(?!\S)/,
    requiresDark: /dark:(?:bg|text|border|from|to|ring)-/,
  },
]

function assertDarkPaired(relPath: string) {
  const source = read(relPath)
  const classNames = extractClassNames(source)
  for (const cn of classNames) {
    for (const { label, light, requiresDark } of LIGHT_TOKENS) {
      if (light.test(cn) && !requiresDark.test(cn)) {
        assert.fail(
          `${relPath}: className uses ${label} without a dark: variant — "${cn.trim().slice(0, 160)}"`,
        )
      }
    }
  }
}

// Files fixed in the 2026-04-13 dark-mode audit. Adding new panel pages here
// acts as opt-in protection against the same class of regression.
const GUARDED_FILES = [
  'src/app/(vendor)/vendor/liquidaciones/page.tsx',
  'src/app/(vendor)/vendor/valoraciones/page.tsx',
  'src/app/(auth)/recuperar-contrasena/page.tsx',
  'src/app/(auth)/recuperar-contrasena/RequestForm.tsx',
  'src/app/(auth)/recuperar-contrasena/nueva/page.tsx',
  'src/app/(auth)/recuperar-contrasena/nueva/ResetForm.tsx',
  'src/app/(auth)/reset-password/[token]/page.tsx',
  'src/app/(public)/productores/[slug]/ReviewSection.tsx',
  'src/app/(public)/contacto/ContactForm.tsx',
  'src/app/error.tsx',
  'src/domains/admin/overview.ts',
]

describe('dark-mode — audited panel files keep dark: pairings', () => {
  for (const file of GUARDED_FILES) {
    test(`${file} — every hardcoded light token has a dark: counterpart`, () => {
      assertDarkPaired(file)
    })
  }
})

describe('dark-mode — getToneClasses covers dark variants', () => {
  test('all tones in src/domains/admin/overview.ts return dark: variants', () => {
    const source = read('src/domains/admin/overview.ts')
    const toneBlock = source.match(/export function getToneClasses[\s\S]*?^}/m)
    assert.ok(toneBlock, 'getToneClasses function should exist')
    const body = toneBlock![0]
    const returnLiterals = body.match(/return\s+'([^']+)'/g) ?? []
    assert.ok(returnLiterals.length >= 5, `expected at least 5 tone returns, found ${returnLiterals.length}`)
    for (const literal of returnLiterals) {
      assert.ok(
        /dark:bg-/.test(literal) && /dark:text-/.test(literal) && /dark:ring-/.test(literal),
        `getToneClasses return is missing a dark: variant: ${literal}`,
      )
    }
  })
})
