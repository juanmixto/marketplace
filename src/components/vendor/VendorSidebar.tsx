'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  ArchiveBoxIcon,
  ShoppingBagIcon,
  CurrencyEuroIcon,
  UserCircleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/vendor/dashboard', icon: HomeIcon, label: 'Inicio' },
  { href: '/vendor/pedidos', icon: ShoppingBagIcon, label: 'Mis pedidos' },
  { href: '/vendor/productos', icon: ArchiveBoxIcon, label: 'Mi catálogo' },
  { href: '/vendor/liquidaciones', icon: CurrencyEuroIcon, label: 'Liquidaciones' },
  { href: '/vendor/perfil', icon: UserCircleIcon, label: 'Mi perfil' },
]

interface Props {
  vendor?: { displayName: string; status: string; slug: string } | null
}

export function VendorSidebar({ vendor }: Props) {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Portal Productor</p>
        <p className="mt-1 font-semibold text-gray-900 truncate">{vendor?.displayName ?? '...'}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', vendor?.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-400')} />
          <span className="text-xs text-gray-500">{vendor?.status === 'ACTIVE' ? 'Activo' : 'Pendiente'}</span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-emerald-50 text-emerald-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {vendor?.slug && (
        <div className="border-t border-gray-100 p-2">
          <Link
            href={`/productores/${vendor.slug}`}
            target="_blank"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            Ver mi tienda
          </Link>
        </div>
      )}
    </aside>
  )
}
