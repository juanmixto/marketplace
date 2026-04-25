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

/**
 * Deep-equality assertion with a JSON-diff-style failure message (#327).
 *
 * node:test's `assert.deepStrictEqual` prints two giant object blobs
 * side-by-side on failure, which on anything non-trivial is unreadable.
 * `expectEqual` narrows the failure to exactly the paths that differ —
 * each printed as `path: actual ≠ expected`, which is what you want
 * when a 30-line fixture drifts by one field.
 *
 * Falls back to `deepStrictEqual` when one side isn't a plain object,
 * so primitive/Date/Buffer behaviour matches the stdlib.
 */
export function expectEqual<T>(actual: T, expected: T, message?: string): void {
  const a = actual as unknown
  const e = expected as unknown

  const structural =
    (isPlainRecord(a) && isPlainRecord(e)) ||
    (Array.isArray(a) && Array.isArray(e))
  if (!structural) {
    assert.deepStrictEqual(actual, expected, message)
    return
  }

  const diffs: string[] = []
  collectDiffs('', a, e, diffs)
  if (diffs.length === 0) return

  const header = message ? `${message}\n` : ''
  throw new assert.AssertionError({
    message: `${header}expectEqual: ${diffs.length} difference${diffs.length === 1 ? '' : 's'}\n${diffs.join('\n')}`,
    actual,
    expected,
    operator: 'expectEqual',
    stackStartFn: expectEqual,
  })
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

function collectDiffs(
  path: string,
  actual: unknown,
  expected: unknown,
  out: string[],
): void {
  if (Object.is(actual, expected)) return

  if (isPlainRecord(actual) && isPlainRecord(expected)) {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
    for (const key of keys) {
      const nextPath = path ? `${path}.${key}` : key
      if (!(key in actual)) {
        out.push(`+ ${nextPath}: <missing in actual> ≠ ${fmt(expected[key])}`)
        continue
      }
      if (!(key in expected)) {
        out.push(`- ${nextPath}: ${fmt(actual[key])} ≠ <missing in expected>`)
        continue
      }
      collectDiffs(nextPath, actual[key], expected[key], out)
    }
    return
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      out.push(`${path || '<root>'}: length ${actual.length} ≠ ${expected.length}`)
    }
    const max = Math.max(actual.length, expected.length)
    for (let i = 0; i < max; i += 1) {
      collectDiffs(`${path}[${i}]`, actual[i], expected[i], out)
    }
    return
  }

  out.push(`${path || '<root>'}: ${fmt(actual)} ≠ ${fmt(expected)}`)
}

function fmt(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value instanceof Date) return `Date(${value.toISOString()})`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
