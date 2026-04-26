import type { Metadata } from 'next'
import { getMarketplaceConfig } from '@/lib/config'
import { updateMarketplaceConfigAction } from '@/domains/admin/actions'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Configuracion Marketplace' }

function percentToDisplay(value: number) {
  return Number((value * 100).toFixed(2))
}

export default async function AdminMarketplaceConfigPage() {
  const config = await getMarketplaceConfig()
  const t = await getServerT()

  const inputCls = 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20'

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{t('admin.settings.kicker')}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--foreground)]">{t('admin.settings.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-soft)]">
          {t('admin.settings.subtitle')}
        </p>
      </div>

      <form action={updateMarketplaceConfigAction} className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.settings.defaultCommissionLabel')}</span>
            <input
              name="DEFAULT_COMMISSION_RATE"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={percentToDisplay(config.DEFAULT_COMMISSION_RATE)}
              className={inputCls}
            />
            <span className="text-xs text-[var(--muted)]">{t('admin.settings.defaultCommissionHelp')}</span>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.settings.freeShippingThresholdLabel')}</span>
            <input
              name="FREE_SHIPPING_THRESHOLD"
              type="number"
              min="0"
              step="0.01"
              defaultValue={config.FREE_SHIPPING_THRESHOLD}
              className={inputCls}
            />
            <span className="text-xs text-[var(--muted)]">{t('admin.settings.freeShippingThresholdHelp')}</span>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.settings.flatShippingCostLabel')}</span>
            <input
              name="FLAT_SHIPPING_COST"
              type="number"
              min="0"
              step="0.01"
              defaultValue={config.FLAT_SHIPPING_COST}
              className={inputCls}
            />
            <span className="text-xs text-[var(--muted)]">{t('admin.settings.flatShippingCostHelp')}</span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-sm">
            <input
              name="MAINTENANCE_MODE"
              type="checkbox"
              defaultChecked={config.MAINTENANCE_MODE}
              className="mt-0.5 rounded border-[var(--border-strong)] text-emerald-600"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--foreground)]">{t('admin.settings.maintenanceLabel')}</span>
              <span className="mt-1 block text-xs text-[var(--muted)]">
                {t('admin.settings.maintenanceHelp')}
              </span>
            </span>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.settings.heroBannerLabel')}</span>
          <textarea
            name="HERO_BANNER_TEXT"
            rows={3}
            spellCheck
            autoCapitalize="sentences"
            maxLength={160}
            defaultValue={config.HERO_BANNER_TEXT}
            placeholder={t('admin.settings.heroBannerPlaceholder')}
            className={inputCls}
          />
          <span className="text-xs text-[var(--muted)]">{t('admin.settings.heroBannerHelp')}</span>
        </label>

        <div className="flex items-center justify-between rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-300 shadow-sm">
          <p>{t('admin.settings.applyNotice')}</p>
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
          >
            {t('admin.settings.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
