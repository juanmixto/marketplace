import test from 'node:test'
import assert from 'node:assert/strict'
import { generateCorrelationId } from '@/lib/correlation'

test('generateCorrelationId: returns unique values in a tight loop', () => {
  const ids = new Set<string>()
  for (let i = 0; i < 1000; i += 1) {
    ids.add(generateCorrelationId())
  }
  // We don't require perfect uniqueness (same-ms collisions can collapse
  // on the random suffix), but 1000 draws must not collapse to < 990.
  assert.ok(ids.size > 990, `expected near-uniqueness, got ${ids.size} unique of 1000`)
})

test('generateCorrelationId: matches expected base36-tsPrefix + dash + 6 chars shape', () => {
  const id = generateCorrelationId()
  assert.match(id, /^[0-9a-z]+-[0-9a-f]{6}$/, `unexpected shape: ${id}`)
})

test('generateCorrelationId: sorts chronologically when timestamps differ', async () => {
  const first = generateCorrelationId()
  await new Promise<void>((resolve) => setTimeout(resolve, 5))
  const second = generateCorrelationId()
  // Both start with the base36 ms timestamp, so string comparison matches
  // chronological order when the timestamps differ.
  assert.ok(first < second, `expected ${first} < ${second}`)
})
