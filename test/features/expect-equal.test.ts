import assert from 'node:assert/strict'
import { describe, expectEqual, it } from '../test-helpers'

describe('expectEqual (#327)', () => {
  it('passes on deeply equal objects', () => {
    expectEqual({ a: 1, nested: { b: [2, 3] } }, { a: 1, nested: { b: [2, 3] } })
  })

  it('falls back to deepStrictEqual for primitives', () => {
    expectEqual(1, 1)
    expectEqual('x', 'x')
    expectEqual(null, null)
    assert.throws(() => expectEqual(1, 2))
  })

  it('reports each differing path with ≠ separator', () => {
    let caught: Error | null = null
    try {
      expectEqual(
        { a: 1, nested: { b: 2, c: 3 } },
        { a: 1, nested: { b: 99, c: 3 } },
      )
    } catch (err) {
      caught = err as Error
    }
    assert.ok(caught, 'expected failure')
    assert.match(caught!.message, /nested\.b: 2 ≠ 99/)
    assert.doesNotMatch(caught!.message, /nested\.c/, 'equal paths should not appear')
  })

  it('flags missing keys explicitly', () => {
    let caught: Error | null = null
    try {
      expectEqual({ a: 1 }, { a: 1, b: 2 } as unknown as { a: number })
    } catch (err) {
      caught = err as Error
    }
    assert.ok(caught, 'expected failure')
    assert.match(caught!.message, /\+ b: <missing in actual> ≠ 2/)
  })

  it('diffs arrays by index and flags length mismatch', () => {
    let caught: Error | null = null
    try {
      expectEqual([1, 2, 3], [1, 9, 3, 4])
    } catch (err) {
      caught = err as Error
    }
    assert.ok(caught, 'expected failure')
    assert.match(caught!.message, /length 3 ≠ 4/)
    assert.match(caught!.message, /\[1\]: 2 ≠ 9/)
  })

  it('prefixes a user message when provided', () => {
    assert.throws(
      () => expectEqual({ a: 1 }, { a: 2 }, 'order snapshot mismatch'),
      /order snapshot mismatch[\s\S]*a: 1 ≠ 2/,
    )
  })
})
