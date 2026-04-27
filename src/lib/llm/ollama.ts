import { logger } from '@/lib/logger'

/**
 * Minimal Ollama HTTP client for the Phase 2.5 LLM extractor.
 *
 * Why a thin wrapper instead of a full SDK:
 *   - Only one endpoint matters here (`/api/generate`).
 *   - Lets us pin JSON mode, deterministic temperature and a tight
 *     timeout from one place — the extractor never has to think
 *     about HTTP details.
 *   - Token / latency telemetry comes back on every call so the
 *     handler can write it to `IngestionExtractionResult.cost*`.
 *
 * The client never logs prompt content (PII risk in user messages).
 * Only the model name, latency and a sanitised error tail.
 */

const LOG_SCOPE = 'llm.ollama'

export interface OllamaGenerateInput {
  model: string
  /** System / instruction prompt. Pinned across calls for a given task. */
  system: string
  /** User input. The classifier passes the message text here. */
  prompt: string
  /** Hard timeout in ms. Default 60000. CPU inference can be slow. */
  timeoutMs?: number
  /** Sampler temperature. Default 0 — deterministic for classification. */
  temperature?: number
  /** Hard cap on output tokens. Default 256 — the JSON we expect is small. */
  numPredict?: number
  /** Context window in tokens. Default 4096. */
  numCtx?: number
}

export interface OllamaGenerateOk {
  ok: true
  /** Raw text response. JSON-mode guarantees parseable JSON. */
  response: string
  /** Tokens fed (prompt + system) — for cost telemetry, even when free. */
  promptTokens: number
  /** Tokens generated. */
  outputTokens: number
  /** Wall-clock duration. */
  ms: number
}

export interface OllamaGenerateErr {
  ok: false
  error: string
  /** Wall-clock duration including the timeout, if applicable. */
  ms: number
  /** True when the cause is `AbortSignal` after `timeoutMs`. */
  timedOut: boolean
}

export type OllamaGenerateResult = OllamaGenerateOk | OllamaGenerateErr

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * `fetch` against `<base>/api/generate` with `format: "json"` and
 * deterministic options. On any error returns a typed Err result —
 * the caller decides whether to fall back to rules or rethrow.
 */
export async function ollamaGenerateJson(
  input: OllamaGenerateInput,
  options: { baseUrl?: string; correlationId?: string } = {},
): Promise<OllamaGenerateResult> {
  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
  const url = `${baseUrl}/api/generate`
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const correlationId = options.correlationId

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        system: input.system,
        prompt: input.prompt,
        format: 'json',
        stream: false,
        options: {
          temperature: input.temperature ?? 0,
          num_predict: input.numPredict ?? 256,
          num_ctx: input.numCtx ?? 4096,
        },
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const ms = Date.now() - t0
    if (!res.ok) {
      logger.warn(`${LOG_SCOPE}.http_error`, {
        model: input.model,
        status: res.status,
        ms,
        correlationId,
      })
      return { ok: false, error: `HTTP ${res.status}`, ms, timedOut: false }
    }
    const body = (await res.json()) as {
      response?: string
      prompt_eval_count?: number
      eval_count?: number
    }
    if (typeof body.response !== 'string') {
      return { ok: false, error: 'missing response field', ms, timedOut: false }
    }
    return {
      ok: true,
      response: body.response,
      promptTokens: body.prompt_eval_count ?? 0,
      outputTokens: body.eval_count ?? 0,
      ms,
    }
  } catch (err) {
    clearTimeout(timer)
    const ms = Date.now() - t0
    const timedOut = isAbortError(err)
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`${LOG_SCOPE}.fetch_error`, {
      model: input.model,
      ms,
      timedOut,
      error: message,
      correlationId,
    })
    return {
      ok: false,
      error: timedOut ? `timeout after ${timeoutMs}ms` : message,
      ms,
      timedOut,
    }
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' ||
      ('code' in err && (err as { code?: string }).code === 'ABORT_ERR'))
  )
}
