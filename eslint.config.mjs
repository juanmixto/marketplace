import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import tseslint from 'typescript-eslint'

// Phase 11 of the contract-hardening plan.
//
// See `docs/ai-guidelines.md` §1.2, §1.3, §1.5, §6.1 for the
// canonical narrative. Quick summary below for in-file context.
//
// History: Phase 4 attempted app-wide barrel-only enforcement, but
// the barrels created in Phase 3 re-exported server-only modules
// (queries, services without 'use server') that Next.js then bundled
// into client components, breaking the build. Phase 4 was
// scope-reduced to enforce only `src/lib/` -> `@/domains/<X>` edges.
//
// Phase 11 closes the loop: each domain barrel was trimmed to only
// re-export client-safe modules (types, schemas, pure utilities, and
// 'use server' actions which Next.js handles as RPC stubs even from
// client callers). With trimmed barrels, the build is safe regardless
// of who imports from the barrel — server or client.
//
// Enforcement therefore extends to:
//   - src/lib/   (kept from Phase 4)
//   - src/domains/<X>/ -> src/domains/<Y>/  (cross-domain edges)
//
// src/app/ and src/components/ remain unrestricted: barrels are
// safe but pages and components freely deep-import for ergonomics.
//
// The two 'use client' Zustand stores are explicit allowlist exceptions.

const DOMAINS = [
  'admin',
  'admin-stats',
  'analytics',
  'auth',
  'catalog',
  'finance',
  'impersonation',
  'incidents',
  'notifications',
  'orders',
  'payments',
  'portals',
  'promotions',
  'push-notifications',
  'reviews',
  'settlements',
  'shipping',
  'subscriptions',
  'vendors',
]

// 'use client' Zustand stores intentionally sit outside the barrels
// (the barrel is server-safe by construction). Consumers must keep
// importing them by their full path.
const ALLOWED_CLIENT_STORE_DEEP_IMPORTS = [
  '@/domains/cart/cart-store',
  '@/domains/cart/cart-broadcast',
  '@/domains/catalog/favorites-store',
]

const crossDomainRestriction = {
  patterns: [
    {
      group: [
        '@/domains/*/*',
        ...ALLOWED_CLIENT_STORE_DEEP_IMPORTS.map(p => `!${p}`),
      ],
      message:
        'Cross-domain imports must go through the barrel: @/domains/<X> instead of reaching into the internals.',
    },
  ],
}

const perDomainOverrides = DOMAINS.map(name => ({
  files: [`src/domains/${name}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@/domains/*/*',
              `!@/domains/${name}/*`,
              `!@/domains/${name}/**`,
              ...ALLOWED_CLIENT_STORE_DEEP_IMPORTS.map(p => `!${p}`),
            ],
            message: `Cross-domain imports must go through the barrel: @/domains/<X>. (Same-domain deep imports of @/domains/${name}/* are still allowed.)`,
          },
        ],
      },
    ],
  },
}))

export default [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'node_modules/**',
      'src/generated/**',
      '.claude/worktrees/**',
      'test-results/**',
      'playwright-report/**',
      'coverage/**',
      'public/sw.js',
      'docs/wiki/**',
      '*.config.mjs',
      '*.config.js',
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/incompatible-library': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // Type-aware lint rules below need TS program info.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Anti-bug rules — Gap 2B of the bug-reduction plan.
      // See `/home/whisper/.claude/plans/ahora-despu-s-de-esta-smooth-mango.md`.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/strict-boolean-expressions': ['error', {
        allowNullableObject: true,
        allowNullableString: true,
        allowNullableNumber: true,
        allowNullableBoolean: true,
        allowString: true,
        allowNumber: true,
      }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Contract enforcement — see docs/ai-guidelines.md §1.2 and §6.
      // Cross-domain reaches into private/internal subfolders are forbidden.
      // The audit script (scripts/audit-domain-contracts.mjs) covers
      // additional dynamic checks (cycles, stores in server graph).
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '@/domains/*/internal/*',
              '@/domains/*/internal',
              '@/domains/*/_*/**',
              '@/domains/*/_*',
              '@/domains/*/private/*',
              '@/domains/*/private',
            ],
            message:
              'Private modules of a domain are not importable from outside that domain. See docs/ai-guidelines.md §1.2.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', crossDomainRestriction],
    },
  },
  ...perDomainOverrides,
  {
    files: ['test/**/*.{ts,tsx}', 'e2e/**/*.{ts,tsx}', 'scripts/**/*.{ts,tsx,mjs,js}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'no-restricted-imports': 'off',
    },
  },
]
