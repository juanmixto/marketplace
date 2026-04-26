'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  ShoppingCartIcon,
  UserCircleIcon,
  MagnifyingGlassIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { SITE_NAME } from '@/lib/constants'
import { useCartStore } from '@/domains/cart/cart-store'
import { getPortalLabel, getPrimaryPortalHref, translateCategoryLabel } from '@/lib/portals'
import type { UserRole } from '@/generated/prisma/enums'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { InstallCtaGate, LoginLink } from '@/components/layout/HeaderPathnameParts'
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
  /**
   * Slugs of categories that currently have at least one publicly
   * available product. Used to filter the hard-coded CATEGORIES list
   * so empty branches don't show in the dropdown or search overlay.
   * Optional: when undefined, all categories render (legacy behavior).
   */
  availableCategorySlugs?: string[]
}

export function Header({ user, cartCount = 0, availableCategorySlugs }: HeaderProps) {
  const visibleCategories = availableCategorySlugs
    ? CATEGORIES.filter(c => availableCategorySlugs.includes(c.slug))
    : CATEGORIES
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
  // Mobile search lives in a full-screen overlay triggered by a magnifier
  // button in the top bar. Replaces the previous always-visible second row
  // — phones at 360px were too cramped to read and tap that row.
  const [searchOpen,  setSearchOpen]  = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!mobileOpen) return
    // `overflow: hidden` alone is not enough — iOS Safari and Android
    // Chrome both still let the page scroll under a `fixed` overlay
    // ("rubber band"). Pin the body to its current scroll position with
    // `position: fixed; top: -scrollY`, then restore the scroll on
    // cleanup. This is the standard scroll-lock pattern used by Modal,
    // and removes the visible jump when toggling the drawer.
    const { body } = document
    const scrollY = window.scrollY
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    }
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    return () => {
      body.style.overflow = previous.overflow
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.width = previous.width
      window.scrollTo(0, scrollY)
    }
  }, [mobileOpen])

  // Lock body scroll while the search overlay is open, focus the input,
  // and listen for Escape so dismissing matches OS expectations. Uses
  // the same `position: fixed + top: -scrollY` lock as the drawer so
  // iOS / Android Chrome can't rubber-band-scroll the page underneath.
  useEffect(() => {
    if (!searchOpen) return
    const { body } = document
    const scrollY = window.scrollY
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    }
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    // Defer focus a tick so the input is mounted in the DOM tree.
    const id = requestAnimationFrame(() => searchInputRef.current?.focus())
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      body.style.overflow = previous.overflow
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.width = previous.width
      window.scrollTo(0, scrollY)
      cancelAnimationFrame(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [searchOpen])
  // Note: `usePathname()` used to live here. Reading it at the top level
  // made the whole Header re-render on every `<Link>` navigation even
  // though only two sub-branches actually depend on the path (install CTA
  // gate and the /login link highlight). Those have been extracted to
  // `HeaderPathnameParts.tsx` so the rest of the header can stay stable
  // across navigations.
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
    <>
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
          <div className="relative hidden lg:block">
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
                    {visibleCategories.map(cat => (
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
            className="hidden rounded-lg px-2 py-1 text-sm font-medium text-[var(--foreground-soft)] transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] lg:block"
          >
            {t('producers')}
          </Link>

          {userContextReady && !currentUser && (
            <Link
              href="/login?callbackUrl=%2Fvendor%2Fdashboard"
              className="hidden rounded-lg px-2 py-1 text-sm font-medium text-[var(--foreground-soft)] transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] xl:block"
            >
              {t('producerPortal')}
            </Link>
          )}

          {/* Search */}
          <form action="/buscar" className="hidden flex-1 lg:block">
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
            <InstallCtaGate />
            {/* Language + theme toggles only show in the desktop bar.
                On mobile they live inside the hamburger drawer under the
                "Ajustes" section so the top bar stays uncluttered. */}
            <div className="hidden items-center gap-1 lg:flex">
              <LanguageToggle />
              <ThemeToggle />
            </div>

            {!userContextReady ? (
              // Neutral placeholder while we wait for client-side session
              // resolution; matches the width of the auth buttons to prevent
              // layout shift after hydration.
              <div className="hidden h-9 w-44 lg:block" aria-hidden />
            ) : currentUser ? (
              <>
                {!isBuyerPortal && (
                  <Link
                    href={portalHref}
                    className="hidden rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] lg:block"
                  >
                    {portalLabel}
                  </Link>
                )}
                <div className="relative hidden lg:block">
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
                <LoginLink label={t('signIn')} />
                <Link
                  href="/register"
                  className="hidden rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] lg:block"
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

            {/* Mobile search trigger — opens the full-screen overlay. */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={t('searchMobile')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2.5 text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] lg:hidden"
            >
              <MagnifyingGlassIcon className="h-5 w-5" />
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(v => !v)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? t('close_menu') : t('open_menu')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2.5 text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] lg:hidden"
            >
              {mobileOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer — slides in from the right (matches the side
          where the hamburger lives) and overlays the page with a tap-
          dismiss backdrop. Width capped at ~88vw / 22rem so a sliver
          of the page stays visible as a visual cue you can tap to
          close. */}
      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label={t('close_menu')}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t('open_menu')}
            className="fixed right-0 top-0 z-50 flex h-dvh w-[min(22rem,88vw)] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl lg:hidden"
          >
            {/* Drawer header — close button on the right matches the
                hamburger position so the user closes from the same
                spot they opened. */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--foreground)]">
                {currentUser
                  ? `${t('hello')}, ${(currentUser.name ?? currentUser.email ?? '').split(/[\s@]/)[0] || t('myAccount')}`
                  : t('open_menu')}
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t('close_menu')}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-4">

              {/* ── 1. MI CUENTA ─────────────────────────────────────── */}
              <section className="space-y-1">
                {!userContextReady ? (
                  <div className="h-12" aria-hidden />
                ) : currentUser ? (
                  <>
                    {!isBuyerPortal && (
                      <Link
                        href={portalHref}
                        onClick={() => setMobileOpen(false)}
                        className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                      >
                        <BuildingStorefrontIcon className="h-5 w-5" />
                        {portalLabel}
                      </Link>
                    )}
                    <Link
                      href="/cuenta"
                      onClick={() => setMobileOpen(false)}
                      className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                    >
                      <UserCircleIcon className="h-5 w-5" />
                      {t('myAccount')}
                    </Link>
                    <Link
                      href="/cuenta/pedidos"
                      onClick={() => setMobileOpen(false)}
                      className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                    >
                      <ShoppingCartIcon className="h-5 w-5" />
                      {t('myOrders')}
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      {t('myAccount')}
                    </p>
                    <div className="flex gap-2">
                      <Link
                        href="/login"
                        onClick={() => setMobileOpen(false)}
                        className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-center text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                      >
                        {t('signIn')}
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => setMobileOpen(false)}
                        className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                      >
                        {t('register')}
                      </Link>
                    </div>
                    <Link
                      href="/login?callbackUrl=%2Fvendor%2Fdashboard"
                      onClick={() => setMobileOpen(false)}
                      className="mt-1 block rounded-xl px-3 py-2 text-center text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                    >
                      {t('producerPortal')}
                    </Link>
                  </>
                )}
              </section>

              <div className="border-t border-[var(--border)]" />

              {/* ── 2. AJUSTES (idioma + tema) ──────────────────────── */}
              <section className="space-y-2">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  {t('settings')}
                </p>
                <div className="flex flex-wrap items-center gap-3 px-3">
                  <LanguageToggle />
                  <ThemeToggle />
                </div>
              </section>

              <div className="border-t border-[var(--border)]" />

              {/* ── 3. EXPLORAR ──────────────────────────────────────── */}
              <section className="space-y-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  {t('explore')}
                </p>
                <Link
                  href="/productores"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                >
                  <BuildingStorefrontIcon className="h-5 w-5" />
                  {t('producers')}
                </Link>
              </section>
            </div>

            {/* ── 4. SESIÓN (cerrar sesión, separado del resto) ───────
                Destructive action lives at the bottom so a clumsy thumb
                can't tap it while reaching for "Mis pedidos". Only
                rendered when the user is logged in. */}
            {userContextReady && currentUser && (
              <div className="border-t border-[var(--border)] p-4">
                <SignOutButton compact />
              </div>
            )}
          </aside>
        </>
      )}
    </header>

    {/* Mobile search overlay — full-screen on phones, replaces the old
        inline second row. Lives outside <header> so the sticky/backdrop-blur
        stacking context doesn't trap it behind the body::before texture
        gradient. Escape or the close button dismiss it; submit lets the
        browser navigate to /buscar?q=… and the overlay unmounts on route
        change naturally. */}
    {searchOpen && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('searchMobile')}
        className="fixed inset-0 z-[100] flex flex-col bg-[var(--background)] lg:hidden"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-3">
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label={t('close_menu')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
          <form action="/buscar" className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
              <input
                ref={searchInputRef}
                name="q"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder={t('searchMobile')}
                aria-label={t('searchMobile')}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] py-3 pl-10 pr-4 text-base text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-emerald-500 focus:bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
              />
            </div>
          </form>
        </div>

        {/* Suggestions: quick category links so the overlay never feels empty
            while the user is staring at the keyboard. Tapping any of these
            dismisses the overlay and navigates the user to the catalog. */}
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            {t('categories')}
          </p>
          <div className="space-y-1">
            {visibleCategories.map(cat => (
              <Link
                key={cat.slug}
                href={`/productos?categoria=${cat.slug}`}
                onClick={() => setSearchOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground-soft)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              >
                <span className="text-xl leading-none">{cat.icon}</span>
                <span className="flex-1">{translateCategoryLabel(cat.slug, cat.name, locale)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
