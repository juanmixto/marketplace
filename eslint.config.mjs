import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import tseslint from 'typescript-eslint'

// Phase 4 of the contract-hardening plan — minimum viable enforcement.
//
// Original goal: block deep cross-domain imports app-wide so each
// domain's barrel (src/domains/<X>/index.ts) is the only public surface.
// Reality: barrels created in Phase 3 re-export server-only modules
// (Prisma-touching queries, services), and Next.js's module graph
// follows those re-exports into client components — even when the
// client only needs a type. Enforcing barrel-only would require first
// splitting every domain barrel into server vs client halves
// (`index.ts` vs `index.client.ts`), which is a much larger refactor.
//
// What this PR ships instead:
// 1. The eslint-plugin-boundaries dep is installed for future use.
// 2. The barrel-only rule is enforced ONLY for src/lib/ → src/domains/
//    edges, where the importer is unambiguously server-side.
// 3. The migration helper at scripts/migrate-cross-domain-imports.mjs
//    is kept in-tree for the future enforcement PR.
// 4. Stripe's eager `new Stripe()` call moved to a lazy getter (it
//    was breaking any test that loaded the vendors barrel without
//    STRIPE_SECRET_KEY).
//
// Server-only module hygiene inside src/domains/<X>/ still relies on
// PR review until the barrel split lands.

const crossDomainRestriction = {
  patterns: [
    {
      group: ['@/domains/*/*'],
      message:
        'Inside src/lib/, cross-domain imports must go through the barrel: @/domains/<X> instead of reaching into the internals.',
    },
  ],
}

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
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
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
  // The barrel-only rule lives here on src/lib/ only. See the file
  // header for why src/domains/, src/app/, src/components/ aren't
  // included yet.
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', crossDomainRestriction],
    },
  },
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
