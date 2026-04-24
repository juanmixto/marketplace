import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONFIDENCE_BAND_THRESHOLDS,
  ConfidenceRangeError,
  confidenceBandFor,
  normaliseConfidence,
} from '@/domains/ingestion'

/**
 * Frozen contract: Phase 2 picks these bands, and Phase 2.5 (LLM)
 * must respect them. Any shift to the thresholds is a cross-phase
 * breaking change, not a silent drift.
 */

test('confidenceBandFor: HIGH band starts at 0.80 (inclusive)', () => {
  assert.equal(confidenceBandFor(1), 'HIGH')
  assert.equal(confidenceBandFor(0.95), 'HIGH')
  assert.equal(confidenceBandFor(0.8), 'HIGH')
})

test('confidenceBandFor: MEDIUM band is [0.50, 0.80)', () => {
  assert.equal(confidenceBandFor(0.79), 'MEDIUM')
  assert.equal(confidenceBandFor(0.65), 'MEDIUM')
  assert.equal(confidenceBandFor(0.5), 'MEDIUM')
})

test('confidenceBandFor: LOW band is < 0.50', () => {
  assert.equal(confidenceBandFor(0.49), 'LOW')
  assert.equal(confidenceBandFor(0.25), 'LOW')
  assert.equal(confidenceBandFor(0), 'LOW')
})

test('confidenceBandFor: rejects NaN and out-of-range values (loud failure)', () => {
  assert.throws(() => confidenceBandFor(Number.NaN), ConfidenceRangeError)
  assert.throws(() => confidenceBandFor(-0.01), ConfidenceRangeError)
  assert.throws(() => confidenceBandFor(1.01), ConfidenceRangeError)
})

test('threshold constants are frozen at 0.80 HIGH / 0.50 MEDIUM', () => {
  assert.equal(CONFIDENCE_BAND_THRESHOLDS.HIGH_MIN, 0.8)
  assert.equal(CONFIDENCE_BAND_THRESHOLDS.MEDIUM_MIN, 0.5)
})

test('normaliseConfidence clamps to [0,1] and rounds to 2 decimals', () => {
  assert.equal(normaliseConfidence(0.123456), 0.12)
  assert.equal(normaliseConfidence(0.125), 0.13) // banker's rounds up
  assert.equal(normaliseConfidence(-1), 0)
  assert.equal(normaliseConfidence(2), 1)
  assert.throws(() => normaliseConfidence(Number.NaN), ConfidenceRangeError)
})
