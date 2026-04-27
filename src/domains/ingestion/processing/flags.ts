import { isFeatureEnabled, type FlagContext } from '@/lib/flags'
import { logger } from '@/lib/logger'

/**
 * Processing-layer flags for Phase 2.
 *
 * Umbrella kill + three stage flags. Each stage is independently
 * rollout-able; a stage can only act when BOTH the umbrella kill is
 * off AND its own stage flag is on.
 *
 * Kill semantics match Phase 1: PostHog flag `true` = "kill active".
 * Fail-open evaluator means a PostHog outage resolves to "killed",
 * which is the conservative default.
 */

export const PROCESSING_KILL_FLAG = 'kill-ingestion-processing'
export const PROCESSING_CLASSIFIER_FLAG = 'feat-ingestion-classifier'
export const PROCESSING_RULES_EXTRACTOR_FLAG = 'feat-ingestion-rules-extractor'
export const PROCESSING_DEDUPE_FLAG = 'feat-ingestion-dedupe'
// Phase 2.5: when on, the worker runs the local LLM (Ollama) before
// the rules extractor and uses its verdict if it succeeds. Falls back
// to rules on any LLM error. Independent stage gate so the operator
// can A/B test or roll back without touching `feat-ingestion-rules-extractor`.
export const PROCESSING_LLM_EXTRACTOR_FLAG = 'feat-ingestion-llm-extractor'

export type ProcessingStage =
  | 'classifier'
  | 'rules-extractor'
  | 'llm-extractor'
  | 'dedupe'

export interface ProcessingKillLogFields {
  correlationId?: string
  messageId?: string
  draftId?: string
  stage?: ProcessingStage
  jobKind?: string
}

export async function isProcessingKilled(
  ctx?: FlagContext,
  log?: ProcessingKillLogFields,
): Promise<boolean> {
  const killed = await isFeatureEnabled(PROCESSING_KILL_FLAG, ctx)
  if (killed) {
    logger.info('ingestion.processing.kill_switch_active', {
      flag: PROCESSING_KILL_FLAG,
      correlationId: log?.correlationId,
      messageId: log?.messageId,
      draftId: log?.draftId,
      stage: log?.stage,
      jobKind: log?.jobKind,
    })
  }
  return killed
}

const STAGE_TO_FLAG: Record<ProcessingStage, string> = {
  classifier: PROCESSING_CLASSIFIER_FLAG,
  'rules-extractor': PROCESSING_RULES_EXTRACTOR_FLAG,
  'llm-extractor': PROCESSING_LLM_EXTRACTOR_FLAG,
  dedupe: PROCESSING_DEDUPE_FLAG,
}

/**
 * Returns true when the stage is allowed to act:
 *   umbrella kill is OFF  AND  the stage's own feat flag is ON.
 *
 * Never resolve stage flag as "on" on PostHog outage — that would be
 * a fail-open feature enablement, which violates the gating policy.
 * We rely on `isFeatureEnabled`'s failopen semantics for readability
 * AND force the kill check to run first so an outage during PostHog
 * downtime never enables a stage that was off when the platform was
 * healthy.
 */
export async function isStageEnabled(
  stage: ProcessingStage,
  ctx?: FlagContext,
  log?: ProcessingKillLogFields,
): Promise<boolean> {
  const killed = await isProcessingKilled(ctx, { ...log, stage })
  if (killed) return false
  const flag = STAGE_TO_FLAG[stage]
  const stageEnabled = await isFeatureEnabled(flag, ctx)
  return stageEnabled
}
