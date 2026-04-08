'use client'

import { signOut } from 'next-auth/react'
import { useState } from 'react'
import { UserCircleIcon, ChevronDownIcon } from '@heroicons/react/24/outline'

interface Props {
  user: { name?: string | null; email?: string | null }
  vendor?: { displayName: string; status: string } | null
}

export function VendorHeader({ user, vendor }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          <UserCircleIcon className="h-5 w-5" />
          <span>{user.name ?? user.email}</span>
          <ChevronDownIcon className="h-4 w-4 text-gray-400" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-gray-200 bg-white shadow-lg py-1 z-10">
              <p className="px-3 py-2 text-xs text-gray-400 border-b border-gray-100">{user.email}</p>
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
