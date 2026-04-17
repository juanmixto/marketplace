'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon, ArchiveBoxIcon, ShoppingBagIcon,
  CurrencyEuroIcon, UserCircleIcon, ArrowTopRightOnSquareIcon,
  StarIcon, TagIcon, ArrowPathIcon,
  ChatBubbleLeftRightIcon, BellIcon,
  ChevronDoubleLeftIcon, XMarkIcon,
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
  '/vendor/ajustes/telegram':       ChatBubbleLeftRightIcon,
  '/vendor/ajustes/notificaciones': BellIcon,
} as const

interface Props {
  vendor?: { displayName: string; status: string; slug: string } | null
}

const SIDEBAR_EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)'
const SIDEBAR_DURATION_MS = 320

export function VendorSidebar({ vendor }: Props) {
  const pathname = usePathname()
  const t = useT()
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar()

  const collapseLabel = collapsed ? t('vendor.sidebar.expand') : t('vendor.sidebar.collapse')
  const closeMenuLabel = t('vendor.sidebar.closeMenu')

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
        aria-label={t('vendor.sidebar.portalTitle')}
      >
        <div className="relative flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
          <div
            className={cn(
              'min-w-0 flex-1 transition-opacity duration-300 ease-out',
              collapsed && 'md:invisible md:opacity-0',
            )}
          >
            <p className="text-[9px] font-semibold uppercase leading-none tracking-widest text-[var(--muted)]">{t('vendor.sidebar.portalTitle')}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  vendor?.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-400'
                )}
                aria-label={vendor?.status === 'ACTIVE' ? t('vendor.sidebar.statusActive') : t('vendor.sidebar.statusPending')}
                title={vendor?.status === 'ACTIVE' ? t('vendor.sidebar.statusActive') : t('vendor.sidebar.statusPending')}
              />
              <p className="text-sm font-semibold leading-none text-[var(--foreground)] truncate">{vendor?.displayName ?? '…'}</p>
            </div>
          </div>
          {collapsed && (
            <div
              className="pointer-events-none hidden md:flex md:absolute md:inset-0 md:items-center md:justify-center"
              aria-hidden="true"
            >
              <div
                className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/30 dark:bg-emerald-500 dark:text-gray-950 dark:ring-emerald-300/30"
                title={vendor?.displayName ?? undefined}
              >
                <span className="text-[11px] font-bold">
                  {vendor?.displayName?.slice(0, 2).toUpperCase() ?? '—'}
                </span>
                <span
                  className={cn(
                    'absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface)]',
                    vendor?.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-amber-400'
                  )}
                />
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={closeMobile}
            className="md:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2.5 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
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
                    collapsed && 'md:h-10 md:justify-center md:gap-0 md:px-0 md:py-0',
                  )}
                  title={collapsed ? label : undefined}
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
          {vendor?.slug && (
            <Link
              href={`/productores/${vendor.slug}`}
              title={collapsed ? t('vendor.sidebar.viewStore') : undefined}
              aria-label={t('vendor.sidebar.viewStore')}
              style={labelStyle}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition-[width,height,padding,margin] ease-out hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
                collapsed && 'md:h-10 md:justify-center md:gap-0 md:px-0 md:py-0',
              )}
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0" />
              <span className={labelCls} style={labelStyle}>{t('vendor.sidebar.viewStore')}</span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            style={labelStyle}
            className={cn(
              'hidden md:flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition-[width,height,padding,margin] ease-out hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
              collapsed && 'md:h-10 md:justify-center md:gap-0 md:px-0 md:py-0',
            )}
            aria-label={collapseLabel}
            aria-pressed={collapsed}
            title={collapseLabel}
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center transition-transform duration-300 ease-out',
                collapsed && 'rotate-180',
              )}
            >
              <ChevronDoubleLeftIcon className="h-4 w-4" />
            </span>
            <span className={labelCls} style={labelStyle}>{collapseLabel}</span>
          </button>
        </div>
      </aside>
    </>
  )
}
