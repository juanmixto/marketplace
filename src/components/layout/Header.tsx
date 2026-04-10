'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useCartStore } from '@/lib/cart-store'
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
import { getPortalLabel, getPrimaryPortalHref } from '@/lib/portals'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { ThemeToggle } from '@/components/ThemeToggle'

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

export function Header() {
  const { data: session } = useSession()
  const user = session?.user ?? null
  const cartCount = useCartStore(s => s.itemCount())
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const [catOpen,     setCatOpen]     = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const pathname   = usePathname()
  const portalHref = getPrimaryPortalHref(user?.role)
  const portalLabel = getPortalLabel(user?.role)

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
                Mercado local
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
              Categorías
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
                        {cat.name}
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
            Productores
          </Link>

          {!user && (
            <Link
              href="/login?callbackUrl=%2Fvendor%2Fdashboard"
              className="hidden rounded-lg px-2 py-1 text-sm font-medium text-[var(--foreground-soft)] transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] lg:block"
            >
              Portal productor
            </Link>
          )}

          {/* Search */}
          <form action="/buscar" className="hidden flex-1 md:block">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                name="q"
                type="search"
                placeholder="Buscar productos, productores..."
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
            <ThemeToggle />

            {user ? (
              <>
                <Link
                  href={portalHref}
                  className="hidden rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] md:block"
                >
                  {portalLabel}
                </Link>
                <div className="relative hidden md:block">
                  <button
                    onClick={() => setAccountOpen(v => !v)}
                    aria-expanded={accountOpen}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                  >
                    <UserCircleIcon className="h-5 w-5" />
                    {user.name?.split(' ')[0] ?? 'Cuenta'}
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
                          Mi cuenta
                        </Link>
                        <Link
                          href="/cuenta/pedidos"
                          onClick={() => setAccountOpen(false)}
                          className="block rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                        >
                          Mis pedidos
                        </Link>
                        <Link
                          href={portalHref}
                          onClick={() => setAccountOpen(false)}
                          className="block rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                        >
                          {portalLabel}
                        </Link>
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
                  Entrar
                </Link>
                <Link
                  href="/register"
                  className="hidden rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] md:block"
                >
                  Registrarse
                </Link>
              </>
            )}

            {/* Cart */}
            <Link
              href="/carrito"
              aria-label={cartCount > 0 ? `Carrito (${cartCount} artículo${cartCount !== 1 ? 's' : ''})` : 'Ver carrito'}
              className="relative rounded-xl p-2 text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              <ShoppingCartIcon className="h-5 w-5" aria-hidden="true" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow-sm dark:bg-emerald-500" aria-hidden="true">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </Link>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(v => !v)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              className="rounded-xl p-2 text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] md:hidden"
            >
              {mobileOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-[var(--border)] bg-[var(--surface)] shadow-2xl md:hidden">
          <div className="space-y-1 p-4">
            {/* Search */}
            <form action="/buscar" className="mb-3">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  name="q"
                  type="search"
                  placeholder="Buscar..."
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] py-2.5 pl-9 pr-4 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                />
              </div>
            </form>

            {/* Categories */}
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Categorías</p>
            {CATEGORIES.map(cat => (
              <Link
                key={cat.slug}
                href={`/productos?categoria=${cat.slug}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
              >
                <span className="text-base">{cat.icon}</span>
                {cat.name}
              </Link>
            ))}

            <div className="mx-0 my-2 border-t border-[var(--border)]" />

            {user ? (
              <>
                <Link
                  href={portalHref}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                >
                  {portalLabel}
                </Link>
                <Link
                  href="/cuenta"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                >
                  <UserCircleIcon className="h-5 w-5" /> Mi cuenta
                </Link>
                <Link
                  href="/cuenta/pedidos"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                >
                  Mis pedidos
                </Link>
                <div className="pt-1">
                  <SignOutButton compact />
                </div>
              </>
            ) : (
              <div className="space-y-2 pt-1">
                <Link
                  href="/login?callbackUrl=%2Fvendor%2Fdashboard"
                  className="block rounded-xl border border-[var(--border)] px-4 py-2.5 text-center text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                >
                  Portal productor
                </Link>
                <div className="flex gap-2">
                  <Link href="/login" className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-center text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                    Entrar
                  </Link>
                  <Link href="/register" className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                    Registrarse
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
