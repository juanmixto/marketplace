import test from 'node:test'
import assert from 'node:assert/strict'
import {
  reviewNudgeIntensity,
  shouldShowOrderPill,
  shouldShowHubBanner,
  REVIEW_NUDGE_FRESH_DAYS,
  REVIEW_NUDGE_STALE_DAYS,
} from '@/domains/reviews/nudge-window'

const NOW = new Date('2026-04-30T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000)

// ─── reviewNudgeIntensity ────────────────────────────────────────────────────

test('orders within the fresh window are "fresh"', () => {
  assert.equal(reviewNudgeIntensity(daysAgo(0), NOW), 'fresh')
  assert.equal(reviewNudgeIntensity(daysAgo(1), NOW), 'fresh')
  assert.equal(reviewNudgeIntensity(daysAgo(REVIEW_NUDGE_FRESH_DAYS), NOW), 'fresh')
})

test('orders past fresh but within stale boundary are "faded"', () => {
  assert.equal(reviewNudgeIntensity(daysAgo(REVIEW_NUDGE_FRESH_DAYS + 1), NOW), 'faded')
  assert.equal(reviewNudgeIntensity(daysAgo(20), NOW), 'faded')
  assert.equal(reviewNudgeIntensity(daysAgo(REVIEW_NUDGE_STALE_DAYS), NOW), 'faded')
})

test('orders beyond the stale boundary are "stale"', () => {
  assert.equal(reviewNudgeIntensity(daysAgo(REVIEW_NUDGE_STALE_DAYS + 1), NOW), 'stale')
  assert.equal(reviewNudgeIntensity(daysAgo(60), NOW), 'stale')
  assert.equal(reviewNudgeIntensity(daysAgo(365), NOW), 'stale')
})

test('reviewNudgeIntensity accepts ISO strings', () => {
  assert.equal(reviewNudgeIntensity(daysAgo(2).toISOString(), NOW), 'fresh')
})

// ─── shouldShowOrderPill ─────────────────────────────────────────────────────

test('shouldShowOrderPill returns true for fresh and faded, false for stale', () => {
  assert.equal(shouldShowOrderPill(daysAgo(5), NOW), true)
  assert.equal(shouldShowOrderPill(daysAgo(20), NOW), true)
  assert.equal(shouldShowOrderPill(daysAgo(40), NOW), false)
})

// ─── shouldShowHubBanner ─────────────────────────────────────────────────────

test('hub banner shows when at least one pending order is fresh', () => {
  assert.equal(shouldShowHubBanner([daysAgo(2), daysAgo(60)], NOW), true)
})

test('hub banner hides when every pending order is in the faded window', () => {
  // Two orders, both > 14d but < 30d → faded → no banner. The buyer can
  // still find the orders via the "Por valorar" tab.
  assert.equal(shouldShowHubBanner([daysAgo(20), daysAgo(25)], NOW), false)
})

test('hub banner hides when there are no pending orders at all', () => {
  assert.equal(shouldShowHubBanner([], NOW), false)
})

test('hub banner hides when every pending order is stale', () => {
  assert.equal(shouldShowHubBanner([daysAgo(60), daysAgo(120)], NOW), false)
})
