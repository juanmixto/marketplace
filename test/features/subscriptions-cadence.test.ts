import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceByCadence,
  computeFirstDeliveryAt,
  computeCurrentPeriodEnd,
  isBeforeCutoff,
} from '@/domains/subscriptions/cadence'

/**
 * Pure unit tests for the cadence helpers used by the phase 4a buyer
 * subscription flow. No DB, no clock patching — every test builds its own
 * Date instances.
 */

const monday    = new Date('2026-04-13T10:00:00Z') // 2026-04-13 is a Monday (day 1)
const wednesday = new Date('2026-04-15T10:00:00Z') // day 3

test('advanceByCadence WEEKLY adds 7 days', () => {
  const result = advanceByCadence(monday, 'WEEKLY')
  assert.equal(result.toISOString(), '2026-04-20T10:00:00.000Z')
})

test('advanceByCadence BIWEEKLY adds 14 days', () => {
  const result = advanceByCadence(monday, 'BIWEEKLY')
  assert.equal(result.toISOString(), '2026-04-27T10:00:00.000Z')
})

test('advanceByCadence MONTHLY adds 30 days (phase 4a approximation)', () => {
  const result = advanceByCadence(monday, 'MONTHLY')
  assert.equal(result.toISOString(), '2026-05-13T10:00:00.000Z')
})

test('computeFirstDeliveryAt lands one full cadence after creation', () => {
  const created = new Date('2026-04-14T12:00:00Z')
  assert.equal(
    computeFirstDeliveryAt(created, 'WEEKLY').toISOString(),
    '2026-04-21T12:00:00.000Z'
  )
})

test('computeCurrentPeriodEnd walks the delivery one cadence forward', () => {
  const next = new Date('2026-04-20T10:00:00Z')
  assert.equal(
    computeCurrentPeriodEnd(next, 'WEEKLY').toISOString(),
    '2026-04-27T10:00:00.000Z'
  )
})

test('isBeforeCutoff returns true when today is earlier than cutoff day of the delivery week', () => {
  // Next delivery: Monday 2026-04-20. Cutoff: Friday (5). Today: Wednesday
  // 2026-04-15 (before the Friday 2026-04-17 cutoff) → allowed.
  const nextDelivery = new Date('2026-04-20T10:00:00Z')
  const now = wednesday
  assert.equal(isBeforeCutoff(now, nextDelivery, 5), true)
})

test('isBeforeCutoff returns false when today is past the cutoff day of the delivery week', () => {
  // Next delivery: Monday 2026-04-20. Cutoff: Friday (5) → 2026-04-17.
  // Today: Saturday 2026-04-18 → past cutoff.
  const nextDelivery = new Date('2026-04-20T10:00:00Z')
  const now = new Date('2026-04-18T10:00:00Z')
  assert.equal(isBeforeCutoff(now, nextDelivery, 5), false)
})

test('isBeforeCutoff treats the cutoff day itself as still-actionable until end of day', () => {
  const nextDelivery = new Date('2026-04-20T10:00:00Z')
  // Cutoff Friday (5) → 2026-04-17. Noon on that day → still allowed.
  const friday = new Date('2026-04-17T12:00:00Z')
  assert.equal(isBeforeCutoff(friday, nextDelivery, 5), true)
})

test('isBeforeCutoff returns false once the delivery itself has already happened', () => {
  const nextDelivery = new Date('2026-04-20T10:00:00Z')
  const afterDelivery = new Date('2026-04-20T11:00:00Z')
  assert.equal(isBeforeCutoff(afterDelivery, nextDelivery, 5), false)
})

test('isBeforeCutoff with same-day cutoff locks at the end of the delivery day', () => {
  // Cutoff Monday (1), next delivery also Monday 2026-04-20. The rule is:
  // you can act on the morning of the delivery until end of day.
  const nextDelivery = new Date('2026-04-20T10:00:00Z')
  const earlyMorning = new Date('2026-04-20T06:00:00Z')
  // Same-day cutoff: 2026-04-20 end of day (23:59:59.999 UTC). 06:00 is
  // before that, AND it's before the delivery time of 10:00 → allowed.
  assert.equal(isBeforeCutoff(earlyMorning, nextDelivery, 1), true)
})
