'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
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
import type { UserRole } from '@/generated/prisma/enums'

const CATEGORIES = [
  { name: 'Verduras y Hortalizas', slug: 'verduras', icon: '🥦' },
  { name: 'Frutas', slug: 'frutas', icon: '🍎' },
  { name: 'Lácteos y Huevos', slug: 'lacteos', icon: '🧀' },
  { name: 'Cárnicos', slug: 'carnicos', icon: '🥩' },
  { name: 'Aceites y Conservas', slug: 'aceites', icon: '🫒' },
  { name: 'Panadería y Repostería', slug: 'panaderia', icon: '🍞' },
  { name: 'Vinos y Bebidas', slug: 'vinos', icon: '🍷' },
  { name: 'Miel y Mermeladas', slug: 'miel', icon: '🍯' },
]

interface HeaderProps {
  user?: { name?: string | null; email?: string | null; role?: UserRole } | null
  cartCount?: number
}

export function Header({ user, cartCount = 0 }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const pathname = usePathname()
  const portalHref = getPrimaryPortalHref(user?.role)
  const portalLabel = getPortalLabel(user?.role)

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-lime-600 text-sm font-extrabold text-white shadow-sm">
              MP
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
                Mercado local
              </span>
              <span className="block text-lg font-bold text-gray-900">{SITE_NAME}</span>
            </span>
          </Link>

          {/* Categories dropdown */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setCatOpen(v => !v)}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Categorías <ChevronDownIcon className={cn('h-4 w-4 transition', catOpen && 'rotate-180')} />
            </button>
            {catOpen && (
              <>
                <div className="fixed inset-0" onClick={() => setCatOpen(false)} />
                <div className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-lg">
                  <div className="p-2">
                    {CATEGORIES.map(cat => (
                      <Link
                        key={cat.slug}
                        href={`/productos?categoria=${cat.slug}`}
                        onClick={() => setCatOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <span>{cat.icon}</span>
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
            className="hidden text-sm font-medium text-gray-700 hover:text-emerald-600 md:block"
          >
            Productores
          </Link>

          {!user && (
            <Link
              href="/login?callbackUrl=%2Fvendor%2Fdashboard"
              className="hidden text-sm font-medium text-gray-700 hover:text-emerald-600 lg:block"
            >
              Portal productor
            </Link>
          )}

          {/* Search */}
          <form
            action="/productos"
            className="hidden flex-1 md:block"
          >
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                name="q"
                type="search"
                placeholder="Buscar productos, productores..."
                className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </form>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <Link
                  href={portalHref}
                  className="hidden rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 md:block"
                >
                  {portalLabel}
                </Link>
                <Link
                  href="/cuenta"
                  className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 md:flex"
                >
                  <UserCircleIcon className="h-5 w-5" />
                  {user.name?.split(' ')[0]}
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={cn(
                    'hidden rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 md:block',
                    pathname === '/login' && 'bg-gray-100'
                  )}
                >
                  Entrar
                </Link>
                <Link
                  href="/register"
                  className="hidden rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 md:block"
                >
                  Registrarse
                </Link>
              </>
            )}

            {/* Cart */}
            <Link href="/carrito" className="relative rounded-lg p-2 hover:bg-gray-100">
              <ShoppingCartIcon className="h-6 w-6 text-gray-700" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Link>

            {/* Mobile menu */}
            <button
              onClick={() => setMobileOpen(v => !v)}
              className="rounded-lg p-2 hover:bg-gray-100 md:hidden"
            >
              {mobileOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-gray-200 bg-white md:hidden">
          <div className="p-4 space-y-1">
            <form action="/productos" className="mb-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  name="q"
                  type="search"
                  placeholder="Buscar..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:outline-none"
                />
              </div>
            </form>
            {CATEGORIES.map(cat => (
              <Link
                key={cat.slug}
                href={`/productos?categoria=${cat.slug}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <span>{cat.icon}</span> {cat.name}
              </Link>
            ))}
            <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
              {user ? (
                <>
                  <Link
                    href={portalHref}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700"
                  >
                    {portalLabel}
                  </Link>
                  <Link href="/cuenta" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700">
                    <UserCircleIcon className="h-5 w-5" /> Mi cuenta
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/login?callbackUrl=%2Fvendor%2Fdashboard"
                    className="block rounded-lg bg-emerald-50 px-4 py-2 text-center text-sm font-medium text-emerald-700"
                  >
                    Portal productor
                  </Link>
                  <div className="flex gap-2">
                    <Link href="/login" className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-medium">Entrar</Link>
                    <Link href="/register" className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white">Registrarse</Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
