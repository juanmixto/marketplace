import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isIngestionKilled,
  isIngestionAdminEnabled,
  INGESTION_KILL_FLAG,
  INGESTION_ADMIN_FEATURE_FLAG,
} from '@/domains/ingestion'
import {
  setTestFlagOverrides,
  clearTestFlagOverrides,
} from '../flags-helper'

test('ingestion kill switch is ENGAGED by default (fail-open is kill)', async () => {
  // No override, no PostHog configured in tests → fail-open returns true.
  // For `kill-ingestion-telegram` that equals "killed", which is what we
  // want during a PostHog outage.
  clearTestFlagOverrides()
  const killed = await isIngestionKilled()
  assert.equal(killed, true, 'subsystem must default to killed')
})

test('kill-ingestion-telegram=false turns the subsystem on', async () => {
  setTestFlagOverrides({ [INGESTION_KILL_FLAG]: false })
  try {
    const killed = await isIngestionKilled({ userId: 'u_admin' })
    assert.equal(killed, false)
  } finally {
    clearTestFlagOverrides()
  }
})

test('feat-ingestion-admin is OFF by default', async () => {
  clearTestFlagOverrides()
  // Fail-open also returns true here if PostHog is absent, so we must
  // pin the override to guarantee the "off" reading in tests.
  setTestFlagOverrides({ [INGESTION_ADMIN_FEATURE_FLAG]: false })
  try {
    const enabled = await isIngestionAdminEnabled()
    assert.equal(enabled, false)
  } finally {
    clearTestFlagOverrides()
  }
})

test('feat-ingestion-admin=true exposes the admin surface', async () => {
  setTestFlagOverrides({ [INGESTION_ADMIN_FEATURE_FLAG]: true })
  try {
    const enabled = await isIngestionAdminEnabled({ role: 'ADMIN_OPS' })
    assert.equal(enabled, true)
  } finally {
    clearTestFlagOverrides()
  }
})
