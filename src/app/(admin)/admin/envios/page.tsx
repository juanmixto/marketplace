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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Operaciones</p>
        <h1 className="text-2xl font-bold text-gray-900">Envios</h1>
        <p className="mt-1 text-sm text-gray-500">Gestiona zonas y tarifas usadas por checkout para calcular el envío por código postal.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form action={createShippingZone} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Nueva zona</h2>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-gray-900">Nombre</span>
            <input name="name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="Península" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-gray-900">Provincias o prefijos</span>
            <textarea
              name="provinces"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              placeholder="28, 08, Sevilla, Madrid"
            />
          </label>
          <button type="submit" className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
            Crear zona
          </button>
        </form>

        <form action={addShippingRate} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Nueva tarifa</h2>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-gray-900">Zona</span>
            <select name="zoneId" defaultValue="" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">
              <option value="" disabled>Selecciona una zona</option>
              {zones.map(zone => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-900">Nombre</span>
              <input name="name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="Estándar 3-5 días" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-900">Precio</span>
              <input name="price" type="number" step="0.01" min="0" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="4.95" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-900">Importe mínimo</span>
              <input name="minOrderAmount" type="number" step="0.01" min="0" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="0" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-900">Envío gratis desde</span>
              <input name="freeAbove" type="number" step="0.01" min="0" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="35" />
            </label>
          </div>
          <button type="submit" className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
            Añadir tarifa
          </button>
        </form>
      </div>

      <div className="space-y-4">
        {zones.map(zone => (
          <div key={zone.id} className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{zone.name}</h2>
                <p className="mt-1 text-sm text-gray-500">{zone.provinces.join(', ')}</p>
              </div>
              <span className={zone.isActive ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700' : 'rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500'}>
                {zone.isActive ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
              <div className="grid grid-cols-[1fr,0.8fr,0.8fr,0.8fr,auto] gap-4 border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <span>Tarifa</span>
                <span>Mínimo</span>
                <span>Precio</span>
                <span>Gratis desde</span>
                <span>Acciones</span>
              </div>
              <div className="divide-y divide-gray-100">
                {zone.rates.map(rate => (
                  <div key={rate.id} className="grid grid-cols-[1fr,0.8fr,0.8fr,0.8fr,auto] gap-4 px-4 py-3 text-sm items-center">
                    <span className="font-medium text-gray-900">{rate.name}</span>
                    <span className="text-gray-600">{rate.minOrderAmount == null ? '0,00 EUR' : formatPrice(Number(rate.minOrderAmount))}</span>
                    <span className="text-gray-600">{formatPrice(Number(rate.price))}</span>
                    <span className="text-gray-600">{rate.freeAbove == null ? 'No aplica' : formatPrice(Number(rate.freeAbove))}</span>
                    <ShippingRateActions rateId={rate.id} />
                  </div>
                ))}
                {zone.rates.length === 0 && (
                  <p className="px-4 py-6 text-sm text-gray-500">Esta zona aún no tiene tarifas.</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {zones.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Todavía no hay zonas de envío creadas.
          </p>
        )}
      </div>
    </div>
  )
}
