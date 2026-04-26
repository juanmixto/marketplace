'use client'

import { signOut } from 'next-auth/react'
import { useCartStore } from '@/domains/cart/cart-store'

export const CART_MERGED_FLAG_KEY = 'cart-merged-user'

export function clearCartSessionState() {
  useCartStore.setState({ items: [], hasHydrated: false })
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(CART_MERGED_FLAG_KEY)
  }
}

export async function signOutAndClearCart(callbackUrl: string) {
  clearCartSessionState()
  await signOut({ callbackUrl })
}
