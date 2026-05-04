#!/usr/bin/env node
/**
 * audit-no-root-env.mjs
 *
 * Closes #1180 (P0-3): keeps a tracked `.env` from re-entering the repo
 * and warns developers if a local `.env` exists in their working tree.
 *
 * The original incident: `/.env` mixed CI placeholders
 * (`AUTH_SECRET=ci-secret-please-change`) with a real
 * `AUTH_GOOGLE_SECRET`. Next.js loads `.env` first when present, so the
 * file's mere existence on a developer machine made copy-paste of a
 * real secret into `.env.example` (or a screenshot) trivially possible.
 *
 * Contract enforced by this script:
 *   1. `.env` MUST NOT be tracked in git.
 *   2. `.env` MUST be listed in `.gitignore`.
 *
 * Local-warning (does NOT fail the script):
 *   - If `.env` exists in the current working directory we print a
 *     loud notice. CI runs are clean (no `.env` file is ever created
 *     by the workflow), so the warning shows up only on developer
 *     machines that still have the legacy file.
 *
 * Why CI-enforced even though `.env` is gitignored: the gitignore line
 * could be removed in a refactor, and `git add -f .env` bypasses
 * `.gitignore`. The audit catches both shapes before they merge.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname)
const violations = []

// 1. Is `.env` tracked in git?
try {
  const tracked = execSync('git ls-files .env', {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
  if (tracked.length > 0) {
    violations.push(
      `.env is tracked in git (\`git ls-files .env\` → "${tracked}").\n` +
        '  Run: git rm --cached .env && commit. Then move its contents to ' +
        '.env.local (dev) or /etc/marketplace/app.env (prod).',
    )
  }
} catch {
  // `git ls-files` returns non-zero only on catastrophic failure
  // (not a git repo). In CI we always are; in local dev a non-git
  // checkout shouldn't run audits anyway.
}

// 2. `.env` line in .gitignore.
const gitignorePath = resolve(REPO_ROOT, '.gitignore')
if (!existsSync(gitignorePath)) {
  violations.push('.gitignore is missing — cannot enforce no-root-env contract.')
} else {
  const lines = readFileSync(gitignorePath, 'utf8').split('\n').map((l) => l.trim())
  // Accept `.env` exactly. `.env.*` alone wouldn't catch `.env` itself.
  const hasEnvLine = lines.some((l) => l === '.env' || l === '/.env')
  if (!hasEnvLine) {
    violations.push(
      '.gitignore does not list `.env` (or `/.env`). ' +
        'Add the line so a future `git add .env` is rejected by default.',
    )
  }
}

// 3. Local-only warning — never fails CI.
const localEnvPath = resolve(REPO_ROOT, '.env')
if (existsSync(localEnvPath)) {
  console.warn(
    '\x1b[33m[audit-no-root-env]\x1b[0m local .env detected at repo root.\n' +
      '  This file is NOT loaded by CI, but on your laptop Next.js will read it\n' +
      '  before .env.local. Move its contents to .env.local and delete the file:\n' +
      '    mv .env .env.backup-$(date +%s) && cat .env.backup-* >> .env.local\n' +
      '  See docs/env-files.md for the canonical layout.',
  )
}

if (violations.length > 0) {
  console.error('audit-no-root-env: violations found:\n')
  for (const v of violations) console.error('  - ' + v + '\n')
  console.error('See docs/env-files.md for the canonical env-file layout.')
  process.exit(1)
}

console.log('audit-no-root-env: clean')
