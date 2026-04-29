#!/usr/bin/env node
/**
 * audit-image-sizes.mjs
 *
 * Companion to the deviceSizes/imageSizes tuning in #1051. Catches a
 * specific footgun: someone adds a new `<Image sizes="(min-width: 1700px)
 * 1500px, ..." ...>` to a component, but the Next.js `images.deviceSizes`
 * array tops out at 1600. The browser will request 1700-px-wide images
 * and Next will fall back to the next available variant (1600), shipping
 * an upscale-blurry hero on >1600 px screens until someone notices.
 *
 * What this audits:
 *
 *   1. Parses next.config.ts and extracts the `deviceSizes: [...]` array.
 *      Computes the max value as the device-size ceiling.
 *   2. Greps every `<Image ... sizes="...">` (and the SafeImage wrapper)
 *      across src/. For each `(min-width: NNNNpx)` or `(max-width: NNNNpx)`
 *      breakpoint, plus any bare `NNNNpx` slot value, asserts the number
 *      is <= the ceiling.
 *   3. Reports each conflict with file:line and exits 1.
 *
 * This audit is NOT ratchet-mode (no baseline). The ceiling is a single
 * config value — a violation means EITHER raise deviceSizes in
 * next.config.ts OR drop the breakpoint in the component. Both are
 * cheap, both are intentional decisions, no reason to tolerate drift.
 *
 * Usage:
 *   node scripts/audit-image-sizes.mjs            # CI mode
 *   node scripts/audit-image-sizes.mjs --json     # machine-readable
 *   node scripts/audit-image-sizes.mjs --soft     # never exit non-zero
 *
 * Exit codes:
 *   0 — no conflicts
 *   1 — at least one `sizes` declares a breakpoint above the ceiling
 *   2 — could not parse next.config.ts (config drift)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const NEXT_CONFIG = join(ROOT, 'next.config.ts')
const SRC = join(ROOT, 'src')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')

function parseDeviceSizes() {
  const src = readFileSync(NEXT_CONFIG, 'utf8')
  // Match `deviceSizes: [n, n, ...]` (allowing whitespace/newlines).
  const m = src.match(/deviceSizes\s*:\s*\[([^\]]+)\]/)
  if (!m) return null
  const nums = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
  if (nums.length === 0) return null
  return nums
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      // Skip generated / vendored output. Mirrors the carve-outs the
      // other audit scripts use implicitly via src/ scoping.
      if (name === 'node_modules' || name === '.next' || name === 'dist') continue
      yield* walk(full)
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      yield full
    }
  }
}

// Capture every `sizes="..."` literal. We do NOT try to be too clever
// about JSX context — false positives are vanishingly rare because the
// `sizes` prop is unique to <Image>/<source>/<link rel=preload>, and all
// of those want the same invariant (no breakpoint above the ceiling).
const SIZES_RE = /\bsizes\s*=\s*"([^"]+)"/g

function checkSizesValue(value, ceiling) {
  // Pull every NNNNpx token (covers `(min-width: 1700px) ...` AND bare
  // slot widths like `200px`). vw/% values are responsive — they scale
  // with the viewport, not against the deviceSizes ceiling.
  const conflicts = []
  const PX_RE = /(\d{3,5})px/g
  let m
  while ((m = PX_RE.exec(value)) != null) {
    const n = Number.parseInt(m[1], 10)
    if (Number.isFinite(n) && n > ceiling) {
      conflicts.push(n)
    }
  }
  return conflicts
}

function audit() {
  const deviceSizes = parseDeviceSizes()
  if (!deviceSizes) {
    return { error: 'could-not-parse-deviceSizes', deviceSizes: null, ceiling: null, violations: [] }
  }
  const ceiling = Math.max(...deviceSizes)
  const violations = []
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8')
    SIZES_RE.lastIndex = 0
    let m
    while ((m = SIZES_RE.exec(src)) != null) {
      const value = m[1]
      const conflicts = checkSizesValue(value, ceiling)
      if (conflicts.length === 0) continue
      // Resolve the line number by counting newlines up to the match.
      const line = src.slice(0, m.index).split('\n').length
      violations.push({
        file: relative(ROOT, file),
        line,
        sizes: value,
        breakpoints: conflicts,
        ceiling,
      })
    }
  }
  return { error: null, deviceSizes, ceiling, violations }
}

const result = audit()

if (result.error) {
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    process.stderr.write(
      `audit-image-sizes: could not parse images.deviceSizes from next.config.ts.\n` +
        `  Either the array literal moved, or its shape changed (multiline / spread / dynamic).\n` +
        `  This audit only handles the static literal form — adjust the regex if intentional.\n`,
    )
  }
  if (!SOFT) process.exit(2)
  process.exit(0)
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} else {
  for (const v of result.violations) {
    process.stdout.write(`\n[sizes-exceeds-deviceSizes-ceiling] ${v.file}:${v.line}\n`)
    process.stdout.write(
      `  sizes="${v.sizes}" declares ${v.breakpoints.join(', ')} px, but max(deviceSizes) = ${v.ceiling}.\n` +
        `  Either drop the breakpoint, or raise deviceSizes in next.config.ts (and invalidate /_next/image cache).\n`,
    )
  }
  if (result.violations.length === 0) {
    process.stdout.write(
      `audit-image-sizes: clean (deviceSizes ceiling = ${result.ceiling} px, ` +
        `${result.deviceSizes.join('/')}).\n`,
    )
  } else {
    process.stdout.write(
      `\naudit-image-sizes: ${result.violations.length} conflict(s) above deviceSizes ceiling = ${result.ceiling} px.\n`,
    )
  }
}

if (result.violations.length > 0 && !SOFT) process.exit(1)
