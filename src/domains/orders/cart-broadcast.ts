// Cross-tab cart sync via BroadcastChannel (#795).
//
// Without this, a user with /productos/foo open in two tabs adds an
// item in tab A and tab B keeps showing the old cart until they
// reload — a confusing UX especially on PWAs where users keep multiple
// tabs around.
//
// Strategy:
// - localStorage is the source of truth (Zustand `persist` already
//   writes to it on every state change).
// - This module broadcasts a SIGNAL over BroadcastChannel saying
//   "something changed, re-read localStorage". Receivers do not trust
//   the message payload — they re-read localStorage to avoid race
//   conditions with the persist middleware.
// - Each tab generates a unique SOURCE_ID at module load. Tabs ignore
//   their own broadcasts to prevent loops.
//
// Browser support: all modern browsers including iOS Safari 15.4+.
// Older Safari silently no-ops (cart still works, just no cross-tab
// sync) — the feature degrades gracefully.

'use client'

import { useCartStore, type CartItem } from './cart-store'

const CHANNEL_NAME = 'mp-cart-sync'
const STORAGE_KEY = 'cart-storage'

let channel: BroadcastChannel | null = null
let sourceId = ''
let installed = false

interface BroadcastMessage {
  sourceId: string
  reason: 'add' | 'remove' | 'updateQty' | 'clear' | 'hydrate'
}

const isSupported = (): boolean =>
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'

const readStoredItems = (): CartItem[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { state?: { items?: CartItem[] } }
    return parsed.state?.items ?? []
  } catch {
    return []
  }
}

/**
 * Set up cross-tab cart sync. Idempotent: multiple calls are no-ops
 * after the first. Returns a cleanup function.
 *
 * Mount once, near the top of the client tree (CartHydrationProvider
 * is the natural home).
 */
export function installCartBroadcast(): () => void {
  if (installed || !isSupported()) return () => {}
  installed = true

  sourceId = crypto.randomUUID()
  channel = new BroadcastChannel(CHANNEL_NAME)

  // Receive: someone else changed the cart, re-hydrate from localStorage.
  channel.addEventListener('message', (event) => {
    const data = event.data as BroadcastMessage | undefined
    if (!data || data.sourceId === sourceId) return
    const items = readStoredItems()
    useCartStore.setState({ items })
  })

  // Also re-hydrate when the tab returns to foreground. Safari iOS
  // suspends background tabs aggressively, so a BroadcastChannel
  // message could be missed; reading localStorage on visibility flip
  // is a cheap belt-and-braces.
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return
    const items = readStoredItems()
    const current = useCartStore.getState().items
    if (JSON.stringify(items) !== JSON.stringify(current)) {
      useCartStore.setState({ items })
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  // Subscribe to local store mutations and broadcast every change.
  // Zustand calls the listener after the new state is committed, so
  // `persist` has already written to localStorage by the time we fire.
  let lastSerialized = JSON.stringify(useCartStore.getState().items)
  const unsubscribeStore = useCartStore.subscribe((state) => {
    const serialized = JSON.stringify(state.items)
    if (serialized === lastSerialized) return
    lastSerialized = serialized
    channel?.postMessage({ sourceId, reason: 'hydrate' } satisfies BroadcastMessage)
  })

  return () => {
    unsubscribeStore()
    document.removeEventListener('visibilitychange', onVisibility)
    channel?.close()
    channel = null
    installed = false
  }
}
