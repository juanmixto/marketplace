#!/usr/bin/env node
/**
 * audit-app-env-coherence.mjs
 *
 * Hardens the lesson from PR #1094, which introduced the `APP_ENV` /
 * `NEXT_PUBLIC_APP_ENV` pair as a deploy-environment dimension orthogonal
 * to NODE_ENV (Next.js builds staging and production both as
 * NODE_ENV=production, so they are indistinguishable at runtime without
 * this dedicated var). Sentry's `environment` tag, PostHog's `app_env`
 * property, and `src/app/robots.ts` (Disallow on staging) all key off
 * APP_ENV.
 *
 * The class of bug this script prevents: production booting with
 * `APP_ENV=development` because someone hand-edited the wrong template,
 * or staging shipping with `NEXT_PUBLIC_APP_ENV=production` because the
 * server var was fixed but the browser mirror was forgotten — a typo
 * that would silently let staging events pollute the production
 * dashboard and let crawlers index staging.
 *
 * What this audits, per `.env.<env>.example` template:
 *
 *   1. APP_ENV is declared as an uncommented, non-empty assignment
 *      (not `# APP_ENV=...`).
 *   2. NEXT_PUBLIC_APP_ENV is declared the same way.
 *   3. Both values match the file's expected environment
 *      (.env.example → development; .env.staging.example → staging;
 *      .env.production.example → production).
 *   4. APP_ENV and NEXT_PUBLIC_APP_ENV are equal within the file
 *      (catches the "server says production, browser says staging" typo).
 *
 * If a template re-declares APP_ENV or NEXT_PUBLIC_APP_ENV multiple
 * times (it happens — see .env.production.example today), the LAST
 * uncommented assignment wins, mirroring how `set -a; source` resolves
 * the file. We still flag the case where two non-matching declarations
 * exist for the same key — that is always a bug.
 *
 * No baseline file is needed: the templates were authored with the
 * correct values in #1094, so the audit starts at zero violations and
 * fails the build the moment one is introduced.
 *
 * Usage:
 *   node scripts/audit-app-env-coherence.mjs            # CI mode
 *   node scripts/audit-app-env-coherence.mjs --json     # machine-readable
 *
 * Exit codes:
 *   0 — all templates coherent
 *   1 — at least one violation
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const JSON_OUT = process.argv.includes('--json')

// One row per template we audit. Add a row when introducing a new
// `.env.<env>.example` (e.g. preview, sandbox).
const TEMPLATES = [
  { file: '.env.example',            expected: 'development' },
  { file: '.env.staging.example',    expected: 'staging'     },
  { file: '.env.production.example', expected: 'production'  },
]

const KEYS = ['APP_ENV', 'NEXT_PUBLIC_APP_ENV']

const violations = []

function parseAssignments(content, key) {
  // Match uncommented `KEY=value` or `KEY="value"` assignments. Ignore
  // commented-out lines (`# KEY=...`) and inline comments after the
  // value. Returns every occurrence in declaration order.
  const re = new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'#\\n]*?)["']?\\s*(?:#.*)?$`, 'gm')
  const out = []
  let m
  while ((m = re.exec(content)) !== null) {
    out.push((m[1] ?? '').trim())
  }
  return out
}

function audit() {
  for (const { file, expected } of TEMPLATES) {
    let content
    try {
      content = readFileSync(join(ROOT, file), 'utf8')
    } catch (err) {
      violations.push({
        file,
        rule: 'template-missing',
        message: `Template ${file} is missing or unreadable: ${err.message}`,
      })
      continue
    }

    const observed = {}
    for (const key of KEYS) {
      const assignments = parseAssignments(content, key)
      if (assignments.length === 0) {
        violations.push({
          file,
          rule: 'missing-key',
          message: `${file} does not declare ${key} (uncommented). Expected: ${key}=${expected}`,
        })
        continue
      }
      // If the same key is declared more than once and the values differ,
      // that is always a bug — even if the LAST one matches expected,
      // a partial edit of the file would silently flip the resolved value.
      const unique = [...new Set(assignments)]
      if (unique.length > 1) {
        violations.push({
          file,
          rule: 'conflicting-declarations',
          message: `${file} declares ${key} multiple times with different values: ${unique.map((v) => JSON.stringify(v)).join(' vs ')}. Pick one.`,
        })
        continue
      }
      observed[key] = unique[0]
      if (unique[0] !== expected) {
        violations.push({
          file,
          rule: 'wrong-value',
          message: `${file} sets ${key}=${JSON.stringify(unique[0])}, expected ${JSON.stringify(expected)}.`,
        })
      }
    }

    if (
      observed.APP_ENV !== undefined &&
      observed.NEXT_PUBLIC_APP_ENV !== undefined &&
      observed.APP_ENV !== observed.NEXT_PUBLIC_APP_ENV
    ) {
      violations.push({
        file,
        rule: 'mismatch-server-vs-browser',
        message: `${file}: APP_ENV=${JSON.stringify(observed.APP_ENV)} but NEXT_PUBLIC_APP_ENV=${JSON.stringify(observed.NEXT_PUBLIC_APP_ENV)}. The server var and browser mirror must match — Sentry / PostHog / robots.ts will disagree otherwise.`,
      })
    }
  }
}

audit()

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ violations }, null, 2) + '\n')
} else if (violations.length === 0) {
  process.stdout.write('audit-app-env-coherence: clean — APP_ENV / NEXT_PUBLIC_APP_ENV coherent across all templates.\n')
} else {
  for (const v of violations) {
    process.stdout.write(`\n[${v.rule}] ${v.file}\n  ${v.message}\n`)
  }
  process.stdout.write(`\naudit-app-env-coherence: ${violations.length} violation(s).\n`)
}

if (violations.length > 0) process.exit(1)
