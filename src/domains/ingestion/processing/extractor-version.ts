/**
 * Extractor-version contract.
 *
 * Every extraction (rules today, LLM in Phase 2.5) stamps its output
 * with an `extractorVersion` string. The database idempotency key
 * `(messageId, extractorVersion)` on `IngestionExtractionResult` and
 * `(sourceMessageId, extractorVersion, productOrdinal)` on
 * `IngestionProductDraft` make re-runs at the same version a strict
 * no-op. Bumping the version creates a new revision row and leaves
 * historical rows untouched — no corruption, no silent replacement.
 *
 * Versioning policy:
 *
 *   - Shape: `"<engine>-<semver>"`.
 *   - Bump `patch` for rule tweaks with no shape change (e.g. a new
 *     unit alias). Same payload shape, possibly different values.
 *   - Bump `minor` for new rules that can extract fields previously
 *     left `null`.
 *   - Bump `major` when the `ExtractionPayload` schema changes —
 *     requires a new Zod freeze test fixture.
 *
 * The current version lives here so tests and handlers share one
 * source of truth.
 */

export const CURRENT_RULES_EXTRACTOR_VERSION = 'rules-1.2.0'

export function isRulesExtractorVersion(version: string): boolean {
  return version.startsWith('rules-')
}

/** Reserved for Phase 2.5. Never produced by rules code. */
export function isLlmExtractorVersion(version: string): boolean {
  return version.startsWith('llm-')
}
