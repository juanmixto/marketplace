#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const srcRoot = path.join(repoRoot, 'src')
const registryPath = path.join(repoRoot, 'config', 'feature-flag-cleanup.json')

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(absolute, out)
      continue
    }
    if (entry.isFile() && (absolute.endsWith('.ts') || absolute.endsWith('.tsx'))) {
      out.push(absolute)
    }
  }
  return out
}

function collectFeatFlags() {
  const files = walk(srcRoot)
  const flags = new Set()
  const pattern = /['"`](feat-[a-z0-9-]+)['"`]/g

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(pattern)) {
      flags.add(match[1])
    }
  }

  return [...flags].sort()
}

function isValidDate(value) {
  if (typeof value !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function main() {
  if (!fs.existsSync(registryPath)) {
    console.error('Missing cleanup registry:', path.relative(repoRoot, registryPath))
    process.exit(1)
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
  const activeFlags = collectFeatFlags()

  const errors = []

  for (const flag of activeFlags) {
    const row = registry[flag]
    if (!row) {
      errors.push(`${flag}: missing entry in config/feature-flag-cleanup.json`)
      continue
    }

    if (!Number.isInteger(row.issue) || row.issue <= 0) {
      errors.push(`${flag}: issue must be a positive integer`)
    }

    if (typeof row.owner !== 'string' || row.owner.trim().length === 0) {
      errors.push(`${flag}: owner must be a non-empty string`)
    }

    if (!isValidDate(row.dueDate)) {
      errors.push(`${flag}: dueDate must use YYYY-MM-DD`)
    }
  }

  const staleRegistryEntries = Object.keys(registry)
    .filter((flag) => flag.startsWith('feat-'))
    .filter((flag) => !activeFlags.includes(flag))

  console.log('Feature flag cleanup audit')
  console.log('- active feat-* flags:', activeFlags.length)
  console.log('- registry entries:', Object.keys(registry).length)

  if (staleRegistryEntries.length > 0) {
    console.log('- stale registry entries:', staleRegistryEntries.join(', '))
  }

  if (errors.length > 0) {
    console.error('\nAudit failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exit(1)
  }

  console.log('\nAudit passed.')
}

main()
