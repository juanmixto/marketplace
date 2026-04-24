'use client'

import { create } from 'zustand'

interface FavoritesStore {
  productIds: Set<string>
  pending: Set<string>
  loaded: boolean
  loading: boolean
  loadFavorites: () => Promise<void>
  toggle: (productId: string) => Promise<void>
  has: (productId: string) => boolean
  isPending: (productId: string) => boolean
  remove: (productId: string) => void
}

// Module-scoped dedup map so a rapid double-tap of the favourite button
// coalesces into a single in-flight request instead of firing two API
// calls whose responses can arrive out of order.
const inflightToggles = new Map<string, Promise<void>>()

export const useFavoritesStore = create<FavoritesStore>()((set, get) => ({
  productIds: new Set<string>(),
  pending: new Set<string>(),
  loaded: false,
  loading: false,

  loadFavorites: async () => {
    if (get().loaded || get().loading) return
    set({ loading: true })
    try {
      const res = await fetch('/api/favoritos/ids', { cache: 'no-store' })
      if (!res.ok) {
        set({ loaded: true, loading: false })
        return
      }
      const data = await res.json()
      set({ productIds: new Set(data.ids ?? []), loaded: true, loading: false })
    } catch {
      set({ loaded: true, loading: false })
    }
  },

  toggle: async (productId: string) => {
    const existing = inflightToggles.get(productId)
    if (existing) return existing

    const current = get().productIds
    const isFav = current.has(productId)

    // Optimistic update
    const next = new Set(current)
    if (isFav) {
      next.delete(productId)
    } else {
      next.add(productId)
    }
    const nextPending = new Set(get().pending)
    nextPending.add(productId)
    set({ productIds: next, pending: nextPending })

    const request = (async () => {
      try {
        if (isFav) {
          const res = await fetch(`/api/favoritos/${productId}`, { method: 'DELETE' })
          if (!res.ok) throw new Error()
        } else {
          const res = await fetch('/api/favoritos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId }),
          })
          if (!res.ok) throw new Error()
        }
      } catch {
        // Rollback on failure
        set({ productIds: current })
      } finally {
        const done = new Set(get().pending)
        done.delete(productId)
        set({ pending: done })
        inflightToggles.delete(productId)
      }
    })()

    inflightToggles.set(productId, request)
    return request
  },

  has: (productId: string) => get().productIds.has(productId),
  isPending: (productId: string) => get().pending.has(productId),

  remove: (productId: string) => {
    const next = new Set(get().productIds)
    next.delete(productId)
    set({ productIds: next })
  },
}))

// Test-only: clear the dedup map between tests. Not used in app code.
export function __resetFavoritesInflight() {
  inflightToggles.clear()
}
