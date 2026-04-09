import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatPrice } from '@/lib/utils'
import { ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import type { Metadata } from 'next'
import { getAvailableProductWhere } from '@/domains/catalog/availability'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function VendorDashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const vendor = await db.vendor.findUnique({
    where: { userId: session.user.id },
    include: {
      products: { where: getAvailableProductWhere() },
      fulfillments: {
        where: { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] } },
        include: { order: { include: { lines: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!vendor) redirect('/login')

  const urgent = vendor.fulfillments.filter(f => f.status === 'PENDING' || f.status === 'READY')
  const setupSteps = [
    { key: 'profile', label: 'Completar perfil', done: !!(vendor.description && vendor.location) },
    { key: 'product', label: 'Añadir primer producto', done: vendor.products.length > 0 },
    { key: 'bank', label: 'Datos bancarios', done: !!vendor.iban },
  ]
  const setupDone = setupSteps.filter(s => s.done).length
  const isNew = setupDone < 3

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Buenos días, {vendor.displayName}</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">¿Qué necesitas hacer hoy?</p>
      </div>

      {/* Onboarding checklist — only for new/incomplete vendors */}
      {isNew && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-amber-900 dark:text-amber-300">Configura tu cuenta ({setupDone}/3)</h2>
            <div className="h-2 w-32 rounded-full bg-amber-200 dark:bg-amber-900">
              <div
                className="h-2 rounded-full bg-amber-500 transition-all"
                style={{ width: `${(setupDone / 3) * 100}%` }}
              />
            </div>
          </div>
          <div className="space-y-2">
            {setupSteps.map(step => (
              <div key={step.key} className="flex items-center gap-2 text-sm">
                {step.done
                  ? <CheckCircleIcon className="h-5 w-5 text-emerald-500 shrink-0" />
                  : <div className="h-5 w-5 rounded-full border-2 border-amber-400 shrink-0" />}
                <span className={step.done ? 'text-[var(--muted)] line-through' : 'text-amber-900 dark:text-amber-300 font-medium'}>
                  {step.label}
                </span>
                {!step.done && (
                  <Link href={`/vendor/${step.key === 'product' ? 'productos/nuevo' : 'perfil'}`}
                    className="ml-auto rounded-sm text-xs text-amber-700 hover:underline dark:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30">
                    Hacer ahora →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Urgent orders */}
      {urgent.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-800 dark:bg-red-950/30">
          <div className="flex items-center gap-2 mb-3">
            <ExclamationCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
            <h2 className="font-semibold text-red-900 dark:text-red-300">{urgent.length} pedido{urgent.length > 1 ? 's' : ''} requieren acción</h2>
          </div>
          <div className="space-y-2">
            {urgent.map(f => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">Pedido #{f.orderId.slice(-6).toUpperCase()}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {f.status === 'PENDING' ? 'Pendiente de confirmación' : 'Listo para enviar'}
                  </p>
                </div>
                <Link href="/vendor/productos"
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                  Ver pedidos
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: 'Productos activos', value: vendor.products.length },
          { label: 'Pedidos activos', value: vendor.fulfillments.length },
          { label: 'Valoración', value: vendor.avgRating ? `${Number(vendor.avgRating).toFixed(1)}★` : '—' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <p className="text-2xl font-bold text-[var(--foreground)]">{s.value}</p>
            <p className="text-sm text-[var(--muted)]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="font-semibold text-[var(--foreground)] mb-3">Acciones rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/vendor/productos/nuevo"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            + Nuevo producto
          </Link>
          <Link href="/vendor/productos"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            Gestionar catálogo
          </Link>
          <Link href="/"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            Ver tienda
          </Link>
        </div>
      </div>
    </div>
  )
}
