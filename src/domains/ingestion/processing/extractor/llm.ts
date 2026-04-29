import { z } from 'zod'
import { ollamaGenerateJson } from '@/lib/llm/ollama'
import { logger } from '@/lib/logger'
import {
  EXTRACTION_SCHEMA_VERSION,
  type ExtractionPayload,
  type ExtractedProduct,
  type ExtractionVendorHint,
} from './schema'
import type { ClassifierResult, MessageClass } from '../classifier/rules'

/**
 * Phase 2.5 LLM extractor.
 *
 * One round-trip to a local LLM produces both:
 *   - the classifier verdict (what kind of message is this), and
 *   - the extracted vendor identity + product hints,
 * mapped into the same `ExtractionPayload` + `ClassifierResult` shapes
 * the rules pipeline already speaks. This way the drafts builder, the
 * review queue, and the dedupe pass all stay untouched.
 *
 * Why combined: rules-only ran classifier and extractor as two passes
 * because each used cheap deterministic regex. With an LLM, asking the
 * same model twice doubles the token cost and the latency. One JSON
 * response with both decisions is the right shape.
 *
 * Why local-only: the Phase 2.5 design explicitly trades off API-grade
 * accuracy for zero recurring cost and offline operation. The Ollama
 * defaults below were benchmarked on `qwen2.5:3b` against 12 hand-
 * labelled messages from the live "AGRICULTOR A CONSUMIDOR" group
 * (92 % accuracy, avg 5.5 s / msg on CPU). Bigger models were slower
 * and *less* accurate on the borderline cases — the prompt below is
 * tuned around the 3B sweet spot.
 */

const LOG_SCOPE = 'ingestion.processing.extractor.llm'

// Bumping this string is a contract change: every existing extraction
// row keyed on `(messageId, extractorVersion)` is preserved, but
// re-runs of the worker against the same message will now create a
// second row instead of dedupe-skipping. Use semver-ish suffixes to
// keep the relation between schema/prompt revisions traceable.
export const CURRENT_LLM_EXTRACTOR_VERSION = 'llm-qwen2.5-3b-v1'
export const DEFAULT_LLM_MODEL = 'qwen2.5:3b'

// ─── LLM-side schema (loose) ─────────────────────────────────────────

/**
 * The shape we *ask* the model for. Loose because we don't trust the
 * model to hit our internal types exactly — we coerce afterwards.
 */
const llmKindSchema = z.enum([
  'VENDOR_OFFERING',
  'BUYER_QUERY',
  'DISCUSSION',
  'QUESTION_ANSWER',
  'SPAM',
  'OTHER',
])

const llmCategorySchema = z.enum([
  'fruta',
  'verdura',
  'aceite',
  'miel',
  'huevos',
  'lacteos',
  'carne',
  'embutido',
  'pescado',
  'mariscos',
  'conservas',
  'frutos_secos',
  'cereales',
  'legumbres',
  'pan',
  'vino',
  'cerveza',
  'cafe',
  'cosmetica',
  'otro',
])

const llmProductSchema = z.object({
  product_hint: z.string().min(1),
  category_hint: llmCategorySchema.nullable(),
  has_price_signal: z.boolean(),
  has_contact_signal: z.boolean(),
})

const llmResponseSchema = z.object({
  kind: llmKindSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().max(400),
  vendor_offers: z.array(llmProductSchema),
})

type LlmResponse = z.infer<typeof llmResponseSchema>

// ─── Prompt ──────────────────────────────────────────────────────────

