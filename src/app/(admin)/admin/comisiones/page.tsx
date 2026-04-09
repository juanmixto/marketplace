import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { createCommissionRule } from '@/domains/admin/actions'
import { CommissionRuleActions } from '@/components/admin/CommissionRuleActions'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Comisiones | Admin' }
export const revalidate = 30

function formatCommissionRuleType(type: string) {
  switch (type) {
    case 'PERCENTAGE':
      return 'Porcentaje'
    case 'FIXED':
      return 'Fijo'
    case 'TIERED':
      return 'Escalonado'
    default:
      return type
  }
}

function formatRate(type: string, rate: number) {
  return type === 'PERCENTAGE' ? `${(rate * 100).toFixed(2)}%` : `${rate.toFixed(2)} EUR`
}

export default async function AdminCommissionRulesPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Finanzas</p>
        <h1 className="text-2xl font-bold text-gray-900">Comisiones</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gestiona reglas por productor o categoría. La prioridad es productor, luego categoría y por último la tasa base del productor.
        </p>
      </div>

      <form action={createCommissionRule} className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 md:grid-cols-2 xl:grid-cols-6">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-gray-900">Productor</span>
          <select name="vendorId" defaultValue="" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">
            <option value="">Ninguno</option>
            {vendors.map(vendor => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-gray-900">Categoría</span>
          <select name="categoryId" defaultValue="" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">
            <option value="">Ninguna</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-gray-900">Tipo</span>
          <select name="type" defaultValue="PERCENTAGE" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">
            <option value="PERCENTAGE">Porcentaje</option>
            <option value="FIXED">Fijo</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-gray-900">Valor</span>
          <input
            name="rate"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.12 o 4.95"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </label>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 xl:col-span-2">
          Crea la regla con productor o categoría. Si usas ambas, la regla quedará registrada, pero la prioridad operativa seguirá favoreciendo la coincidencia por productor.
        </div>

        <div className="xl:col-span-6">
          <button type="submit" className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
            Crear regla
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[1fr,1fr,0.8fr,0.8fr,0.9fr,0.9fr,auto] gap-4 border-b border-gray-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Ámbito</span>
          <span>Fallback</span>
          <span>Tipo</span>
          <span>Valor</span>
          <span>Estado</span>
          <span>Alta</span>
          <span>Acciones</span>
        </div>
        <div className="divide-y divide-gray-100">
          {rules.map(rule => {
            const vendor = rule.vendorId ? vendorsById.get(rule.vendorId) : null
            const category = rule.categoryId ? categoriesById.get(rule.categoryId) : null
            const conflictKey = `${rule.vendorId ?? 'none'}::${rule.categoryId ?? 'none'}`
            const hasConflict = rule.isActive && activeConflictKeys.has(conflictKey)

            return (
              <div key={rule.id} className="grid grid-cols-[1fr,1fr,0.8fr,0.8fr,0.9fr,0.9fr,auto] gap-4 px-5 py-4 text-sm items-start">
                <div>
                  <p className="font-medium text-gray-900">{vendor?.displayName ?? category?.name ?? 'Global manual'}</p>
                  <p className="text-xs text-gray-500">
                    {vendor ? 'Productor' : category ? 'Categoría' : 'Sin ámbito'}
                    {vendor && category ? ' + categoría' : ''}
                  </p>
                  {hasConflict && (
                    <p className="mt-1 text-xs font-medium text-amber-700">Conflicto: hay otra regla activa con el mismo ámbito.</p>
                  )}
                </div>
                <div className="text-gray-600">
                  {vendor
                    ? `Base vendor ${(Number(vendor.commissionRate) * 100).toFixed(2)}%`
                    : 'Usa fallback del productor'}
                </div>
                <div className="font-medium text-gray-900">{formatCommissionRuleType(rule.type)}</div>
                <div className="font-medium text-gray-900">{formatRate(rule.type, Number(rule.rate))}</div>
                <div>
                  <span className={rule.isActive ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700' : 'rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500'}>
                    {rule.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <div className="text-gray-500">{formatDate(rule.createdAt)}</div>
                <div>
                  <CommissionRuleActions ruleId={rule.id} isActive={rule.isActive} />
                </div>
              </div>
            )
          })}
          {rules.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-gray-500">Todavía no hay reglas de comisión creadas.</p>
          )}
        </div>
      </div>
    </div>
  )
}
