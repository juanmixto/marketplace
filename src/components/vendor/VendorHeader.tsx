'use client'

import { signOut } from 'next-auth/react'
import { useState } from 'react'
import { UserCircleIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Props {
  user: { name?: string | null; email?: string | null }
  vendor?: { displayName: string; status: string; slug: string } | null
}

export function VendorHeader({ user, vendor }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
        >
          Ver tienda
        </Link>
        {vendor?.slug && (
          <Link
            href={`/productores/${vendor.slug}`}
            target="_blank"
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
          >
            Mi escaparate ↗
          </Link>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
        >
          <UserCircleIcon className="h-5 w-5" />
          <span className="max-w-[120px] truncate">{user.name ?? user.email}</span>
          <ChevronDownIcon className={cn('h-3.5 w-3.5 text-[var(--muted)] transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-10 mt-2 w-52 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-1.5 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
              <p className="px-3 py-2 text-xs text-[var(--muted)] border-b border-[var(--border)] mb-1 truncate">{user.email}</p>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] rounded-lg mx-1"
              >
                Ir a la tienda
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full text-left px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg mx-1 mt-1 border-t border-[var(--border)] pt-2"
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
