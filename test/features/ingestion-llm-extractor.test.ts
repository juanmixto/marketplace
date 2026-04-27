import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractWithLlm,
  LlmExtractorError,
  CURRENT_LLM_EXTRACTOR_VERSION,
} from '@/domains/ingestion/processing/extractor/llm'
import type {
  OllamaGenerateOk,
  OllamaGenerateErr,
} from '@/lib/llm/ollama'

/**
 * Pure unit tests for the LLM extractor. The Ollama transport is
 * faked so these run without a model loaded — the real model
 * benchmark is in `/tmp/llm-benchmark.ts`.
 */

function fakeOk(json: unknown, ms = 100): () => Promise<OllamaGenerateOk> {
  return async () => ({
    ok: true,
    response: typeof json === 'string' ? json : JSON.stringify(json),
    promptTokens: 200,
    outputTokens: 50,
    ms,
  })
}

function fakeErr(error: string, opts: { timedOut?: boolean; ms?: number } = {}): () =>
  Promise<OllamaGenerateErr> {
  return async () => ({
    ok: false,
    error,
    ms: opts.ms ?? 100,
    timedOut: opts.timedOut ?? false,
  })
}

const VENDOR_OFFERING_RESPONSE = {
  kind: 'VENDOR_OFFERING',
  confidence: 0.9,
  reason: 'vende aguacates ecológicos',
  vendor_offers: [
    {
      product_hint: 'aguacates ecológicos',
      category_hint: 'fruta',
      has_price_signal: false,
      has_contact_signal: true,
    },
  ],
}

test('extractWithLlm: VENDOR_OFFERING with no price → PRODUCT_NO_PRICE classification', async () => {
  const result = await extractWithLlm(
    { text: 'Hola tengo aguacates ecológicos. Privado.' },
    { model: 'qwen2.5:3b', generate: fakeOk(VENDOR_OFFERING_RESPONSE) as never },
  )
  assert.equal(result.classification.kind, 'PRODUCT_NO_PRICE')
  assert.equal(result.payload.products.length, 1)
  assert.equal(result.payload.products[0]!.priceCents, null)
  assert.equal(result.extractorVersion, CURRENT_LLM_EXTRACTOR_VERSION)
  assert.equal(result.payload.vendorHint.meta.rule, 'llm:vendorOffering')
})

test('extractWithLlm: VENDOR_OFFERING with price signal → PRODUCT classification', async () => {
  const withPrice = {
    ...VENDOR_OFFERING_RESPONSE,
    vendor_offers: [{ ...VENDOR_OFFERING_RESPONSE.vendor_offers[0], has_price_signal: true }],
  }
  const result = await extractWithLlm(
    { text: 'Aguacates 5€/kg' },
    { model: 'qwen2.5:3b', generate: fakeOk(withPrice) as never },
  )
  assert.equal(result.classification.kind, 'PRODUCT')
})

test('extractWithLlm: BUYER_QUERY → CONVERSATION (no products)', async () => {
  const buyerResp = {
    kind: 'BUYER_QUERY',
    confidence: 0.85,
    reason: 'busca arándanos',
    vendor_offers: [],
  }
  const result = await extractWithLlm(
    { text: 'alguien que venda arándanos?' },
    { model: 'qwen2.5:3b', generate: fakeOk(buyerResp) as never },
  )
  assert.equal(result.classification.kind, 'CONVERSATION')
  assert.equal(result.payload.products.length, 0)
})

test('extractWithLlm: SPAM passthrough', async () => {
  const result = await extractWithLlm(
    { text: 'click aquí' },
    {
      model: 'qwen2.5:3b',
      generate: fakeOk({
        kind: 'SPAM',
        confidence: 0.95,
        reason: 'enlace sospechoso',
        vendor_offers: [],
      }) as never,
    },
  )
  assert.equal(result.classification.kind, 'SPAM')
})

test('extractWithLlm: transport error throws LlmExtractorError(transport)', async () => {
  await assert.rejects(
    extractWithLlm(
      { text: 'algo' },
      { model: 'qwen2.5:3b', generate: fakeErr('connection refused') as never },
    ),
    (err) => {
      assert.ok(err instanceof LlmExtractorError)
      assert.equal((err as LlmExtractorError).cause, 'transport')
      return true
    },
  )
})

test('extractWithLlm: timeout error throws LlmExtractorError(timeout)', async () => {
  await assert.rejects(
    extractWithLlm(
      { text: 'algo' },
      {
        model: 'qwen2.5:3b',
        generate: fakeErr('timeout after 60000ms', { timedOut: true }) as never,
      },
    ),
    (err) => {
      assert.equal((err as LlmExtractorError).cause, 'timeout')
      return true
    },
  )
})

test('extractWithLlm: invalid JSON throws LlmExtractorError(parse)', async () => {
  await assert.rejects(
    extractWithLlm(
      { text: 'algo' },
      { model: 'qwen2.5:3b', generate: fakeOk('this is not json') as never },
    ),
    (err) => {
      assert.equal((err as LlmExtractorError).cause, 'parse')
      return true
    },
  )
})

test('extractWithLlm: out-of-schema JSON throws LlmExtractorError(schema)', async () => {
  await assert.rejects(
    extractWithLlm(
      { text: 'algo' },
      {
        model: 'qwen2.5:3b',
        generate: fakeOk({ kind: 'NONSENSE_VALUE', confidence: 0.5, reason: '' }) as never,
      },
    ),
    (err) => {
      assert.equal((err as LlmExtractorError).cause, 'schema')
      return true
    },
  )
})

test('extractWithLlm: empty text throws before any HTTP call', async () => {
  let called = false
  await assert.rejects(
    extractWithLlm(
      { text: '   ' },
      {
        model: 'qwen2.5:3b',
        generate: (async () => {
          called = true
          return { ok: true, response: '{}', promptTokens: 0, outputTokens: 0, ms: 0 }
        }) as never,
      },
    ),
    (err) => err instanceof LlmExtractorError,
  )
  assert.equal(called, false)
})
