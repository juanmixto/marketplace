'use client'

import type React from 'react'
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
import { useSwipeToClose } from '@/lib/hooks/useSwipeToClose'
import { useFeatureFlagStrict } from '@/lib/flags.client'
import { LanguageToggle } from '@/components/LanguageToggle'
import { BrandMark } from '@/components/brand/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { useT } from '@/i18n'
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

interface Props {
  user?: { name?: string | null; email?: string | null } | null
}

export function AdminSidebar({ user }: Props = {}) {
  const pathname = usePathname()
  const t = useT()
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar()
  // Swipe-to-close gesture (mobile only). Drawer slides off the left edge,
  // so dragging towards the left dismisses it. Same hook as Header /
  // VendorSidebar.
  const swipe = useSwipeToClose({
    isOpen: mobileOpen,
    onClose: closeMobile,
    direction: 'left',
  })
  const ingestionAdminEnabled = useFeatureFlagStrict('feat-ingestion-admin')
  const adminAnalyticsEnabled = useFeatureFlagStrict('feat-admin-analytics')
  const adminReportsEnabled = useFeatureFlagStrict('feat-admin-reports')
  const flagState: Record<string, boolean> = {
    'feat-ingestion-admin': ingestionAdminEnabled,
    'feat-admin-analytics': adminAnalyticsEnabled,
    'feat-admin-reports': adminReportsEnabled,
  }
  const visibleNavItems = adminNavItems.filter((item) => {
    if (!item.flag) return true
    return flagState[item.flag] ?? false
  })

  const labelCls = cn(
    'overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] ease-out',
    collapsed ? 'md:max-w-0 md:opacity-0 md:ml-0' : 'md:max-w-[12rem] md:opacity-100',
  )
  const labelStyle = { transitionDuration: `${SIDEBAR_DURATION_MS}ms` }
  // While the user is actively swiping the drawer, the hook drives the
  // transform; otherwise the default sidebar easing handles open/close.
  const asideStyle: React.CSSProperties =
    mobileOpen && swipe.dragX !== 0
      ? {
          transform: `translateX(${swipe.dragX}px)`,
          transition: swipe.isDragging ? 'none' : 'transform 200ms ease-out',
          touchAction: 'pan-y',
        }
      : {
          transitionDuration: `${SIDEBAR_DURATION_MS}ms`,
          transitionTimingFunction: SIDEBAR_EASE,
          transitionProperty: 'width, transform',
          touchAction: 'pan-y',
        }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/40 md:hidden transition-opacity duration-300 ease-out',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={mobileOpen && swipe.dragX !== 0 ? { opacity: swipe.backdropOpacity } : undefined}
        onClick={closeMobile}
        aria-hidden="true"
      />

      <aside
        style={asideStyle}
        onTouchStart={mobileOpen ? swipe.handlers.onTouchStart : undefined}
        onTouchMove={mobileOpen ? swipe.handlers.onTouchMove : undefined}
        onTouchEnd={mobileOpen ? swipe.handlers.onTouchEnd : undefined}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] will-change-[width,transform]',
          'w-56 md:static md:z-auto md:translate-x-0',
          collapsed ? 'md:w-16' : 'md:w-56',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        aria-label={t('admin.sidebar.portalKicker')}
      >
        <div className="relative flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
          <div
            className={cn(
              'min-w-0 flex-1 transition-opacity duration-300 ease-out',
              collapsed && 'md:invisible md:opacity-0',
            )}
          >
            <p className="text-[9px] font-semibold uppercase leading-none tracking-widest text-[var(--muted)]">{t('admin.sidebar.portalKicker')}</p>
            <p className="mt-1 text-sm font-bold leading-none text-[var(--foreground)] truncate">{t('admin.sidebar.portalTitle')}</p>
          </div>
          {collapsed && (
            <div
              className="pointer-events-none hidden md:flex md:absolute md:inset-0 md:items-center md:justify-center"
              aria-hidden="true"
            >
              <BrandMark size={32} className="h-8 w-8 rounded-lg" />
            </div>
          )}
          <button
            type="button"
            onClick={closeMobile}
            className="md:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2.5 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
            aria-label={t('admin.sidebar.closeMenu')}
            title={t('admin.sidebar.closeMenu')}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {visibleNavItems.map(({ href, labelKey, available }) => {
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
                  title={collapsed ? `${label} ${t('admin.sidebar.itemSoonSuffix')}` : undefined}
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
                    {t('admin.sidebar.soon')}
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

        {/* Mobile-only footer: "Ver tienda" link + settings (language +
            theme), mirroring the public Header drawer pattern. */}
        <div className="md:hidden border-t border-[var(--border)] p-2">
          <Link
            href="/"
            target="_blank"
            onClick={closeMobile}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0" />
            {t('admin.sidebar.viewStore')}
          </Link>
        </div>
        <div className="md:hidden border-t border-[var(--border)] px-3 py-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            {t('settings')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        {/* Desktop footer (Ver tienda + Contraer) — hidden on mobile so
            the drawer ends with Cerrar sesión instead of nav links. */}
        <div className="hidden md:block border-t border-[var(--border)] p-2 space-y-0.5">
          <Link
            href="/"
            target="_blank"
            title={collapsed ? t('admin.sidebar.viewStore') : undefined}
            aria-label={t('admin.sidebar.viewStore')}
            style={labelStyle}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition-[width,height,padding,margin] ease-out hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
              collapsed && 'md:h-10 md:justify-center md:gap-0 md:px-0 md:py-0',
            )}
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0" />
            <span className={labelCls} style={labelStyle}>{t('admin.sidebar.viewStore')}</span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            style={labelStyle}
            className={cn(
              'hidden md:flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition-[width,height,padding,margin] ease-out hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
              collapsed && 'md:h-10 md:justify-center md:gap-0 md:px-0 md:py-0',
            )}
            aria-label={collapsed ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')}
            aria-pressed={collapsed}
            title={collapsed ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')}
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center transition-transform duration-300 ease-out',
                collapsed && 'rotate-180',
              )}
            >
              <ChevronDoubleLeftIcon className="h-4 w-4" />
            </span>
            <span className={labelCls} style={labelStyle}>{t('admin.sidebar.collapse')}</span>
          </button>
        </div>

        {user && (
          <div className="md:hidden border-t border-[var(--border)] p-3">
            <SignOutButton compact redirectTo="/login" />
          </div>
        )}
      </aside>
    </>
  )
}
