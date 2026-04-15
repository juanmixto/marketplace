'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  ShoppingCartIcon,
  UserCircleIcon,
  MagnifyingGlassIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { SITE_NAME } from '@/lib/constants'
import { useCartStore } from '@/domains/orders/cart-store'
import { getPortalLabel, getPrimaryPortalHref, translateCategoryLabel } from '@/lib/portals'
import type { UserRole } from '@/generated/prisma/enums'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useLocale, useT } from '@/i18n'
import { useSession } from 'next-auth/react'

const CATEGORIES = [
  { name: 'Verduras y Hortalizas', slug: 'verduras', icon: '🥦' },
  { name: 'Frutas',                slug: 'frutas',   icon: '🍎' },
  { name: 'Lácteos y Huevos',      slug: 'lacteos',  icon: '🧀' },
  { name: 'Cárnicos',              slug: 'carnicos', icon: '🥩' },
  { name: 'Aceites y Conservas',   slug: 'aceites',  icon: '🫒' },
  { name: 'Panadería y Repostería',slug: 'panaderia',icon: '🍞' },
  { name: 'Vinos y Bebidas',       slug: 'vinos',    icon: '🍷' },
  { name: 'Miel y Mermeladas',     slug: 'miel',     icon: '🍯' },
]

interface HeaderProps {
  user?: { name?: string | null; email?: string | null; role?: UserRole } | null
  cartCount?: number
}

