'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon, ArchiveBoxIcon, ShoppingBagIcon,
  CurrencyEuroIcon, UserCircleIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { vendorNavItems } from '@/lib/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'

const NAV_META = {
  '/vendor/dashboard':    HomeIcon,
  '/vendor/pedidos':      ShoppingBagIcon,
  '/vendor/productos':    ArchiveBoxIcon,
  '/vendor/liquidaciones':CurrencyEuroIcon,
  '/vendor/perfil':       UserCircleIcon,
} as const

interface Props {
  vendor?: { displayName: string; status: string; slug: string } | null
}

export function VendorSidebar({ vendor }: Props) {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Portal Productor</p>
        <p className="mt-1 font-semibold text-[var(--foreground)] truncate">{vendor?.displayName ?? '...'}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={cn(
            'h-2 w-2 rounded-full',
            vendor?.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-400'
          )} />
          <span className="text-xs text-[var(--muted)]">
            {vendor?.status === 'ACTIVE' ? 'Activo' : 'Pendiente'}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {vendorNavItems.map(({ href, label, available }) => {
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
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950'
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
        {vendor?.slug && (
          <Link
            href={`/productores/${vendor.slug}`}
            target="_blank"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            Ver mi tienda
          </Link>
        )}
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs text-[var(--muted)]">Tema</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
