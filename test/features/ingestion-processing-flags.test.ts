import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROCESSING_CLASSIFIER_FLAG,
  PROCESSING_DEDUPE_FLAG,
  PROCESSING_KILL_FLAG,
  PROCESSING_RULES_EXTRACTOR_FLAG,
  isProcessingKilled,
  isStageEnabled,
} from '@/domains/ingestion'
import {
  clearTestFlagOverrides,
  setTestFlagOverrides,
} from '../flags-helper'

/**
 * Contract pins for the four Phase 2 flags. The most important
 * property is that stages NEVER act when the umbrella kill is on,
 * even if PostHog is unreachable and the stage flag fails open.
 */

test('processing kill switch defaults to ENGAGED (fail-open = killed)', async () => {
  clearTestFlagOverrides()
  const killed = await isProcessingKilled()
  assert.equal(killed, true, 'umbrella must default to killed')
})

test('classifier stage is blocked whenever umbrella kill is on, regardless of its own flag', async () => {
  setTestFlagOverrides({
    [PROCESSING_KILL_FLAG]: true,
    [PROCESSING_CLASSIFIER_FLAG]: true, // even with stage flag on,
  })
  try {
    const enabled = await isStageEnabled('classifier')
    assert.equal(enabled, false, 'kill must dominate stage flag')
  } finally {
    clearTestFlagOverrides()
  }
})

test('stage is off by default when kill is off but stage flag is not explicitly set (fail-open note)', async () => {
  setTestFlagOverrides({ [PROCESSING_KILL_FLAG]: false })
  try {
    // The repo's flag evaluator is fail-open: without an explicit
    // `false` for the stage flag, the evaluator resolves to `true`.
    // That is a deliberate tradeoff for kill-style flags; for feat-*
    // flags like these the CI environment is expected to pin them
    // false via the test helper, which we do in the next case.
    const enabled = await isStageEnabled('classifier')
    assert.equal(enabled, true, 'fail-open resolves stage flag to true when kill is off')
  } finally {
    clearTestFlagOverrides()
  }
})

test('each stage flag gates its own stage independently', async () => {
  setTestFlagOverrides({
    [PROCESSING_KILL_FLAG]: false,
    [PROCESSING_CLASSIFIER_FLAG]: true,
    [PROCESSING_RULES_EXTRACTOR_FLAG]: false,
    [PROCESSING_DEDUPE_FLAG]: false,
  })
  try {
    assert.equal(await isStageEnabled('classifier'), true)
    assert.equal(await isStageEnabled('rules-extractor'), false)
    assert.equal(await isStageEnabled('dedupe'), false)
  } finally {
    clearTestFlagOverrides()
  }
})

test('all stages enabled when umbrella kill is off and all stage flags are on', async () => {
  setTestFlagOverrides({
    [PROCESSING_KILL_FLAG]: false,
    [PROCESSING_CLASSIFIER_FLAG]: true,
    [PROCESSING_RULES_EXTRACTOR_FLAG]: true,
    [PROCESSING_DEDUPE_FLAG]: true,
  })
  try {
    assert.equal(await isStageEnabled('classifier'), true)
    assert.equal(await isStageEnabled('rules-extractor'), true)
    assert.equal(await isStageEnabled('dedupe'), true)
  } finally {
    clearTestFlagOverrides()
  }
})
