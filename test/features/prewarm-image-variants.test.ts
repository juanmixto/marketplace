import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PREWARM_FORMATS,
  DEFAULT_PREWARM_QUALITY,
  DEFAULT_PREWARM_WIDTHS,
  PREWARM_IMAGE_VARIANTS_JOB,
  executePrewarm,
  isImagePrewarmEnabled,
  planPrewarmRequests,
  resolvePrewarmBaseUrl,
} from '@/workers/jobs/prewarm-image-variants'

const SAMPLE_URL = 'https://blob.example.com/products/abc/photo-1.webp'

test('planPrewarmRequests: produces width × format fan-out at default quality', () => {
  const plan = planPrewarmRequests({ url: SAMPLE_URL }, 'https://example.com')
  assert.equal(
    plan.length,
    DEFAULT_PREWARM_WIDTHS.length * DEFAULT_PREWARM_FORMATS.length,
  )
  for (const entry of plan) {
    assert.ok(entry.url.startsWith('https://example.com/_next/image?url='))
    assert.ok(entry.url.includes(`q=${DEFAULT_PREWARM_QUALITY}`))
    assert.ok(entry.url.includes(`w=${entry.width}`))
    // URL is encoded
    assert.ok(entry.url.includes(encodeURIComponent(SAMPLE_URL)))
  }
})

test('planPrewarmRequests: encodes the source URL exactly once', () => {
  const plan = planPrewarmRequests({ url: SAMPLE_URL }, 'https://example.com')
  // The encoded form should appear, the raw form should NOT.
  assert.ok(plan[0].url.includes(encodeURIComponent(SAMPLE_URL)))
  assert.equal(plan[0].url.includes(`url=${SAMPLE_URL}`), false)
})

test('planPrewarmRequests: Accept header is single-format per request', () => {
  const plan = planPrewarmRequests({ url: SAMPLE_URL }, 'https://example.com')
  const accepts = new Set(plan.map((p) => p.accept.split(',')[0]))
  assert.deepEqual(
    [...accepts].sort(),
    [...DEFAULT_PREWARM_FORMATS].sort(),
  )
})

test('planPrewarmRequests: trims trailing slashes from base URL', () => {
  const plan = planPrewarmRequests(
    { url: SAMPLE_URL },
    'https://example.com///',
  )
  for (const entry of plan) {
    assert.ok(entry.url.startsWith('https://example.com/_next/image?'))
  }
})

test('planPrewarmRequests: honours explicit widths/formats/quality', () => {
  const plan = planPrewarmRequests(
    { url: SAMPLE_URL, widths: [320], formats: ['image/webp'], quality: 60 },
    'https://example.com',
  )
  assert.equal(plan.length, 1)
  assert.equal(plan[0].width, 320)
  assert.equal(plan[0].format, 'image/webp')
  assert.ok(plan[0].url.includes('w=320'))
  assert.ok(plan[0].url.includes('q=60'))
  assert.ok(plan[0].accept.startsWith('image/webp'))
})

test('executePrewarm: issues one fetch per (width, format) with the right Accept', async () => {
  const calls: Array<{ url: string; accept: string }> = []
  const fakeFetch = (async (input: string, init?: RequestInit) => {
    const accept =
      (init?.headers as Record<string, string> | undefined)?.Accept ?? ''
    calls.push({ url: String(input), accept })
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response
  }) as unknown as typeof fetch

  const result = await executePrewarm(
    { url: SAMPLE_URL },
    { fetch: fakeFetch, baseUrl: 'https://example.com' },
  )

  assert.equal(
    calls.length,
    DEFAULT_PREWARM_WIDTHS.length * DEFAULT_PREWARM_FORMATS.length,
  )
  assert.equal(result.attempted, calls.length)
  assert.equal(result.succeeded, calls.length)
  assert.equal(result.failed, 0)

  // Every request had an Accept that names exactly one of our formats.
  for (const c of calls) {
    const declared = c.accept.split(',')[0]
    assert.ok(
      (DEFAULT_PREWARM_FORMATS as readonly string[]).includes(declared),
      `unexpected Accept primary value: ${declared}`,
    )
  }
})

