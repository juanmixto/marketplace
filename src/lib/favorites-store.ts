'use client'

import { create } from 'zustand'

interface FavoritesStore {
  // Product favorites
  productIds: Set<string>
  loaded: boolean
  loading: boolean
  loadFavorites: () => Promise<void>
  toggle: (productId: string) => Promise<void>
  has: (productId: string) => boolean
  remove: (productId: string) => void

  // Vendor favorites
  vendorIds: Set<string>
  vendorLoaded: boolean
  vendorLoading: boolean
  loadVendorFavorites: () => Promise<void>
  toggleVendor: (vendorId: string) => Promise<void>
  hasVendor: (vendorId: string) => boolean
  removeVendor: (vendorId: string) => void
}

export const useFavoritesStore = create<FavoritesStore>()((set, get) => ({
  // ── Product favorites ──────────────────────────────────────────────
  productIds: new Set<string>(),
  loaded: false,
  loading: false,

  loadFavorites: async () => {
    if (get().loaded || get().loading) return
    set({ loading: true })
    try {
      const res = await fetch('/api/favoritos/ids')
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
    const current = get().productIds
    const isFav = current.has(productId)

    // Optimistic update
    const next = new Set(current)
    if (isFav) {
      next.delete(productId)
    } else {
      next.add(productId)
    }
    set({ productIds: next })

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
    }
  },

  has: (productId: string) => get().productIds.has(productId),

  remove: (productId: string) => {
    const next = new Set(get().productIds)
    next.delete(productId)
    set({ productIds: next })
  },

  // ── Vendor favorites ───────────────────────────────────────────────
  vendorIds: new Set<string>(),
  vendorLoaded: false,
  vendorLoading: false,

  loadVendorFavorites: async () => {
    if (get().vendorLoaded || get().vendorLoading) return
    set({ vendorLoading: true })
    try {
      const res = await fetch('/api/favoritos/vendors/ids')
      if (!res.ok) {
        set({ vendorLoaded: true, vendorLoading: false })
        return
      }
      const data = await res.json()
      set({ vendorIds: new Set(data.ids ?? []), vendorLoaded: true, vendorLoading: false })
    } catch {
      set({ vendorLoaded: true, vendorLoading: false })
    }
  },

  toggleVendor: async (vendorId: string) => {
    const current = get().vendorIds
    const isFav = current.has(vendorId)

    // Optimistic update
    const next = new Set(current)
    if (isFav) {
      next.delete(vendorId)
    } else {
      next.add(vendorId)
    }
    set({ vendorIds: next })

    try {
      if (isFav) {
        const res = await fetch(`/api/favoritos/vendors/${vendorId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
      } else {
        const res = await fetch('/api/favoritos/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendorId }),
        })
        if (!res.ok) throw new Error()
      }
    } catch {
      // Rollback on failure
      set({ vendorIds: current })
    }
  },

  hasVendor: (vendorId: string) => get().vendorIds.has(vendorId),

  removeVendor: (vendorId: string) => {
    const next = new Set(get().vendorIds)
    next.delete(vendorId)
    set({ vendorIds: next })
  },
}))
