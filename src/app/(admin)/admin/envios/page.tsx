import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { addShippingRate, createShippingZone } from '@/domains/admin/actions'
import { ShippingRateActions } from '@/components/admin/ShippingRateActions'
import { AdminShipmentRowActions } from '@/components/admin/AdminShipmentRowActions'
import { listShipmentsForAdmin } from '@/domains/shipping/admin-actions'
import { formatPrice, formatDate } from '@/lib/utils'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Envios | Admin' }
export const revalidate = 30

const FAILED_STATUSES = ['FAILED', 'EXCEPTION']

export default async function AdminShippingPage() {
  const t = await getServerT()
  const [zones, shipments] = await Promise.all([
    db.shippingZone.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        rates: {
          orderBy: [{ minOrderAmount: 'desc' }, { createdAt: 'asc' }],
        },
      },
    }),
    listShipmentsForAdmin(50),
  ])

  const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500'

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t('admin.shipments.kicker')}</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.shipments.title')}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t('admin.shipments.subtitle')}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form action={createShippingZone} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('admin.shipments.newZone')}</h2>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.shipments.zoneName')}</span>
            <input name="name" className={inputCls} placeholder={t('admin.shipments.zoneNamePlaceholder')} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.shipments.provinces')}</span>
            <textarea
              name="provinces"
              rows={3}
              className={inputCls}
              placeholder={t('admin.shipments.provincesPlaceholder')}
            />
          </label>
          <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400">
            {t('admin.shipments.createZone')}
          </button>
        </form>

        <form action={addShippingRate} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('admin.shipments.newRate')}</h2>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.shipments.zone')}</span>
            <select name="zoneId" defaultValue="" className={inputCls}>
              <option value="" disabled>{t('admin.shipments.selectZone')}</option>
              {zones.map(zone => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.shipments.rateName')}</span>
              <input name="name" className={inputCls} placeholder={t('admin.shipments.rateNamePlaceholder')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.shipments.price')}</span>
              <input name="price" type="number" step="0.01" min="0" className={inputCls} placeholder="4.95" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.shipments.minOrderAmount')}</span>
              <input name="minOrderAmount" type="number" step="0.01" min="0" className={inputCls} placeholder="0" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.shipments.freeAbove')}</span>
              <input name="freeAbove" type="number" step="0.01" min="0" className={inputCls} placeholder="35" />
            </label>
          </div>
          <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400">
            {t('admin.shipments.addRate')}
          </button>
        </form>
      </div>

      <div className="space-y-4">
        {zones.map(zone => (
          <div key={zone.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">{zone.name}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{zone.provinces.join(', ')}</p>
              </div>
              <span className={zone.isActive ? 'rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400' : 'rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]'}>
                {zone.isActive ? t('admin.common.active') : t('admin.common.inactive')}
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
             <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
              <div className="grid min-w-[680px] grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] gap-4 border-b border-[var(--border)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <span>{t('admin.shipments.col.rate')}</span>
                <span>{t('admin.shipments.col.minimum')}</span>
                <span>{t('admin.shipments.col.price')}</span>
                <span>{t('admin.shipments.col.freeAbove')}</span>
                <span>{t('admin.shipments.col.actions')}</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {zone.rates.map(rate => (
                  <div key={rate.id} className="grid min-w-[680px] grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] gap-4 px-4 py-3 text-sm items-center">
                    <span className="font-medium text-[var(--foreground)]">{rate.name}</span>
                    <span className="text-[var(--foreground-soft)]">{rate.minOrderAmount == null ? '0,00 EUR' : formatPrice(Number(rate.minOrderAmount))}</span>
                    <span className="text-[var(--foreground-soft)]">{formatPrice(Number(rate.price))}</span>
                    <span className="text-[var(--foreground-soft)]">{rate.freeAbove == null ? t('admin.common.notApplicable') : formatPrice(Number(rate.freeAbove))}</span>
                    <ShippingRateActions rateId={rate.id} />
                  </div>
                ))}
                {zone.rates.length === 0 && (
                  <p className="px-4 py-6 text-sm text-[var(--muted)]">{t('admin.shipments.zoneEmpty')}</p>
                )}
              </div>
             </div>
            </div>
          </div>
        ))}
        {zones.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
            {t('admin.shipments.zonesEmpty')}
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('admin.shipments.labelsTitle')}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t('admin.shipments.labelsSubtitle')}
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
         <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
          <div className="grid min-w-[920px] grid-cols-[1.2fr_1fr_0.8fr_1fr_1fr_auto] gap-4 border-b border-[var(--border)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <span>{t('admin.shipments.col.orderVendor')}</span>
            <span>{t('admin.shipments.col.status')}</span>
            <span>{t('admin.shipments.col.carrier')}</span>
            <span>{t('admin.shipments.col.tracking')}</span>
            <span>{t('admin.shipments.col.created')}</span>
            <span className="text-right">{t('admin.shipments.col.actions')}</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {shipments.map(s => (
              <div
                key={s.id}
                className="grid min-w-[920px] grid-cols-[1.2fr_1fr_0.8fr_1fr_1fr_auto] items-start gap-4 px-5 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--foreground)]">{s.orderNumber}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{s.vendorName}</p>
                </div>
                <div>
                  <span className="text-[var(--foreground-soft)]">{s.status}</span>
                  {s.lastError && (
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-red-600 dark:text-red-400">
                      {s.lastError}
                    </p>
                  )}
                </div>
                <span className="text-[var(--foreground-soft)]">{s.carrierName ?? '—'}</span>
                <div className="min-w-0">
                  {s.trackingNumber ? (
                    s.trackingUrl ? (
                      <a
                        href={s.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-mono text-xs text-emerald-700 hover:underline"
                      >
                        {s.trackingNumber}
                      </a>
                    ) : (
                      <span className="block truncate font-mono text-xs">{s.trackingNumber}</span>
                    )
                  ) : (
                    <span className="text-xs text-[var(--muted)]">—</span>
                  )}
                </div>
                <span className="text-xs text-[var(--muted)]">{formatDate(s.createdAt)}</span>
                <AdminShipmentRowActions
                  shipmentId={s.id}
                  canRetry={FAILED_STATUSES.includes(s.status)}
                />
              </div>
            ))}
            {shipments.length === 0 && (
              <p className="px-5 py-6 text-sm text-[var(--muted)]">
                {t('admin.shipments.labelsEmpty')}
              </p>
            )}
          </div>
         </div>
        </div>
      </div>
    </div>
  )
}
