import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_NAME } from '@/lib/constants'
import { RetryButton } from './RetryButton'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Sin conexión',
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
        <div
          aria-hidden
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl dark:bg-emerald-950/60"
        >
          🌿
        </div>
        <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
          Sin conexión
        </h1>
        <p className="mb-6 text-sm text-[var(--foreground-soft)]">
          No hemos podido cargar {SITE_NAME}. Revisa tu conexión e inténtalo de
          nuevo.
        </p>
        <div className="flex flex-col gap-2">
          <RetryButton />
          <Link
            href="/"
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  )
}
