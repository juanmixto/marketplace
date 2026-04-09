'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  ShoppingBagIcon,
  UsersIcon,
  ArchiveBoxIcon,
  Cog6ToothIcon,
  CurrencyEuroIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { adminNavItems } from '@/lib/navigation'

const NAV_META = {
  '/admin/dashboard': HomeIcon,
  '/admin/pedidos': ShoppingBagIcon,
  '/admin/productores': UsersIcon,
  '/admin/productos': ArchiveBoxIcon,
  '/admin/configuracion': Cog6ToothIcon,
  '/admin/liquidaciones': CurrencyEuroIcon,
  '/admin/incidencias': ExclamationTriangleIcon,
  '/admin/informes': ChartBarIcon,
} as const

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Panel Admin</p>
        <p className="mt-1 font-bold text-gray-900">Mercado Productor</p>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {adminNavItems.map(({ href, label, available }) => {
          const Icon = NAV_META[href as keyof typeof NAV_META]

          if (!available) {
            return (
              <div
                key={href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400"
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{label}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                  Proximamente
                </span>
              </div>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                pathname === href || pathname.startsWith(href + '/')
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-gray-100 p-2">
        <Link href="/" target="_blank"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          Ver tienda
        </Link>
      </div>
    </aside>
  )
}
