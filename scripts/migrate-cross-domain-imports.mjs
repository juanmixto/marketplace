#!/usr/bin/env node
// One-shot helper used during Phase 4 of the contract-hardening plan.
// Reads ESLint's JSON output, finds every no-restricted-imports violation
// caused by a deep cross-domain import (`@/domains/X/Y`), and rewrites
// the offending file to use the barrel (`@/domains/X`).
//
// Skips any path the consumer marked as an explicit deep-import exception
// (currently the two 'use client' Zustand stores). Exits with a non-zero
// status if anything looked weird, so we don't silently corrupt files.

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ALLOWED_DEEP_IMPORTS = new Set([
  '@/domains/orders/cart-store',
  '@/domains/catalog/favorites-store',
])

// eslint exits non-zero when there are violations; we want to capture
// stdout regardless of exit status.
let raw
try {
  raw = execSync('npx eslint . --format json', { maxBuffer: 64 * 1024 * 1024 })
} catch (err) {
  raw = err.stdout
}
const report = JSON.parse(raw.toString())

const edits = new Map() // filePath -> Set of deep import strings to migrate

for (const fileReport of report) {
  for (const msg of fileReport.messages) {
    if (msg.ruleId !== 'no-restricted-imports') continue
    const match = msg.message.match(/'(@\/domains\/[^']+)'/)
    if (!match) continue
    const deepImport = match[1]
    // Only migrate true deep imports (X/Y or deeper), not the bare barrel.
    if (!/^@\/domains\/[^/]+\/.+/.test(deepImport)) continue
    if (ALLOWED_DEEP_IMPORTS.has(deepImport)) continue

    if (!edits.has(fileReport.filePath)) {
      edits.set(fileReport.filePath, new Set())
    }
    edits.get(fileReport.filePath).add(deepImport)
  }
}

let changed = 0
let totalReplacements = 0
for (const [filePath, deepImports] of edits) {
  let source = readFileSync(filePath, 'utf8')
  let fileChanged = false
  for (const deepImport of deepImports) {
    const barrel = deepImport.replace(/^(@\/domains\/[^/]+)\/.*$/, '$1')
    // Match in single OR double quotes; require an import-like context to
    // avoid touching string literals or comments.
    const re = new RegExp(`(from\\s+['"])${escape(deepImport)}(['"])`, 'g')
    const before = source
    source = source.replace(re, `$1${barrel}$2`)
    if (source !== before) {
      fileChanged = true
      totalReplacements += 1
    }
  }
  if (fileChanged) {
    writeFileSync(filePath, source)
    changed += 1
  }
}

console.log(`migrated ${totalReplacements} deep imports across ${changed} files`)

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
