'use client'

import { signOut } from 'next-auth/react'
import { useState } from 'react'
import { UserCircleIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

interface Props {
  user: { name?: string | null; email?: string | null; role: string }
}

export function AdminHeader({ user }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-medium text-gray-500">En vivo</span>
        <Link
          href="/"
          className="ml-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          Ver tienda
        </Link>
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          <UserCircleIcon className="h-5 w-5" />
          <span>{user.name ?? user.email}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {user.role}
          </span>
          <ChevronDownIcon className="h-4 w-4 text-gray-400" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-gray-200 bg-white shadow-lg py-1 z-10">
              <p className="px-3 py-2 text-xs text-gray-400 border-b border-gray-100">{user.email}</p>
              <Link
                href="/"
                className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Ir a la tienda
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
