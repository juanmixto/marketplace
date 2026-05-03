#!/usr/bin/env node
// scripts/verify.mjs
//
// Runs the same checks the CI "Verify" job runs, in parallel, locally.
// Prints PASS/FAIL summary and full output of any failures. Exits
// non-zero if any check failed.
//
// Why this exists: before this script, the only way to be confident a
// PR would pass the Verify job was to push and wait. That feedback loop
// is ~3 min on a busy runner. Running these checks locally takes ~30 s
// on a warm cache and catches typos, unused imports, contract
// regressions, etc. before they ever hit CI.
//
// Usage:
//   npm run verify
//
// What it runs (mirrors .github/workflows/ci.yml § Verify):
//   - lint
//   - audit:contracts
//   - audit:flags-cleanup
//   - audit:fk
//   - audit:findMany
//   - audit:image-sizes
//   - typecheck:app
//   - typecheck:test
//   - test:parallel  (fast unit/contract tests; integration + E2E are
//                     intentionally NOT included — they need a DB and
//                     belong in `npm run test:integration` /
//                     `npm run test:e2e:smoke`)
//
// Exits 0 if everything passes, 1 if anything fails.

import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const CHECKS = [
  { name: 'lint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'audit:contracts', cmd: 'npm', args: ['run', 'audit:contracts'] },
  { name: 'audit:flags-cleanup', cmd: 'npm', args: ['run', 'audit:flags-cleanup'] },
  { name: 'audit:fk', cmd: 'npm', args: ['run', 'audit:fk'] },
  { name: 'audit:findMany', cmd: 'npm', args: ['run', 'audit:findMany'] },
  { name: 'audit:image-sizes', cmd: 'npm', args: ['run', 'audit:image-sizes'] },
  { name: 'typecheck:app', cmd: 'npm', args: ['run', 'typecheck:app'] },
  { name: 'typecheck:test', cmd: 'npm', args: ['run', 'typecheck:test'] },
  { name: 'test:parallel', cmd: 'npm', args: ['run', 'test:parallel'] },
]

function pad(s, n) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function runOne(check) {
  return new Promise(resolve => {
    const start = performance.now()
    const child = spawn(check.cmd, check.args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('close', code => {
      resolve({
        name: check.name,
        ok: code === 0,
        ms: performance.now() - start,
        stdout,
        stderr,
        code,
      })
    })
    child.on('error', err => {
      resolve({
        name: check.name,
        ok: false,
        ms: performance.now() - start,
        stdout: '',
        stderr: String(err),
        code: -1,
      })
    })
  })
}

async function main() {
  const total = performance.now()
  console.error(`[verify] Running ${CHECKS.length} checks in parallel...`)

  const results = await Promise.all(CHECKS.map(runOne))

  const failed = results.filter(r => !r.ok)
  const passed = results.filter(r => r.ok)

  // Print failures with the LAST 80 lines of output (full output is
  // often hundreds of TAP lines that bury the summary). Hint how to
  // re-run for the full log.
  const TAIL_LINES = 80
  const tail = s => {
    const lines = s.trimEnd().split('\n')
    if (lines.length <= TAIL_LINES) return lines.join('\n')
    return [
      `... (${lines.length - TAIL_LINES} earlier line(s) truncated; re-run \`npm run <script>\` for full output)`,
      ...lines.slice(-TAIL_LINES),
    ].join('\n')
  }
  if (failed.length > 0) {
    for (const r of failed) {
      console.error(`\n========================================================`)
      console.error(`## FAIL  ${r.name}  (exit ${r.code}, ${fmtMs(r.ms)})`)
      console.error(`========================================================`)
      if (r.stdout) console.error(tail(r.stdout))
      if (r.stderr) console.error(tail(r.stderr))
    }
  }

  // Summary at the bottom so it's the first thing visible.
  console.error(`\n========================================================`)
  console.error(`Summary  (total ${fmtMs(performance.now() - total)})`)
  console.error(`========================================================`)
  for (const r of [...passed.sort((a, b) => a.ms - b.ms), ...failed]) {
    const tag = r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
    console.error(`  ${tag}  ${pad(r.name, 24)}  ${fmtMs(r.ms)}`)
  }
  console.error('')

  if (failed.length > 0) {
    console.error(`[verify] ${failed.length}/${CHECKS.length} check(s) failed.`)
    process.exit(1)
  }
  console.error(`[verify] All ${CHECKS.length} checks passed.`)
}

main().catch(err => {
  console.error('[verify] Unexpected error:', err)
  process.exit(2)
})
