import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { createCommissionRule } from '@/domains/admin/actions'
import { CommissionRuleActions } from '@/components/admin/CommissionRuleActions'
import { formatDate } from '@/lib/utils'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Comisiones | Admin' }
export const revalidate = 30

function formatRate(type: string, rate: number) {
  return type === 'PERCENTAGE' ? `${(rate * 100).toFixed(2)}%` : `${rate.toFixed(2)} EUR`
}

export default async function AdminCommissionRulesPage() {
  const t = await getServerT()
  const formatCommissionRuleType = (type: string) => {
    switch (type) {
      case 'PERCENTAGE':
        return t('admin.commissions.type.PERCENTAGE')
      case 'FIXED':
        return t('admin.commissions.type.FIXED')
      case 'TIERED':
        return t('admin.commissions.type.TIERED')
      default:
        return type
    }
  }

  const [rules, vendors, categories] = await Promise.all([
    db.commissionRule.findMany({
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    }),
    db.vendor.findMany({
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true, commissionRate: true },
    }),
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const vendorsById = new Map(vendors.map(vendor => [vendor.id, vendor]))
  const categoriesById = new Map(categories.map(category => [category.id, category]))
  const activeConflictKeys = new Set<string>()
  const seenConflictKeys = new Set<string>()

  for (const rule of rules.filter(rule => rule.isActive)) {
    const key = `${rule.vendorId ?? 'none'}::${rule.categoryId ?? 'none'}`
    if (seenConflictKeys.has(key)) activeConflictKeys.add(key)
    seenConflictKeys.add(key)
  }

  const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500'

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t('admin.commissions.kicker')}</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.commissions.title')}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {t('admin.commissions.subtitle')}
        </p>
      </div>

      <form action={createCommissionRule} className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 md:grid-cols-2 xl:grid-cols-6">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.commissions.vendor')}</span>
          <select name="vendorId" defaultValue="" className={inputCls}>
            <option value="">{t('admin.common.none')}</option>
            {vendors.map(vendor => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.commissions.category')}</span>
          <select name="categoryId" defaultValue="" className={inputCls}>
            <option value="">{t('admin.common.noneFem')}</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.commissions.type')}</span>
          <select name="type" defaultValue="PERCENTAGE" className={inputCls}>
            <option value="PERCENTAGE">{t('admin.commissions.type.PERCENTAGE')}</option>
            <option value="FIXED">{t('admin.commissions.type.FIXED')}</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('admin.commissions.value')}</span>
          <input
            name="rate"
            type="number"
            min="0"
            step="0.01"
            placeholder={t('admin.commissions.valuePlaceholder')}
            className={inputCls}
          />
        </label>

        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-900 dark:text-amber-300 shadow-sm xl:col-span-2">
          {t('admin.commissions.formNotice')}
        </div>

        <div className="xl:col-span-6">
          <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400">
            {t('admin.commissions.create')}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
       <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
        <div className="grid min-w-[820px] grid-cols-[1fr_1fr_0.8fr_0.8fr_0.9fr_0.9fr_auto] gap-4 border-b border-[var(--border)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          <span>{t('admin.commissions.col.scope')}</span>
          <span>{t('admin.commissions.col.fallback')}</span>
          <span>{t('admin.commissions.col.type')}</span>
          <span>{t('admin.commissions.col.value')}</span>
          <span>{t('admin.commissions.col.status')}</span>
          <span>{t('admin.commissions.col.created')}</span>
          <span>{t('admin.commissions.col.actions')}</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {rules.map(rule => {
            const vendor = rule.vendorId ? vendorsById.get(rule.vendorId) : null
            const category = rule.categoryId ? categoriesById.get(rule.categoryId) : null
            const conflictKey = `${rule.vendorId ?? 'none'}::${rule.categoryId ?? 'none'}`
            const hasConflict = rule.isActive && activeConflictKeys.has(conflictKey)
            const scopeLabel = vendor
              ? t('admin.commissions.scopeVendor')
              : category
                ? t('admin.commissions.scopeCategory')
                : t('admin.commissions.scopeNone')

            return (
              <div key={rule.id} className="grid min-w-[820px] grid-cols-[1fr_1fr_0.8fr_0.8fr_0.9fr_0.9fr_auto] gap-4 px-5 py-4 text-sm items-start">
                <div>
                  <p className="font-medium text-[var(--foreground)]">{vendor?.displayName ?? category?.name ?? t('admin.commissions.scopeGlobal')}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {scopeLabel}
                    {vendor && category ? t('admin.commissions.scopeAndCategory') : ''}
                  </p>
                  {hasConflict && (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">{t('admin.commissions.conflict')}</p>
                  )}
                </div>
                <div className="text-[var(--foreground-soft)]">
                  {vendor
                    ? t('admin.commissions.fallbackBaseVendor').replace('{rate}', (Number(vendor.commissionRate) * 100).toFixed(2))
                    : t('admin.commissions.fallbackUsesVendor')}
                </div>
                <div className="font-medium text-[var(--foreground)]">{formatCommissionRuleType(rule.type)}</div>
                <div className="font-medium text-[var(--foreground)]">{formatRate(rule.type, Number(rule.rate))}</div>
                <div>
                  <span className={rule.isActive ? 'rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400' : 'rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]'}>
                    {rule.isActive ? t('admin.common.active') : t('admin.common.inactive')}
                  </span>
                </div>
                <div className="text-[var(--muted)]">{formatDate(rule.createdAt)}</div>
                <div>
                  <CommissionRuleActions ruleId={rule.id} isActive={rule.isActive} />
                </div>
              </div>
            )
          })}
          {rules.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted)]">{t('admin.commissions.empty')}</p>
          )}
        </div>
       </div>
      </div>
    </div>
  )
}
