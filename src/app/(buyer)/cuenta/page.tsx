import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShoppingBagIcon, MapPinIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import { SignOutButton } from '@/components/auth/SignOutButton'
import type { Metadata } from 'next'
import { buyerAccountItems } from '@/lib/navigation'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function CuentaPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const initial = session.user.name?.[0]?.toUpperCase() ?? '?'

  const linkMeta = {
    '/cuenta/pedidos': {
      icon: ShoppingBagIcon,
      desc: 'Consulta y gestiona tus pedidos',
    },
    '/cuenta/direcciones': {
      icon: MapPinIcon,
      desc: 'Gestiona tus direcciones de entrega',
    },
    '/cuenta/perfil': {
      icon: UserCircleIcon,
      desc: 'Nombre, email y contrasena',
    },
  } as const

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Avatar */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-2xl font-bold text-white">
          {initial}
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900">{session.user.name}</p>
          <p className="text-sm text-gray-500">{session.user.email}</p>
        </div>
      </div>

      <div className="space-y-2">
        {buyerAccountItems.map(({ href, label, available }) => {
          const meta = linkMeta[href as keyof typeof linkMeta]
          const Icon = meta.icon

          if (!available) {
            return (
              <div
                key={href}
                className="flex items-center gap-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
                  <Icon className="h-5 w-5 text-gray-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-700">{label}</p>
                  <p className="text-sm text-gray-500">{meta.desc}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500">
                  Proximamente
                </span>
              </div>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50">
                <Icon className="h-5 w-5 text-gray-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{label}</p>
                <p className="text-sm text-gray-500">{meta.desc}</p>
              </div>
              <ChevronRightIcon className="h-5 w-5 text-gray-400" />
            </Link>
          )
        })}
      </div>

      <div className="mt-6">
        <SignOutButton />
      </div>
    </div>
  )
}
