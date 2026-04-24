'use client'

/**
 * Tiny pathname-reactive slices extracted out of `Header.tsx` so the big
 * header body doesn't have to subscribe to `usePathname()`.
 *
 * Before, any navigation re-rendered all ~440 lines of Header plus its
 * 6 heroicons and several context hooks, just to adjust two details: the
 * install-CTA gate and the active-style on the /login link. Pushing the
 * pathname read down to these two tiny components lets React skip the
 * Header body on `<Link>`-level navigations entirely.
 *
 * Keep these components small. Anything that grows here re-introduces
 * the original problem.
 */

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import InstallButton from '@/components/pwa/InstallButton'

/**
 * Renders <InstallButton /> only on surfaces where prompting a PWA
 * install is appropriate — i.e. anywhere that is NOT an admin / vendor
 * / checkout flow. Kept as its own component so the gate recomputes
 * without re-rendering the entire header on every navigation.
 */
export function InstallCtaGate() {
  const pathname = usePathname()
  const allowed =
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/vendor') &&
    !pathname.startsWith('/checkout')
  if (!allowed) return null
  return <InstallButton />
}

/**
 * The "Sign in" link in the desktop header. Its only pathname-dependent
 * behaviour is a subtle background highlight when the user is already
 * on /login. Isolated so toggling that style does not re-render the
 * rest of the header.
 */
export function LoginLink({ label }: { label: string }) {
  const pathname = usePathname()
  return (
    <Link
      href="/login"
      className={cn(
        'hidden rounded-xl px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] lg:block',
        pathname === '/login' && 'bg-[var(--surface-raised)]'
      )}
    >
      {label}
    </Link>
  )
}
