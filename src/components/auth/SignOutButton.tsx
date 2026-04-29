'use client'

import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'
import { signOutAndClearCart } from '@/components/buyer/cart-session'

interface SignOutButtonProps {
  compact?: boolean
  /**
   * Where to land after the session is cleared. Buyer surfaces send
   * the user back to the public home; admin/vendor surfaces send
   * them to /login because their portals are gated.
   */
  redirectTo?: string
  /**
   * Override the default `signOut` translation key. Vendor and admin
   * headers use slightly more specific copy (`vendor.header.signOut`,
   * `admin.header.signOut`) — pass it here instead of bypassing the
   * shared component.
   */
  labelKey?: TranslationKeys
}

/**
 * Canonical sign-out trigger. Right-aligned in the button so the
 * destructive action lives at the end of the row across every
 * surface that uses it (account hub, header dropdown, vendor /
 * admin sidebar + header). Don't hand-roll a sibling button —
 * extend this one with `redirectTo` / `labelKey` instead.
 */
export function SignOutButton({
  compact = false,
  redirectTo = '/',
  labelKey,
}: SignOutButtonProps) {
  const t = useT()
  return (
    <Button
      variant="ghost"
      size={compact ? 'sm' : 'md'}
      className="w-full justify-end text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
      onClick={() => void signOutAndClearCart(redirectTo)}
    >
      {labelKey ? t(labelKey) : t('signOut')}
    </Button>
  )
}
