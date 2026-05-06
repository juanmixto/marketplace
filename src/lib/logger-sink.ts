/**
 * External logger sink (#1220).
 *
 * Ships structured log entries to an HTTP NDJSON ingest endpoint.
 * Vendor-agnostic: works with Axiom, Better Stack, Logtail, Grafana
 * Loki's push API, or any service that accepts newline-delimited
 * JSON over POST.
 *
 * Two contracts the rest of the app relies on:
 *
 * 1. **Never block.** `enqueueForSink` returns synchronously, ALWAYS.
 *    The ingest call is fire-and-forget on a microtask. A slow / down
 *    sink must NOT add latency to user requests.
 *
 * 2. **Never throw.** A sink failure is observability degradation,
 *    not a request failure. Every failure path is caught and silently
 *    drops the buffer. Counter (`drops`) is exposed for tests +
 *    health probes.
 *
 * Buffering: groups up to `MAX_BATCH` lines or flushes every
 * `MAX_LINGER_MS`, whichever comes first. Both bounds are tight on
 * purpose — the sink is for incident response, not analytics, so the
 * cost of dropping the last 100 lines on a SIGTERM is much lower than
 * the cost of a multi-second buffer adding tail latency.
 *
 * Inert by env: if `LOGGER_SINK_URL` is unset, `enqueueForSink` is a
 * no-op. The code lands and starts shipping the moment ops sets:
 *   LOGGER_SINK_URL=https://api.axiom.co/v1/datasets/<dataset>/ingest
 *   LOGGER_SINK_TOKEN=<bearer>
 */

const MAX_BATCH = 100
const MAX_LINGER_MS = 1_000
const FLUSH_TIMEOUT_MS = 5_000

interface SinkConfig {
  url: string
  token?: string
}

interface SinkState {
  buffer: string[]
  timer: ReturnType<typeof setTimeout> | null
  /** Counter of lines dropped because of network / 5xx / oversize. */
  drops: number
  /** Counter of lines successfully POSTed. */
  shipped: number
}

const state: SinkState = {
  buffer: [],
  timer: null,
  drops: 0,
  shipped: 0,
}

function readSinkConfig(): SinkConfig | null {
  const url = process.env.LOGGER_SINK_URL
  if (!url || url.length === 0) return null
  const token = process.env.LOGGER_SINK_TOKEN
  return { url, token: token && token.length > 0 ? token : undefined }
}

/**
 * Pushes a structured entry onto the buffer. Returns immediately —
 * the network call is scheduled on a microtask. Safe to call from
 * any code path, including request handlers under load.
 */
export function enqueueForSink(line: string): void {
  const config = readSinkConfig()
  if (!config) return

  state.buffer.push(line)

  if (state.buffer.length >= MAX_BATCH) {
    void flush(config)
    return
  }

  if (state.timer === null) {
    state.timer = setTimeout(() => {
      state.timer = null
      void flush(config)
    }, MAX_LINGER_MS)
    // unref so a late-firing timer doesn't keep the process alive
    // past graceful shutdown.
    state.timer.unref?.()
  }
}

async function flush(config: SinkConfig): Promise<void> {
  if (state.buffer.length === 0) return
  const batch = state.buffer
  state.buffer = []
  if (state.timer !== null) {
    clearTimeout(state.timer)
    state.timer = null
  }

  const body = batch.join('\n')

  const headers: Record<string, string> = {
    'content-type': 'application/x-ndjson',
  }
  if (config.token) {
    headers.authorization = `Bearer ${config.token}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS)

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      // 4xx is a config error (wrong dataset, bad token). Drop the
      // batch — replaying it will fail every time. 5xx is transient
      // but we still drop: holding state means unbounded growth on
      // a sustained outage. Operators see the alert via
      // `loggerSinkStats().drops` exposed at /api/ready.
      state.drops += batch.length
      return
    }
    state.shipped += batch.length
  } catch {
    // Network error / timeout / abort. Same drop semantics.
    state.drops += batch.length
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Test helper + ops introspection. Returns the running counters; the
 * `/api/ready` probe surfaces the drop count so a steady drop signal
 * pages oncall.
 */
export function loggerSinkStats(): { drops: number; shipped: number; bufferSize: number } {
  return {
    drops: state.drops,
    shipped: state.shipped,
    bufferSize: state.buffer.length,
  }
}

/**
 * Test helper. Never call from production code — there's no flush()
 * race-protection by design (we want fire-and-forget).
 */
export function _resetLoggerSinkForTests(): void {
  if (process.env.NODE_ENV !== 'test') return
  if (state.timer !== null) {
    clearTimeout(state.timer)
    state.timer = null
  }
  state.buffer = []
  state.drops = 0
  state.shipped = 0
}

/**
 * Test helper to force-flush the current buffer.
 */
export async function _flushLoggerSinkForTests(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') return
  const config = readSinkConfig()
  if (!config) return
  await flush(config)
}
