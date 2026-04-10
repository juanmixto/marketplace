import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

type Matcher = {
  toBe: (expected: unknown) => void
  toBeDefined: () => void
  toBeFalsy: () => void
  toBeGreaterThan: (expected: number) => void
  toBeGreaterThanOrEqual: (expected: number) => void
  toBeInstanceOf: (expected: new (...args: any[]) => any) => void
  toBeLessThan: (expected: number) => void
  toBeLessThanOrEqual: (expected: number) => void
  toBeNull: () => void
  toBeTruthy: () => void
  toContain: (expected: string) => void
  not: {
    toBe: (expected: unknown) => void
    toBeNull: () => void
  }
}

function createMatchers(actual: unknown, negated = false): Matcher {
  const maybeNegate = (assertion: () => void) => {
    if (!negated) {
      assertion()
      return
    }

    assert.throws(assertion)
  }

  const matcher = {
    toBe(expected) {
      maybeNegate(() => assert.equal(actual, expected))
    },
    toBeDefined() {
      maybeNegate(() => assert.notEqual(actual, undefined))
    },
    toBeFalsy() {
      maybeNegate(() => assert.ok(!actual))
    },
    toBeGreaterThan(expected) {
      maybeNegate(() => assert.ok(Number(actual) > expected))
    },
    toBeGreaterThanOrEqual(expected) {
      maybeNegate(() => assert.ok(Number(actual) >= expected))
    },
    toBeInstanceOf(expected) {
      maybeNegate(() => assert.ok(actual instanceof expected))
    },
    toBeLessThan(expected) {
      maybeNegate(() => assert.ok(Number(actual) < expected))
    },
    toBeLessThanOrEqual(expected) {
      maybeNegate(() => assert.ok(Number(actual) <= expected))
    },
    toBeNull() {
      maybeNegate(() => assert.equal(actual, null))
    },
    toBeTruthy() {
      maybeNegate(() => assert.ok(actual))
    },
    toContain(expected) {
      maybeNegate(() => assert.ok(String(actual).includes(expected)))
    },
    not: {} as Matcher['not'],
  } satisfies Omit<Matcher, 'not'> & { not: Matcher['not'] }

  matcher.not = {
    toBe(expected) {
      createMatchers(actual, !negated).toBe(expected)
    },
    toBeNull() {
      createMatchers(actual, !negated).toBeNull()
    },
  }

  return matcher
}

export const beforeAll = before
export const afterAll = after
export const it = test

export function expect(actual: unknown): Matcher {
  return createMatchers(actual)
}

export { describe }
