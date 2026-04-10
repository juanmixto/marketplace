'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon, ShoppingBagIcon, TruckIcon, UsersIcon, ArchiveBoxIcon,
  ScaleIcon, Cog6ToothIcon, ClipboardDocumentListIcon,
  CurrencyEuroIcon, ExclamationTriangleIcon, ChartBarIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { adminNavItems } from '@/lib/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'

const NAV_META = {
  '/admin/dashboard':    HomeIcon,
  '/admin/pedidos':      ShoppingBagIcon,
  '/admin/productores':  UsersIcon,
  '/admin/productos':    ArchiveBoxIcon,
  '/admin/envios':       TruckIcon,
  '/admin/comisiones':   ScaleIcon,
  '/admin/configuracion':Cog6ToothIcon,
  '/admin/auditoria':    ClipboardDocumentListIcon,
  '/admin/liquidaciones':CurrencyEuroIcon,
  '/admin/incidencias':  ExclamationTriangleIcon,
  '/admin/informes':     ChartBarIcon,
} as const

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Panel Admin</p>
        <p className="mt-1 font-bold text-[var(--foreground)]">Mercado Productor</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {adminNavItems.map(({ href, label, available }) => {
          const Icon = NAV_META[href as keyof typeof NAV_META]
          const isActive = pathname === href || pathname.startsWith(href + '/')

          if (!available) {
            return (
              <div key={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)]">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                <span className="rounded-full bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--muted)]">
                  Soon
                </span>
              </div>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/30 dark:bg-emerald-500 dark:text-gray-950 dark:ring-emerald-300/30'
                  : 'text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-2 space-y-0.5">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          Ver tienda
        </Link>
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs text-[var(--muted)]">Tema</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
