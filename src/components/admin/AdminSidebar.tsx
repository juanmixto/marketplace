'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  ShoppingBagIcon,
  UsersIcon,
  ArchiveBoxIcon,
  CurrencyEuroIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin/dashboard', icon: HomeIcon, label: 'Dashboard' },
  { href: '/admin/pedidos', icon: ShoppingBagIcon, label: 'Pedidos' },
  { href: '/admin/productores', icon: UsersIcon, label: 'Productores' },
  { href: '/admin/productos', icon: ArchiveBoxIcon, label: 'Productos' },
  { href: '/admin/liquidaciones', icon: CurrencyEuroIcon, label: 'Liquidaciones' },
  { href: '/admin/incidencias', icon: ExclamationTriangleIcon, label: 'Incidencias' },
  { href: '/admin/informes', icon: ChartBarIcon, label: 'Informes' },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Panel Admin</p>
        <p className="mt-1 font-bold text-gray-900">Mercado Productor</p>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map(({ href, icon: Icon, label }) => (
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
        ))}
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
