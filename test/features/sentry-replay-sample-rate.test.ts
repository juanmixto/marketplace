import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isMobileUserAgent,
  loadReplayRateConfig,
  pickOnErrorSampleRate,
} from '@/lib/sentry/replay-sample-rate'

/**
 * Issue #1222 (epic #1225 — observability pre-launch).
 *
 * UA classifier + rate selector for Sentry on-error replay sampling.
 * Mobile (priority surface per AGENTS.md) gets 50%, desktop 25%.
 *
 * The classifier runs on every Sentry init in every page load, so
 * this suite is the cheap rail that catches a regression before the
 * higher-cost browser-level test that lives in the e2e suite.
 */

// ─── isMobileUserAgent ───────────────────────────────────────────────────────

test('isMobileUserAgent flags Android phones', () => {
  // Real Chrome-on-Pixel UA shape.
  assert.equal(
    isMobileUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    ),
    true,
  )
})

test('isMobileUserAgent flags iPhone Safari', () => {
  assert.equal(
    isMobileUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ),
    true,
  )
})

test('isMobileUserAgent flags iPad (legacy + iPadOS Safari)', () => {
  // Pre-iPadOS-13 explicit iPad UA.
  assert.equal(
    isMobileUserAgent(
      'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1',
    ),
    true,
  )
  // iPadOS 13+ "desktop mode" still carries `Mobile` somewhere.
  assert.equal(
    isMobileUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 Mobile/15E148 (KHTML, like Gecko) Version/14.0',
    ),
    true,
  )
})

test('isMobileUserAgent flags Android tablets', () => {
  // Android tablets often omit `Mobi` but keep `Android`.
  assert.equal(
    isMobileUserAgent(
      'Mozilla/5.0 (Linux; Android 13; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ),
    true,
  )
})

test('isMobileUserAgent rejects desktop Chrome (Windows)', () => {
  assert.equal(
    isMobileUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ),
    false,
  )
})

test('isMobileUserAgent rejects desktop Firefox (Linux)', () => {
  assert.equal(
    isMobileUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
    ),
    false,
  )
})

test('isMobileUserAgent rejects desktop Safari (Mac, no Mobile token)', () => {
  assert.equal(
    isMobileUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    ),
    false,
  )
})

test('isMobileUserAgent treats null / empty as desktop (defensive)', () => {
  assert.equal(isMobileUserAgent(null), false)
  assert.equal(isMobileUserAgent(undefined), false)
  assert.equal(isMobileUserAgent(''), false)
})

// ─── pickOnErrorSampleRate ───────────────────────────────────────────────────

test('pickOnErrorSampleRate returns mobile rate for mobile UA', () => {
  assert.equal(
    pickOnErrorSampleRate('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0…)', {
      mobile: 0.5,
      desktop: 0.25,
    }),
    0.5,
  )
})

test('pickOnErrorSampleRate returns desktop rate for desktop UA', () => {
  assert.equal(
    pickOnErrorSampleRate(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      { mobile: 0.5, desktop: 0.25 },
    ),
    0.25,
  )
})

// ─── loadReplayRateConfig ────────────────────────────────────────────────────

test('loadReplayRateConfig defaults to 0.5 mobile / 0.25 desktop', () => {
  const r = loadReplayRateConfig({})
  assert.deepEqual(r, { mobile: 0.5, desktop: 0.25 })
})

test('loadReplayRateConfig honours per-UA env overrides', () => {
  const r = loadReplayRateConfig({
    SENTRY_REPLAYS_ONERROR_SAMPLE_RATE_MOBILE: '1',
    SENTRY_REPLAYS_ONERROR_SAMPLE_RATE_DESKTOP: '0.1',
  })
  assert.deepEqual(r, { mobile: 1, desktop: 0.1 })
})

test('loadReplayRateConfig falls back to legacy SENTRY_REPLAYS_ONERROR_SAMPLE_RATE for mobile when the new var is absent', () => {
  const r = loadReplayRateConfig({
    SENTRY_REPLAYS_ONERROR_SAMPLE_RATE: '0.7',
  })
  // Mobile picks up the legacy value; desktop stays at the default.
  assert.deepEqual(r, { mobile: 0.7, desktop: 0.25 })
})

test('loadReplayRateConfig clamps a typo "50" to 1.0 (defence-in-depth)', () => {
  // Operator typed "50" expecting 50% — without clamp the SDK would
  // try to sample 5000% which is undefined behaviour. Clamp keeps
  // it bounded at "always sample".
  const r = loadReplayRateConfig({
    SENTRY_REPLAYS_ONERROR_SAMPLE_RATE_MOBILE: '50',
  })
  assert.equal(r.mobile, 1)
})

test('loadReplayRateConfig clamps negative / NaN to 0', () => {
  const r = loadReplayRateConfig({
    SENTRY_REPLAYS_ONERROR_SAMPLE_RATE_MOBILE: '-0.3',
    SENTRY_REPLAYS_ONERROR_SAMPLE_RATE_DESKTOP: 'not-a-number',
  })
  assert.deepEqual(r, { mobile: 0, desktop: 0 })
})
