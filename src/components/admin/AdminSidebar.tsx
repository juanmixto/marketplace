'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon, ShoppingBagIcon, TruckIcon, UsersIcon, ArchiveBoxIcon,
  ScaleIcon, Cog6ToothIcon, ClipboardDocumentListIcon,
  CurrencyEuroIcon, ExclamationTriangleIcon, ChartBarIcon,
  PresentationChartLineIcon,
  ArrowTopRightOnSquareIcon, TagIcon, ArrowPathIcon,
  BellIcon,
  ChevronDoubleLeftIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { adminNavItems } from '@/lib/navigation'
import { useSidebar } from '@/components/layout/SidebarProvider'
import { useFeatureFlagStrict } from '@/lib/flags.client'
import { ArchiveBoxArrowDownIcon } from '@heroicons/react/24/outline'

const NAV_META = {
  '/admin/dashboard':     HomeIcon,
  '/admin/pedidos':       ShoppingBagIcon,
  '/admin/usuarios':      UsersIcon,
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
  '/admin/analytics':     PresentationChartLineIcon,
  '/admin/notificaciones': BellIcon,
  '/admin/ingestion': ArchiveBoxArrowDownIcon,
} as const

const SIDEBAR_EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)'
const SIDEBAR_DURATION_MS = 320

export function AdminSidebar() {
  const pathname = usePathname()
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar()
  const ingestionAdminEnabled = useFeatureFlagStrict('feat-ingestion-admin')
  const visibleNavItems = adminNavItems.filter((item) => {
    if (!item.flag) return true
    if (item.flag === 'feat-ingestion-admin') return ingestionAdminEnabled
    return false
  })

  const labelCls = cn(
    'overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] ease-out',
    collapsed ? 'md:max-w-0 md:opacity-0 md:ml-0' : 'md:max-w-[12rem] md:opacity-100',
  )
  const labelStyle = { transitionDuration: `${SIDEBAR_DURATION_MS}ms` }
  const asideStyle = {
    transitionDuration: `${SIDEBAR_DURATION_MS}ms`,
    transitionTimingFunction: SIDEBAR_EASE,
    transitionProperty: 'width, transform',
  }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/40 md:hidden transition-opacity duration-300 ease-out',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={closeMobile}
        aria-hidden="true"
      />

      <aside
        style={asideStyle}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] will-change-[width,transform]',
          'w-56 md:static md:z-auto md:translate-x-0',
          collapsed ? 'md:w-16' : 'md:w-56',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        aria-label="Panel Admin"
      >
        <div className="relative flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
          <div
            className={cn(
              'min-w-0 flex-1 transition-opacity duration-300 ease-out',
              collapsed && 'md:invisible md:opacity-0',
            )}
          >
            <p className="text-[9px] font-semibold uppercase leading-none tracking-widest text-[var(--muted)]">Panel Admin</p>
            <p className="mt-1 text-sm font-bold leading-none text-[var(--foreground)] truncate">Mercado Productor</p>
          </div>
          {collapsed && (
            <div
              className="pointer-events-none hidden md:flex md:absolute md:inset-0 md:items-center md:justify-center"
              aria-hidden="true"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/30 dark:bg-emerald-500 dark:text-gray-950 dark:ring-emerald-300/30">
                <span className="text-[11px] font-bold">MP</span>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={closeMobile}
            className="md:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2.5 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
            aria-label="Cerrar menú"
            title="Cerrar menú"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {visibleNavItems.map(({ href, label, available }) => {
            const Icon = NAV_META[href as keyof typeof NAV_META]
            const isActive = pathname === href || pathname.startsWith(href + '/')

            if (!available) {
              return (
                <div
                  key={href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)]',
                    collapsed && 'md:h-10 md:justify-center md:gap-0 md:px-0 md:py-0',
                  )}
                  title={collapsed ? `${label} (próximamente)` : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={cn('flex-1', labelCls)} style={labelStyle}>{label}</span>
                  <span
                    style={labelStyle}
                    className={cn(
                      'rounded-full bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--muted)] transition-opacity ease-out',
                      collapsed && 'md:opacity-0 md:w-0 md:p-0 md:overflow-hidden',
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
                style={labelStyle}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,color,width,height,padding,margin] ease-out',
                  collapsed && 'md:h-10 md:justify-center md:gap-0 md:px-0 md:py-0',
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/30 dark:bg-emerald-500 dark:text-gray-950 dark:ring-emerald-300/30'
                    : 'text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={labelCls} style={labelStyle}>{label}</span>
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
            style={labelStyle}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition-[width,height,padding,margin] ease-out hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
              collapsed && 'md:h-10 md:justify-center md:gap-0 md:px-0 md:py-0',
            )}
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0" />
            <span className={labelCls} style={labelStyle}>Ver tienda</span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            style={labelStyle}
            className={cn(
              'hidden md:flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition-[width,height,padding,margin] ease-out hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
              collapsed && 'md:h-10 md:justify-center md:gap-0 md:px-0 md:py-0',
            )}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
            aria-pressed={collapsed}
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center transition-transform duration-300 ease-out',
                collapsed && 'rotate-180',
              )}
            >
              <ChevronDoubleLeftIcon className="h-4 w-4" />
            </span>
            <span className={labelCls} style={labelStyle}>Contraer</span>
          </button>
        </div>
      </aside>
    </>
  )
}
