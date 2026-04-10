/**
 * Public pages dark mode static analysis tests
 * Verifies that public pages use theme variables instead of hardcoded colors
 */

import { readFileSync } from 'fs'
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { resolve } from 'path'

// Tailwind classes that should NOT be used (they're hardcoded colors)
const FORBIDDEN_COLORS = [
  /\bbg-white\b/,
  /\bbg-gray-\d+\b/,
  /\bbg-emerald-\d+\b/,
  /\bbg-blue-\d+\b/,
  /\btext-gray-\d+\b/,
  /\btext-emerald-\d+\b/,
  /\btext-blue-\d+\b/,
  /\bborder-gray-\d+\b/,
  /\bborder-emerald-\d+\b/,
  /\bborder-blue-\d+\b/,
  /\bfocus:border-emerald-\d+\b/,
  /\bfocus:ring-emerald-\d+\b/,
  /\bhover:bg-emerald-\d+\b/,
]

// Tailwind classes that SHOULD be present (theme variables)
const REQUIRED_THEME_CLASSES = [
  'bg-surface',
  'bg-surface-raised',
  'text-foreground',
  'text-foreground-soft',
  'border-border',
  'bg-accent',
  'text-accent',
]

// Pages to check
const PUBLIC_PAGES = [
  'src/app/(public)/como-funciona/page.tsx',
  'src/app/(public)/contacto/page.tsx',
  'src/app/(public)/contacto/ContactForm.tsx',
  'src/app/(public)/faq/page.tsx',
  'src/app/(public)/privacidad/page.tsx',
  'src/app/(public)/como-vender/page.tsx',
  'src/app/(public)/buscar/page.tsx',
  'src/app/(public)/productos/page.tsx',
  'src/app/(public)/sobre-nosotros/page.tsx',
]

describe('Public pages dark mode compliance', () => {
  for (const pagePath of PUBLIC_PAGES) {
    const fullPath = resolve(pagePath)
    const pageName = pagePath.split('/').slice(-2).join('/')

    test(`${pageName} should not have hardcoded colors`, () => {
      try {
        const content = readFileSync(fullPath, 'utf-8')

        // Check for forbidden hardcoded colors
        for (const pattern of FORBIDDEN_COLORS) {
          const matches = content.match(pattern)
          assert(
            !matches,
            `Found hardcoded color in ${pageName}: ${matches?.[0]} - Use theme variables instead (bg-surface, text-foreground, border-border, etc.)`
          )
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('ENOENT')) {
          // File doesn't exist - might be okay for some pages
          console.log(`⚠ File not found: ${pagePath}`)
        } else {
          throw err
        }
      }
    })

    test(`${pageName} should use theme variables`, () => {
      try {
        const content = readFileSync(fullPath, 'utf-8')
        const hasAnyThemeClass = REQUIRED_THEME_CLASSES.some(cls =>
          content.includes(cls)
        )

        assert(
          hasAnyThemeClass,
          `${pageName} should use theme variables like bg-surface, text-foreground, border-border, etc.`
        )
      } catch (err) {
        if (err instanceof Error && err.message.includes('ENOENT')) {
          console.log(`⚠ File not found: ${pagePath}`)
        } else {
          throw err
        }
      }
    })
  }

  // Test that ContactForm specifically has no hardcoded form input colors
  test('ContactForm should have theme-aware form inputs', () => {
    const content = readFileSync(resolve('src/app/(public)/contacto/ContactForm.tsx'), 'utf-8')

    // Should not have hardcoded gray inputs
    assert(
      !content.includes('placeholder-gray-500'),
      'Form should not have hardcoded gray placeholder - use placeholder-muted instead'
    )

    assert(
      !content.includes('border-gray-300'),
      'Form should not have hardcoded gray borders - use border-border instead'
    )

    assert(
      !content.includes('text-gray-900'),
      'Form should not have hardcoded gray text - use text-foreground instead'
    )

    // Should have theme-aware inputs
    assert(
      content.includes('placeholder-muted') || content.includes('placeholder-['),
      'ContactForm should use theme-aware placeholder colors'
    )

    assert(
      content.includes('border-border'),
      'ContactForm should use border-border class'
    )

    assert(
      content.includes('text-foreground'),
      'ContactForm should use text-foreground class'
    )
  })
})

describe('Shared components dark mode compliance', () => {
  const COMPONENTS = [
    'src/components/layout/Header.tsx',
    'src/components/layout/Footer.tsx',
  ]

  for (const componentPath of COMPONENTS) {
    test(`${componentPath.split('/').pop()} should use theme variables`, () => {
      try {
        const content = readFileSync(resolve(componentPath), 'utf-8')

        // These components should use CSS variables for theme
        assert(
          content.includes('var(--surface)') ||
          content.includes('var(--border)') ||
          content.includes('var(--foreground)'),
          `${componentPath} should use CSS variables for theme support`
        )
      } catch (err) {
        if (err instanceof Error && err.message.includes('ENOENT')) {
          console.log(`⚠ File not found: ${componentPath}`)
        } else {
          throw err
        }
      }
    })
  }
})