// The exact phrasing of the labels is what stops the 7B model from
// over-classifying recommendations as VENDOR_OFFERING. Mention the
// negatives explicitly. Keep this prompt in sync with the benchmark
// in `/tmp/llm-benchmark.ts` if you ever rerun it.
const SYSTEM_PROMPT = `Eres un clasificador para una plataforma de venta directa productor → consumidor.
Te paso un mensaje publicado en un grupo público de Telegram.
Tu trabajo es decidir si la persona que escribe está OFRECIENDO ALGO PARA VENDER en ese mensaje, o si está hablando de otra cosa (charla, debate sobre precios, pregunta, queja, spam).

Responde SOLO con un JSON válido, sin texto adicional, con este formato:

{
  "kind": "VENDOR_OFFERING" | "BUYER_QUERY" | "DISCUSSION" | "QUESTION_ANSWER" | "SPAM" | "OTHER",
  "confidence": 0.0 a 1.0,
  "reason": "explicación corta en español, máximo 15 palabras",
  "vendor_offers": [
    {
      "product_hint": "qué dice que vende, en pocas palabras",
      "category_hint": "fruta | verdura | aceite | miel | huevos | lacteos | carne | embutido | pescado | mariscos | conservas | frutos_secos | cereales | legumbres | pan | vino | cerveza | cafe | cosmetica | otro",
      "has_price_signal": true | false,
      "has_contact_signal": true | false
    }
  ]
}

Reglas:
- VENDOR_OFFERING: SOLO si el autor dice "yo vendo X" o equivalente claro. NO vale "X está bueno", "alguien vende X?", "recomiendo a X que vende".
- BUYER_QUERY: alguien BUSCA / PREGUNTA si alguien vende algo.
- DISCUSSION: charla, debate sobre precios o calidad sin oferta concreta.
- QUESTION_ANSWER: pregunta sobre uso, recetas, conservación.
- SPAM: bots, links a otros canales, mensajes irrelevantes.
- OTHER: cualquier otra cosa.
- vendor_offers SOLO si kind === "VENDOR_OFFERING". En cualquier otro caso pon array vacío [].
- No hace falta un precio explícito para que sea VENDOR_OFFERING. Lo importante es la intención de venta del autor.`

// ─── Public input / output ───────────────────────────────────────────

export interface LlmExtractorInput {
  text: string
  vendorHint?: {
    authorDisplayName?: string | null
    authorExternalId?: string | null
  }
  correlationId?: string
}

export interface LlmExtractorOutput {
  classification: ClassifierResult
  payload: ExtractionPayload
  /** Token / latency telemetry for IngestionExtractionResult.cost*. */
  costTokensIn: number
  costTokensOut: number
  costUsd: number
  /** ms wall-clock spent in the LLM call. */
  latencyMs: number
  /** Used so the worker writes the right `extractorVersion`. */
  extractorVersion: string
}

export class LlmExtractorError extends Error {
  // `Error.cause` already exists on the base class — using `override`
  // keeps the noUncheckedOverride compiler check happy.
  override cause: 'transport' | 'timeout' | 'parse' | 'schema'
  readonly latencyMs: number
  constructor(
    message: string,
    cause: 'transport' | 'timeout' | 'parse' | 'schema',
    latencyMs: number,
  ) {
    super(message)
    this.name = 'LlmExtractorError'
    this.cause = cause
    this.latencyMs = latencyMs
  }
}

// ─── Public entry point ──────────────────────────────────────────────

export interface LlmExtractorConfig {
  model: string
  /** Hard cap on a single LLM call. Default 60 s. */
  timeoutMs?: number
  /** Used by tests to inject a fake transport. */
  generate?: typeof ollamaGenerateJson
}

/**
 * Run the message through the LLM and return classifier+payload in
 * the canonical shapes. Throws `LlmExtractorError` on transport,
 * timeout, parse, or schema validation failure — the caller decides
 * whether to fall back to rules.
 */
export async function extractWithLlm(
  input: LlmExtractorInput,
  config: LlmExtractorConfig,
): Promise<LlmExtractorOutput> {
  const generate = config.generate ?? ollamaGenerateJson
  const text = (input.text ?? '').trim()
  if (text.length === 0) {
    throw new LlmExtractorError('empty input text', 'parse', 0)
  }

  // Truncate very long messages — the prompt budget is small in 3 B
  // context windows. 2000 chars covers virtually every Telegram post
  // and bounds the worst-case latency.
  const truncated = text.slice(0, 2000)
  const result = await generate(
    {
      model: config.model,
      system: SYSTEM_PROMPT,
      prompt: `Mensaje:\n"""${truncated}"""`,
      timeoutMs: config.timeoutMs ?? 60_000,
      temperature: 0,
      numPredict: 256,
      numCtx: 4096,
    },
    { correlationId: input.correlationId },
  )

  if (!result.ok) {
    const cause = result.timedOut ? 'timeout' : 'transport'
    throw new LlmExtractorError(result.error, cause, result.ms)
  }

  let parsed: LlmResponse
  try {
    const raw = JSON.parse(result.response) as unknown
    parsed = llmResponseSchema.parse(raw)
  } catch (err) {
    logger.warn(`${LOG_SCOPE}.parse_failed`, {
      model: config.model,
      ms: result.ms,
      correlationId: input.correlationId,
      error: err instanceof Error ? err.message : String(err),
    })
    throw new LlmExtractorError(
      err instanceof Error ? err.message : 'parse error',
      err instanceof z.ZodError ? 'schema' : 'parse',
      result.ms,
    )
  }

  const classification = mapClassification(parsed)
  const payload = mapPayload(parsed, input)

  return {
    classification,
    payload,
    costTokensIn: result.promptTokens,
    costTokensOut: result.outputTokens,
    costUsd: 0, // local model, no $ cost. Field stays 0 by contract.
    latencyMs: result.ms,
    extractorVersion: CURRENT_LLM_EXTRACTOR_VERSION,
  }
}

