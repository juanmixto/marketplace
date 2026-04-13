import test from 'node:test'
import assert from 'node:assert/strict'
import { useFavoritesStore, __resetFavoritesInflight } from '@/domains/catalog/favorites-store'

type FetchCall = { url: string; method: string }

function mockFetch(options: { fail?: boolean; delayMs?: number } = {}) {
  const calls: FetchCall[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string, init?: { method?: string }) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' })
    if (options.delayMs) {
      await new Promise((r) => setTimeout(r, options.delayMs))
    }
    if (options.fail) {
      return { ok: false } as unknown as Response
    }
    return { ok: true, json: async () => ({}) } as unknown as Response
  }) as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

function resetStore() {
  useFavoritesStore.setState({
    productIds: new Set<string>(),
    pending: new Set<string>(),
    loaded: true,
    loading: false,
  })
  __resetFavoritesInflight()
}

test('toggle adds a favorite optimistically and POSTs to the API', async () => {
  resetStore()
  const fx = mockFetch()
  try {
    await useFavoritesStore.getState().toggle('p-1')
    assert.equal(useFavoritesStore.getState().has('p-1'), true)
    assert.equal(fx.calls.length, 1)
    assert.equal(fx.calls[0]!.method, 'POST')
    assert.equal(useFavoritesStore.getState().isPending('p-1'), false)
  } finally {
    fx.restore()
  }
})

test('toggle removes a favorite optimistically and DELETEs via the API', async () => {
  resetStore()
  useFavoritesStore.setState({ productIds: new Set(['p-2']) })
  const fx = mockFetch()
  try {
    await useFavoritesStore.getState().toggle('p-2')
    assert.equal(useFavoritesStore.getState().has('p-2'), false)
    assert.equal(fx.calls[0]!.method, 'DELETE')
    assert.match(fx.calls[0]!.url, /p-2/)
  } finally {
    fx.restore()
  }
})

test('toggle rolls back the optimistic update when the request fails', async () => {
  resetStore()
  useFavoritesStore.setState({ productIds: new Set(['p-3']) })
  const fx = mockFetch({ fail: true })
  try {
    await useFavoritesStore.getState().toggle('p-3')
    assert.equal(useFavoritesStore.getState().has('p-3'), true, 'should roll back to the original value')
  } finally {
    fx.restore()
  }
})

test('concurrent toggle calls on the same product dedupe into one request', async () => {
  resetStore()
  const fx = mockFetch({ delayMs: 25 })
  try {
    const store = useFavoritesStore.getState()
    const promises = [store.toggle('p-4'), store.toggle('p-4'), store.toggle('p-4')]
    await Promise.all(promises)
    assert.equal(fx.calls.length, 1, 'rapid double/triple-tap should produce only one HTTP call')
    assert.equal(useFavoritesStore.getState().has('p-4'), true)
    assert.equal(useFavoritesStore.getState().isPending('p-4'), false)
  } finally {
    fx.restore()
  }
})

test('toggle exposes pending state while the request is in flight', async () => {
  resetStore()
  const fx = mockFetch({ delayMs: 20 })
  try {
    const store = useFavoritesStore.getState()
    const promise = store.toggle('p-5')
    // Synchronous optimistic pending flip
    assert.equal(useFavoritesStore.getState().isPending('p-5'), true)
    await promise
    assert.equal(useFavoritesStore.getState().isPending('p-5'), false)
  } finally {
    fx.restore()
  }
})