export function Header({ user, cartCount = 0 }: HeaderProps) {
  const { data: session } = useSession()
  const currentUser = user ?? session?.user ?? null
  // When the parent layout cannot pass `user` (e.g. the public layout, which
  // must stay cache-friendly and may not call auth()), we depend on the
  // client-side useSession() to learn the user. That resolves *after*
  // hydration, so the SSR pass would otherwise render the not-logged-in
  // state and a vendor would briefly see "Portal productor" linking to
  // /login instead of "Panel productor" linking to /vendor/dashboard (#319).
  // Gate user-dependent UI on a mounted flag so the wrong state never
  // appears in the SSR HTML; routes that already pass `user` keep
  // rendering immediately.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const userContextReady = user !== undefined || mounted
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const [catOpen,     setCatOpen]     = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  // Mobile-only: collapse the search bar when the user scrolls down past
  // the header, reveal again when they scroll back up or return to the
  // top. Keeps more of the viewport free on phones without losing quick
  // access when the user signals "I want to do something".
  const [hideMobileSearch, setHideMobileSearch] = useState(false)
  const lastScrollYRef = useRef(0)
  const mobileOpenRef = useRef(false)
  useEffect(() => {
    mobileOpenRef.current = mobileOpen
    // When the drawer is open, we force the search bar visible and stop
    // toggling it on scroll. Otherwise, background scroll events (or
    // reflow from a collapsing search bar) would make the sticky header
    // flicker as the drawer drags along.
    if (mobileOpen) setHideMobileSearch(false)
  }, [mobileOpen])

  useEffect(() => {
    if (!mobileOpen) return
    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = previousOverflow
    }
  }, [mobileOpen])
  useEffect(() => {
    function handleScroll() {
      if (mobileOpenRef.current) return
      const currentY = window.scrollY
      const lastY = lastScrollYRef.current
      const delta = currentY - lastY
      if (currentY < 80) {
        setHideMobileSearch(false)
      } else if (delta > 6) {
        setHideMobileSearch(true)
      } else if (delta < -6) {
        setHideMobileSearch(false)
      }
      lastScrollYRef.current = currentY
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  const pathname = usePathname()
  const { locale } = useLocale()
  const t = useT()
  const liveCartCount = useCartStore(state => state.items.reduce((sum, item) => sum + item.quantity, 0))
  const effectiveCartCount = Math.max(cartCount, liveCartCount)
  const cartHasItems = effectiveCartCount > 0
  const cartCountLabel =
    effectiveCartCount === 1
      ? t('cart_items_one')
      : t('cart_items_other').replace('{count}', String(effectiveCartCount))
  const portalHref = getPrimaryPortalHref(currentUser?.role)
  const portalLabel = getPortalLabel(currentUser?.role, locale)
  const isBuyerPortal = portalHref === '/cuenta'
  const cartAriaLabel = cartHasItems
    ? `${t('cart')}, ${cartCountLabel}`
    : t('cart')

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/90">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-3">

          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-[11px] font-extrabold text-white shadow-sm">
              MP
            </span>
            <span className="hidden sm:block leading-none">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-400">
                {t('market_local')}
              </span>
              <span className="block text-base font-bold text-[var(--foreground)]">{SITE_NAME}</span>
            </span>
          </Link>

          {/* Categories dropdown */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setCatOpen(v => !v)}
              aria-expanded={catOpen}
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              {t('categories')}
              <ChevronDownIcon className={cn('h-3.5 w-3.5 transition-transform', catOpen && 'rotate-180')} />
            </button>
            {catOpen && (
              <>
                <div className="fixed inset-0" onClick={() => setCatOpen(false)} />
                <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
                  <div className="p-1.5">
                    {CATEGORIES.map(cat => (
                      <Link
                        key={cat.slug}
                        href={`/productos?categoria=${cat.slug}`}
                        onClick={() => setCatOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                      >
                        <span className="text-base">{cat.icon}</span>
                        {translateCategoryLabel(cat.slug, cat.name, locale)}
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <Link
            href="/productores"
            className="hidden rounded-lg px-2 py-1 text-sm font-medium text-[var(--foreground-soft)] transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] md:block"
          >
            {t('producers')}
          </Link>

          {userContextReady && !currentUser && (
            <Link
              href="/login?callbackUrl=%2Fvendor%2Fdashboard"
              className="hidden rounded-lg px-2 py-1 text-sm font-medium text-[var(--foreground-soft)] transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] lg:block"
            >
              {t('producerPortal')}
            </Link>
          )}

          {/* Search */}
          <form action="/buscar" className="hidden flex-1 md:block">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                name="q"
                type="search"
                placeholder={t('search')}
                className={[
                  'w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]',
                  'py-2 pl-9 pr-4 text-sm text-[var(--foreground)]',
                  'placeholder:text-[var(--muted)] transition-all',
                  'focus:border-emerald-500 focus:bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
                  'dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20',
                ].join(' ')}
              />
            </div>
          </form>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />

            {!userContextReady ? (
              // Neutral placeholder while we wait for client-side session
              // resolution; matches the width of the auth buttons to prevent
              // layout shift after hydration.
              <div className="hidden h-9 w-44 md:block" aria-hidden />
            ) : currentUser ? (
              <>
                {!isBuyerPortal && (
                  <Link
                    href={portalHref}
                    className="hidden rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] md:block"
                  >
                    {portalLabel}
                  </Link>
                )}
                <div className="relative hidden md:block">
                  <button
                    onClick={() => setAccountOpen(v => !v)}
                    aria-expanded={accountOpen}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                  >
                    <UserCircleIcon className="h-5 w-5" />
                    {currentUser.name?.split(' ')[0] ?? t('myAccount')}
                    <ChevronDownIcon className={cn('h-3.5 w-3.5 text-[var(--muted)] transition-transform', accountOpen && 'rotate-180')} />
                  </button>
                  {accountOpen && (
                    <>
                      <div className="fixed inset-0" onClick={() => setAccountOpen(false)} />
                      <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
                        <Link
                          href="/cuenta"
                          onClick={() => setAccountOpen(false)}
                          className="block rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                        >
                          {t('myAccount')}
                        </Link>
                        <Link
                          href="/cuenta/pedidos"
                          onClick={() => setAccountOpen(false)}
                          className="block rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                        >
                          {t('myOrders')}
                        </Link>
                        {!isBuyerPortal && (
                          <Link
                            href={portalHref}
                            onClick={() => setAccountOpen(false)}
                            className="block rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                          >
                            {portalLabel}
                          </Link>
                        )}
                        <div className="mx-1 my-1 border-t border-[var(--border)]" />
                        <SignOutButton compact />
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={cn(
                    'hidden rounded-xl px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] md:block',
                    pathname === '/login' && 'bg-[var(--surface-raised)]'
                  )}
                >
                  {t('signIn')}
                </Link>
                <Link
                  href="/register"
                  className="hidden rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] md:block"
                >
                  {t('register')}
                </Link>
              </>
            )}

            {/* Cart */}
            <Link
              href="/carrito"
              aria-label={cartAriaLabel}
              className={cn(
                'relative flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
                cartHasItems
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm hover:bg-emerald-100 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50'
                  : 'border-transparent text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]'
              )}
            >
              <ShoppingCartIcon className={cn('h-5 w-5', cartHasItems && 'stroke-[2.2]')} />
              {cartHasItems && (
                <span className="hidden text-xs font-semibold sm:inline">{cartCountLabel}</span>
              )}
              {cartHasItems && (
                <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-[var(--surface)] dark:bg-emerald-500">
                  {effectiveCartCount > 9 ? '9+' : effectiveCartCount}
                </span>
              )}
            </Link>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(v => !v)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? t('close_menu') : t('open_menu')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2.5 text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] md:hidden"
            >
              {mobileOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile search bar — collapses on scroll-down, reappears on
            scroll-up or near the top of the page. */}
        <div
          className={cn(
            'grid overflow-hidden transition-[grid-template-rows,opacity,padding] duration-200 ease-out md:hidden',
            hideMobileSearch
              ? 'grid-rows-[0fr] pb-0 opacity-0'
              : 'grid-rows-[1fr] pb-3 opacity-100'
          )}
          aria-hidden={hideMobileSearch}
        >
          <form action="/buscar" className="min-h-0">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
              <input
                name="q"
                type="search"
                tabIndex={hideMobileSearch ? -1 : 0}
                placeholder={t('searchMobile')}
                aria-label={t('searchMobile')}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] py-2.5 pl-10 pr-4 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-emerald-500 focus:bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
              />
            </div>
          </form>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-[var(--border)] bg-[var(--surface)] shadow-2xl md:hidden">
          <div className="space-y-1 p-4">
            {/* Categories */}
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{t('categories')}</p>
            {CATEGORIES.map(cat => (
              <Link
                key={cat.slug}
                href={`/productos?categoria=${cat.slug}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
              >
                <span className="text-base">{cat.icon}</span>
                {translateCategoryLabel(cat.slug, cat.name, locale)}
              </Link>
            ))}

            <div className="mx-0 my-2 border-t border-[var(--border)]" />

            {!userContextReady ? (
              <div className="h-12" aria-hidden />
            ) : currentUser ? (
              <>
                {!isBuyerPortal && (
                  <Link
                    href={portalHref}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                  >
                    {portalLabel}
                  </Link>
                )}
                <Link
                  href="/cuenta"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                >
                  <UserCircleIcon className="h-5 w-5" /> {t('myAccount')}
                </Link>
                <Link
                  href="/cuenta/pedidos"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                >
                  {t('myOrders')}
                </Link>
                <div className="pt-1">
                  <SignOutButton compact />
                </div>
              </>
            ) : (
              <div className="flex gap-2 pt-1">
                <Link href="/login" onClick={() => setMobileOpen(false)} className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-center text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                  {t('signIn')}
                </Link>
                <Link href="/register" onClick={() => setMobileOpen(false)} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                  {t('register')}
                </Link>
              </div>
            )}

            {userContextReady && !currentUser && (
              <>
                <div className="mx-0 my-2 border-t border-[var(--border)] sm:hidden" />
                <div className="flex items-center justify-end px-1 pt-1 sm:hidden">
                  <Link
                    href="/login?callbackUrl=%2Fvendor%2Fdashboard"
                    onClick={() => setMobileOpen(false)}
                    className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 rounded"
                  >
                    {t('producerPortal')}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