// ─── LLM-shape → internal-shape mappers ──────────────────────────────

function mapClassification(r: LlmResponse): ClassifierResult {
  // Map the LLM's 6-way verdict into the existing 5-way MessageClass
  // contract. The drafts builder already special-cases PRODUCT (drafts)
  // and PRODUCT_NO_PRICE (unextractable queue), so:
  //   VENDOR_OFFERING + has_price_signal=true   → PRODUCT
  //   VENDOR_OFFERING + has_price_signal=false  → PRODUCT_NO_PRICE
  //   BUYER_QUERY / QUESTION_ANSWER / DISCUSSION → CONVERSATION
  //   SPAM  → SPAM
  //   OTHER → OTHER
  const anyPrice = r.vendor_offers.some((p) => p.has_price_signal)
  const kind: MessageClass =
    r.kind === 'VENDOR_OFFERING'
      ? anyPrice
        ? 'PRODUCT'
        : 'PRODUCT_NO_PRICE'
      : r.kind === 'SPAM'
        ? 'SPAM'
        : r.kind === 'OTHER'
          ? 'OTHER'
          : 'CONVERSATION'
  return {
    kind,
    confidence: clamp01(r.confidence),
    signals: [
      {
        rule: `llm:${r.kind.toLowerCase()}`,
        weight: clamp01(r.confidence),
        match: r.reason.slice(0, 200),
      },
    ],
  }
}

function mapPayload(
  r: LlmResponse,
  input: LlmExtractorInput,
): ExtractionPayload {
  const products: ExtractedProduct[] =
    r.kind === 'VENDOR_OFFERING'
      ? r.vendor_offers.map((p, ordinal) => ({
          productOrdinal: ordinal,
          productName: p.product_hint || null,
          // Internal categorySlug system is product-keyed; the LLM
          // only knows about top-level categories. Forward as-is and
          // let later phases map slug → category id.
          categorySlug: p.category_hint ?? null,
          unit: null,
          weightGrams: null,
          // Phase 2.5 does not extract numeric prices yet. The
          // builder routes priceCents=null + classifierKind=PRODUCT
          // through the same UNEXTRACTABLE path it already uses for
          // rules-only PRODUCT_NO_PRICE, so the operator UX is
          // unchanged.
          priceCents: null,
          currencyCode: null,
          availability: 'UNKNOWN',
          confidenceOverall: clamp01(r.confidence),
          confidenceByField: {
            productName: clamp01(r.confidence),
            categorySlug: p.category_hint ? clamp01(r.confidence) : 0,
          },
          extractionMeta: {
            productName: { rule: 'llm:productHint', source: p.product_hint },
            ...(p.category_hint
              ? { categorySlug: { rule: 'llm:categoryHint', source: p.category_hint } }
              : {}),
          },
          confidenceModel: {
            method: 'weightedMean',
            weights: { productName: 1 },
            excludedFields: ['unit', 'weightGrams', 'priceCents', 'currencyCode', 'availability'],
            bonus: null,
          },
        }))
      : []

  const vendorHint: ExtractionVendorHint = {
    externalId: input.vendorHint?.authorExternalId ?? null,
    displayName:
      input.vendorHint?.authorDisplayName ??
      (products[0]?.productName ? null : null),
    meta: {
      rule:
        r.kind === 'VENDOR_OFFERING'
          ? 'llm:vendorOffering'
          : `llm:${r.kind.toLowerCase()}`,
      source: r.reason.slice(0, 200),
    },
  }

  return {
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    products,
    vendorHint,
    confidenceOverall: clamp01(r.confidence),
    rulesFired: ['llm', `llm:${r.kind.toLowerCase()}`],
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
