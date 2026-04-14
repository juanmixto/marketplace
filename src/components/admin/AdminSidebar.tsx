'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon, ShoppingBagIcon, TruckIcon, UsersIcon, ArchiveBoxIcon,
  ScaleIcon, Cog6ToothIcon, ClipboardDocumentListIcon,
  CurrencyEuroIcon, ExclamationTriangleIcon, ChartBarIcon,
  ArrowTopRightOnSquareIcon, TagIcon, ArrowPathIcon,
  ChevronDoubleLeftIcon, ChevronDoubleRightIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { adminNavItems } from '@/lib/navigation'
import { useSidebar } from '@/components/layout/SidebarProvider'

const NAV_META = {
  '/admin/dashboard':     HomeIcon,
  '/admin/pedidos':       ShoppingBagIcon,
  '/admin/productores':   UsersIcon,
  '/admin/productos':     ArchiveBoxIcon,
  '/admin/promociones':   TagIcon,
  '/admin/suscripciones': ArrowPathIcon,
  '/admin/envios':        TruckIcon,
  '/admin/comisiones':    ScaleIcon,
  '/admin/configuracion': Cog6ToothIcon,
  '/admin/auditoria':     ClipboardDocumentListIcon,
  '/admin/liquidaciones': CurrencyEuroIcon,
  '/admin/incidencias':   ExclamationTriangleIcon,
  '/admin/informes':      ChartBarIcon,
} as const

export function AdminSidebar() {
  const pathname = usePathname()
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar()

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-all duration-200 ease-out',
          'w-56 md:static md:z-auto md:translate-x-0',
          collapsed ? 'md:w-16' : 'md:w-56',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        aria-label="Panel Admin"
      >
        <div
          className={cn(
            'flex items-center justify-between border-b border-[var(--border)] py-4',
            collapsed ? 'md:px-2' : 'px-4',
          )}
        >
          <div className={cn('min-w-0', collapsed && 'md:hidden')}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Panel Admin</p>
            <p className="mt-1 font-bold text-[var(--foreground)] truncate">Mercado Productor</p>
          </div>
          {collapsed && (
            <div className="hidden md:flex w-full justify-center" aria-hidden="true">
              <span className="text-lg font-bold text-[var(--foreground)]">MP</span>
            </div>
          )}
          <button
            type="button"
            onClick={closeMobile}
            className="md:hidden rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
            aria-label="Cerrar menú"
            title="Cerrar menú"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {adminNavItems.map(({ href, label, available }) => {
            const Icon = NAV_META[href as keyof typeof NAV_META]
            const isActive = pathname === href || pathname.startsWith(href + '/')

            if (!available) {
              return (
                <div
                  key={href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)]',
                    collapsed && 'md:justify-center md:px-2',
                  )}
                  title={collapsed ? `${label} (próximamente)` : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={cn('flex-1', collapsed && 'md:hidden')}>{label}</span>
                  <span
                    className={cn(
                      'rounded-full bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--muted)]',
                      collapsed && 'md:hidden',
                    )}
                  >
                    Soon
                  </span>
                </div>
              )
            }

            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                aria-label={label}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  collapsed && 'md:justify-center md:px-2',
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/30 dark:bg-emerald-500 dark:text-gray-950 dark:ring-emerald-300/30'
                    : 'text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn(collapsed && 'md:hidden')}>{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-[var(--border)] p-2 space-y-0.5">
          <Link
            href="/"
            target="_blank"
            title={collapsed ? 'Ver tienda' : undefined}
            aria-label="Ver tienda"
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
              collapsed && 'md:justify-center md:px-2',
            )}
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            <span className={cn(collapsed && 'md:hidden')}>Ver tienda</span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              'hidden md:flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
              collapsed && 'md:justify-center md:px-2',
            )}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
            aria-pressed={collapsed}
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {collapsed ? (
              <ChevronDoubleRightIcon className="h-4 w-4" />
            ) : (
              <ChevronDoubleLeftIcon className="h-4 w-4" />
            )}
            <span className={cn(collapsed && 'md:hidden')}>Contraer</span>
          </button>
        </div>
      </aside>
    </>
  )
}
