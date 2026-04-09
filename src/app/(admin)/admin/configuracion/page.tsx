import type { Metadata } from 'next'
import { getMarketplaceConfig } from '@/lib/config'
import { updateMarketplaceConfigAction } from '@/domains/admin/actions'

export const metadata: Metadata = { title: 'Configuracion Marketplace' }

function percentToDisplay(value: number) {
  return Number((value * 100).toFixed(2))
}

export default async function AdminMarketplaceConfigPage() {
  const config = await getMarketplaceConfig()

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Operaciones</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Configuracion del marketplace</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Ajusta los valores globales que afectan a comisiones, envio, mantenimiento y mensaje principal de la home.
        </p>
      </div>

      <form action={updateMarketplaceConfigAction} className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-900">Comision por defecto (%)</span>
            <input
              name="DEFAULT_COMMISSION_RATE"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={percentToDisplay(config.DEFAULT_COMMISSION_RATE)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none"
            />
            <span className="text-xs text-gray-500">Se aplica a nuevos productores si no se define otra comision.</span>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-900">Umbral de envio gratis (EUR)</span>
            <input
              name="FREE_SHIPPING_THRESHOLD"
              type="number"
              min="0"
              step="0.01"
              defaultValue={config.FREE_SHIPPING_THRESHOLD}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none"
            />
            <span className="text-xs text-gray-500">A partir de este importe el carrito no suma envio.</span>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-900">Coste fijo de envio (EUR)</span>
            <input
              name="FLAT_SHIPPING_COST"
              type="number"
              min="0"
              step="0.01"
              defaultValue={config.FLAT_SHIPPING_COST}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none"
            />
            <span className="text-xs text-gray-500">Se usa cuando el pedido no alcanza el umbral de envio gratis.</span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <input
              name="MAINTENANCE_MODE"
              type="checkbox"
              defaultChecked={config.MAINTENANCE_MODE}
              className="mt-0.5 rounded border-gray-300 text-gray-900"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Modo mantenimiento</span>
              <span className="mt-1 block text-xs text-gray-500">
                Permite mostrar un estado global de mantenimiento en el storefront sin tocar deploy.
              </span>
            </span>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-900">Texto del banner principal</span>
          <textarea
            name="HERO_BANNER_TEXT"
            rows={3}
            maxLength={160}
            defaultValue={config.HERO_BANNER_TEXT}
            placeholder="Ejemplo: Envio gratis este fin de semana en pedidos superiores a 25 EUR."
            className="w-full rounded-2xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none"
          />
          <span className="text-xs text-gray-500">Si lo dejas vacio, la home no mostrara ningun banner promocional.</span>
        </label>

        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>Los cambios se aplican al storefront, carrito, checkout y panel admin tras guardar.</p>
          <button
            type="submit"
            className="rounded-xl bg-gray-900 px-4 py-2 font-medium text-white transition hover:bg-gray-800"
          >
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  )
}
