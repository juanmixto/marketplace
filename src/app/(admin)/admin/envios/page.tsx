import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { addShippingRate, createShippingZone } from '@/domains/admin/actions'
import { ShippingRateActions } from '@/components/admin/ShippingRateActions'
import { formatPrice } from '@/lib/utils'

export const metadata: Metadata = { title: 'Envios | Admin' }
export const revalidate = 30

export default async function AdminShippingPage() {
  const zones = await db.shippingZone.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      rates: {
        orderBy: [{ minOrderAmount: 'desc' }, { createdAt: 'asc' }],
      },
    },
  })

  const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500'

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Operaciones</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Envios</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Gestiona zonas y tarifas usadas por checkout para calcular el envío por código postal.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form action={createShippingZone} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Nueva zona</h2>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">Nombre</span>
            <input name="name" className={inputCls} placeholder="Península" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">Provincias o prefijos</span>
            <textarea
              name="provinces"
              rows={3}
              className={inputCls}
              placeholder="28, 08, Sevilla, Madrid"
            />
          </label>
          <button type="submit" className="rounded-xl bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90">
            Crear zona
          </button>
        </form>

        <form action={addShippingRate} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Nueva tarifa</h2>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">Zona</span>
            <select name="zoneId" defaultValue="" className={inputCls}>
              <option value="" disabled>Selecciona una zona</option>
              {zones.map(zone => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">Nombre</span>
              <input name="name" className={inputCls} placeholder="Estándar 3-5 días" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">Precio</span>
              <input name="price" type="number" step="0.01" min="0" className={inputCls} placeholder="4.95" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">Importe mínimo</span>
              <input name="minOrderAmount" type="number" step="0.01" min="0" className={inputCls} placeholder="0" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">Envío gratis desde</span>
              <input name="freeAbove" type="number" step="0.01" min="0" className={inputCls} placeholder="35" />
            </label>
          </div>
          <button type="submit" className="rounded-xl bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90">
            Añadir tarifa
          </button>
        </form>
      </div>

      <div className="space-y-4">
        {zones.map(zone => (
          <div key={zone.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">{zone.name}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{zone.provinces.join(', ')}</p>
              </div>
              <span className={zone.isActive ? 'rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400' : 'rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]'}>
                {zone.isActive ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
              <div className="grid grid-cols-[1fr,0.8fr,0.8fr,0.8fr,auto] gap-4 border-b border-[var(--border)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <span>Tarifa</span>
                <span>Mínimo</span>
                <span>Precio</span>
                <span>Gratis desde</span>
                <span>Acciones</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {zone.rates.map(rate => (
                  <div key={rate.id} className="grid grid-cols-[1fr,0.8fr,0.8fr,0.8fr,auto] gap-4 px-4 py-3 text-sm items-center">
                    <span className="font-medium text-[var(--foreground)]">{rate.name}</span>
                    <span className="text-[var(--foreground-soft)]">{rate.minOrderAmount == null ? '0,00 EUR' : formatPrice(Number(rate.minOrderAmount))}</span>
                    <span className="text-[var(--foreground-soft)]">{formatPrice(Number(rate.price))}</span>
                    <span className="text-[var(--foreground-soft)]">{rate.freeAbove == null ? 'No aplica' : formatPrice(Number(rate.freeAbove))}</span>
                    <ShippingRateActions rateId={rate.id} />
                  </div>
                ))}
                {zone.rates.length === 0 && (
                  <p className="px-4 py-6 text-sm text-[var(--muted)]">Esta zona aún no tiene tarifas.</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {zones.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
            Todavía no hay zonas de envío creadas.
          </p>
        )}
      </div>
    </div>
  )
}