test('executePrewarm: continues after individual failures and reports them', async () => {
  let i = 0
  const fakeFetch = (async () => {
    i++
    // Fail every other request (mix of throw + non-OK status).
    if (i === 1) throw new Error('connection reset')
    if (i === 2) {
      return {
        ok: false,
        status: 500,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response
  }) as unknown as typeof fetch

  const result = await executePrewarm(
    { url: SAMPLE_URL },
    { fetch: fakeFetch, baseUrl: 'https://example.com' },
  )

  const expected = DEFAULT_PREWARM_WIDTHS.length * DEFAULT_PREWARM_FORMATS.length
  assert.equal(result.attempted, expected)
  assert.equal(result.failed, 2)
  assert.equal(result.succeeded, expected - 2)
})

test('executePrewarm: never throws even if every fetch fails', async () => {
  const fakeFetch = (async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch

  const result = await executePrewarm(
    { url: SAMPLE_URL },
    { fetch: fakeFetch, baseUrl: 'https://example.com' },
  )

  assert.equal(result.succeeded, 0)
  assert.equal(
    result.failed,
    DEFAULT_PREWARM_WIDTHS.length * DEFAULT_PREWARM_FORMATS.length,
  )
})

test('resolvePrewarmBaseUrl: prefers IMAGE_PREWARM_BASE_URL', () => {
  const base = resolvePrewarmBaseUrl({
    IMAGE_PREWARM_BASE_URL: 'https://override.example.com',
    NEXT_PUBLIC_APP_URL: 'https://app.example.com',
  } as unknown as NodeJS.ProcessEnv)
  assert.equal(base, 'https://override.example.com')
})

test('resolvePrewarmBaseUrl: falls back to NEXT_PUBLIC_APP_URL', () => {
  const base = resolvePrewarmBaseUrl({
    NEXT_PUBLIC_APP_URL: 'https://app.example.com',
  } as unknown as NodeJS.ProcessEnv)
  assert.equal(base, 'https://app.example.com')
})

test('resolvePrewarmBaseUrl: returns null when neither is set', () => {
  const base = resolvePrewarmBaseUrl({} as unknown as NodeJS.ProcessEnv)
  assert.equal(base, null)
})

test('isImagePrewarmEnabled: only "true" turns it on (default off)', () => {
  // /api/upload only enqueues when this returns true. Anything other
  // than the literal string "true" keeps the legacy lazy-render path,
  // which is the safe default for fresh deployments.
  assert.equal(isImagePrewarmEnabled({} as unknown as NodeJS.ProcessEnv), false)
  assert.equal(
    isImagePrewarmEnabled({
      IMAGE_PREWARM_ENABLED: 'false',
    } as unknown as NodeJS.ProcessEnv),
    false,
  )
  assert.equal(
    isImagePrewarmEnabled({
      IMAGE_PREWARM_ENABLED: '1',
    } as unknown as NodeJS.ProcessEnv),
    false,
  )
  assert.equal(
    isImagePrewarmEnabled({
      IMAGE_PREWARM_ENABLED: 'true',
    } as unknown as NodeJS.ProcessEnv),
    true,
  )
})

test('PREWARM_IMAGE_VARIANTS_JOB: stable job name (registered in worker index + enqueued in /api/upload)', () => {
  // If this string changes, every in-flight pg-boss job in the
  // queue stops being picked up and silently piles up. The handler
  // registration in src/workers/index.ts and the enqueue in
  // src/app/api/upload/route.ts both reference this constant; the
  // test lock prevents an accidental rename from one site without
  // the other.
  assert.equal(PREWARM_IMAGE_VARIANTS_JOB, 'image.prewarmVariants')
})
