'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon, ArchiveBoxIcon, ShoppingBagIcon,
  CurrencyEuroIcon, UserCircleIcon, ArrowTopRightOnSquareIcon,
  StarIcon, TagIcon, ArrowPathIcon,
  ChevronDoubleLeftIcon, ChevronDoubleRightIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { vendorNavItems } from '@/lib/navigation'
import { useT } from '@/i18n'
import { useSidebar } from '@/components/layout/SidebarProvider'

const NAV_META = {
  '/vendor/dashboard':     HomeIcon,
  '/vendor/pedidos':       ShoppingBagIcon,
  '/vendor/productos':     ArchiveBoxIcon,
  '/vendor/promociones':   TagIcon,
  '/vendor/suscripciones': ArrowPathIcon,
  '/vendor/valoraciones':  StarIcon,
  '/vendor/liquidaciones': CurrencyEuroIcon,
  '/vendor/perfil':        UserCircleIcon,
} as const

interface Props {
  vendor?: { displayName: string; status: string; slug: string } | null
}

export function VendorSidebar({ vendor }: Props) {
  const pathname = usePathname()
  const t = useT()
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar()

  const collapseLabel = collapsed ? t('vendor.sidebar.expand') : t('vendor.sidebar.collapse')
  const closeMenuLabel = t('vendor.sidebar.closeMenu')

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
        aria-label={t('vendor.sidebar.portalTitle')}
      >
        <div
          className={cn(
            'flex items-start justify-between border-b border-[var(--border)] py-4',
            collapsed ? 'md:px-2' : 'px-4',
          )}
        >
          <div className={cn('min-w-0 flex-1', collapsed && 'md:hidden')}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">{t('vendor.sidebar.portalTitle')}</p>
            <p className="mt-1 font-semibold text-[var(--foreground)] truncate">{vendor?.displayName ?? '…'}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={cn(
                'h-2 w-2 rounded-full',
                vendor?.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-400'
              )} />
              <span className="text-xs text-[var(--muted)]">
                {vendor?.status === 'ACTIVE' ? t('vendor.sidebar.statusActive') : t('vendor.sidebar.statusPending')}
              </span>
            </div>
          </div>
          {collapsed && (
            <div className="hidden md:flex w-full flex-col items-center gap-1" aria-hidden="true">
              <span className={cn(
                'h-2 w-2 rounded-full',
                vendor?.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-400'
              )} />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
                {vendor?.displayName?.slice(0, 2).toUpperCase() ?? '—'}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={closeMobile}
            className="md:hidden rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
            aria-label={closeMenuLabel}
            title={closeMenuLabel}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {vendorNavItems.map(({ href, labelKey, available }) => {
            const Icon = NAV_META[href as keyof typeof NAV_META]
            const isActive = pathname === href || pathname.startsWith(href + '/')
            const label = t(labelKey)

            if (!available) {
              return (
                <div
                  key={href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)]',
                    collapsed && 'md:justify-center md:px-2',
                  )}
                  title={collapsed ? label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={cn('flex-1', collapsed && 'md:hidden')}>{label}</span>
                  <span className={cn(
                    'rounded-full bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--muted)]',
                    collapsed && 'md:hidden',
                  )}>
                    {t('vendor.sidebar.soon')}
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
          {vendor?.slug && (
            <Link
              href={`/productores/${vendor.slug}`}
              target="_blank"
              title={collapsed ? t('vendor.sidebar.viewStore') : undefined}
              aria-label={t('vendor.sidebar.viewStore')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
                collapsed && 'md:justify-center md:px-2',
              )}
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              <span className={cn(collapsed && 'md:hidden')}>{t('vendor.sidebar.viewStore')}</span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              'hidden md:flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
              collapsed && 'md:justify-center md:px-2',
            )}
            aria-label={collapseLabel}
            aria-pressed={collapsed}
            title={collapseLabel}
          >
            {collapsed ? (
              <ChevronDoubleRightIcon className="h-4 w-4" />
            ) : (
              <ChevronDoubleLeftIcon className="h-4 w-4" />
            )}
            <span className={cn(collapsed && 'md:hidden')}>{collapseLabel}</span>
          </button>
        </div>
      </aside>
    </>
  )
}
