import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { PROTECTED_PREFIXES } from '@/proxy'

/**
 * Issue #420: the edge proxy gates authenticated routes via
 * PROTECTED_PREFIXES. If a developer adds a new authenticated route
 * group under src/app/(buyer)/, /(vendor)/ or /(admin)/ but forgets
 * to add the matching prefix to that constant, the route renders
 * publicly until the missing line is noticed.
 *
 * This structural test walks the route groups at runtime and asserts
 * every top-level segment underneath maps to a prefix in PROTECTED_PREFIXES.
 * Conservative on purpose: only top-level segments, only the three known
 * authenticated groups, only directories.
 */

const APP_ROOT = path.join(process.cwd(), 'src', 'app')

const AUTHENTICATED_GROUPS = ['(buyer)', '(vendor)', '(admin)'] as const

function readSubdirs(dir: string): string[] {
  return readdirSync(dir).filter(name => {
    const full = path.join(dir, name)
    try {
      return statSync(full).isDirectory()
    } catch {
      return false
    }
  })
}

test('every top-level segment under (buyer)/(vendor)/(admin) is covered by PROTECTED_PREFIXES', () => {
  const missing: Array<{ group: string; segment: string; expectedPrefix: string }> = []

  for (const group of AUTHENTICATED_GROUPS) {
    const groupDir = path.join(APP_ROOT, group)
    let segments: string[]
    try {
      segments = readSubdirs(groupDir)
    } catch {
      // Group folder doesn't exist — that's a refactor, not a security gap.
      continue
    }

    for (const segment of segments) {
      const expectedPrefix = `/${segment}`
      const covered = PROTECTED_PREFIXES.some(
        p => p === expectedPrefix || expectedPrefix.startsWith(`${p}/`),
      )
      if (!covered) {
        missing.push({ group, segment, expectedPrefix })
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `New authenticated route segment(s) detected with no matching entry in
PROTECTED_PREFIXES (src/proxy.ts). Either add the prefix there, or move
the route out of the authenticated group. Missing:\n` +
      missing
        .map(m => `  - ${m.group}/${m.segment} → expected prefix "${m.expectedPrefix}"`)
        .join('\n'),
  )
})

test('PROTECTED_PREFIXES contains only top-level segments (sanity)', () => {
  for (const prefix of PROTECTED_PREFIXES) {
    assert.match(prefix, /^\/[a-z][a-z0-9-]*$/, `unexpected prefix shape: ${prefix}`)
  }
})

test('PROTECTED_PREFIXES is non-empty and includes the canonical 5 segments', () => {
  // Pin the current expected set so a removal is loud, not silent.
  const expected = ['/admin', '/vendor', '/carrito', '/checkout', '/cuenta']
  for (const required of expected) {
    assert.ok(
      (PROTECTED_PREFIXES as readonly string[]).includes(required),
      `PROTECTED_PREFIXES is missing "${required}". If this prefix has been intentionally retired, update this test alongside the change.`,
    )
  }
})
