'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  productId: string
  variantId?: string
  name: string
  slug: string
  image?: string
  price: number
  unit: string
  vendorId: string
  vendorName: string
  quantity: number
}

interface CartStore {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (productId: string, variantId?: string) => void
  updateQty: (productId: string, quantity: number, variantId?: string) => void
  clearCart: () => void
  itemCount: () => number
  subtotal: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set(state => {
          const existing = state.items.find(
            i => i.productId === item.productId && i.variantId === item.variantId
          )
          if (existing) {
            return {
              items: state.items.map(i =>
                i.productId === item.productId && i.variantId === item.variantId
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
            }
          }
          return { items: [...state.items, { ...item, quantity: 1 }] }
        })
      },

      removeItem: (productId, variantId) => {
        set(state => ({
          items: state.items.filter(
            i => !(i.productId === productId && i.variantId === variantId)
          ),
        }))
      },

      updateQty: (productId, quantity, variantId) => {
        if (quantity <= 0) {
          get().removeItem(productId, variantId)
          return
        }
        set(state => ({
          items: state.items.map(i =>
            i.productId === productId && i.variantId === variantId
              ? { ...i, quantity }
              : i
          ),
        }))
      },

      clearCart: () => set({ items: [] }),

      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      subtotal: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    {
      name: 'cart-storage',
    }
  )
)
