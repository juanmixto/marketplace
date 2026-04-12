'use client'

import Image from 'next/image'
import Link from 'next/link'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  PlusIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  CubeIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { ProductActions } from '@/components/vendor/ProductActions'
import { ProductQuickFix, type ProductProblem } from '@/components/vendor/ProductQuickFix'
import { useT } from '@/i18n'
import type { BadgeVariant } from '@/domains/catalog/types'
import {
  formatExpirationLabel,
  getExpirationTone,
  isProductExpired,
} from '@/domains/catalog/availability'
import type { getMyProducts } from '@/domains/vendors/actions'

type ProductWithCategory = Awaited<ReturnType<typeof getMyProducts>>[number]

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT:          { label: 'Borrador',      variant: 'default' },
  PENDING_REVIEW: { label: 'En revisión',   variant: 'amber' },
  ACTIVE:         { label: 'Activo',        variant: 'green' },
  REJECTED:       { label: 'Rechazado',     variant: 'red' },
  SUSPENDED:      { label: 'Suspendido',    variant: 'default' },
}

interface Props {
  products: ProductWithCategory[]
}

// Lower number = more urgent. Used for sorting + badge color.
const PROBLEM_PRIORITY: Record<NonNullable<ProductProblem>, number> = {
  rejected: 0,
  expired: 1,
  'out-of-stock': 2,
  'low-stock': 3,
  draft: 4,
}

function getProblem(product: ProductWithCategory, now: Date): ProductProblem {
  if (product.status === 'REJECTED') return 'rejected'
  if (isProductExpired(product.expiresAt, now)) return 'expired'
  if (product.status === 'ACTIVE' && product.trackStock) {
    if (product.stock === 0) return 'out-of-stock'
    if (product.stock <= 5) return 'low-stock'
  }
  if (product.status === 'DRAFT') return 'draft'
  return null
}

export function VendorProductListClient({ products }: Props) {
  const t = useT()
  const now = new Date()

  const annotated = products.map(p => ({ product: p, problem: getProblem(p, now) }))

  // Sort: problems first by severity, healthy last
  annotated.sort((a, b) => {
    const ap = a.problem ? PROBLEM_PRIORITY[a.problem] : 99
    const bp = b.problem ? PROBLEM_PRIORITY[b.problem] : 99
    return ap - bp
  })

  const counts = {
    rejected: annotated.filter(a => a.problem === 'rejected').length,
    expired: annotated.filter(a => a.problem === 'expired').length,
    outOfStock: annotated.filter(a => a.problem === 'out-of-stock').length,
    lowStock: annotated.filter(a => a.problem === 'low-stock').length,
  }
  const totalIssues = counts.rejected + counts.expired + counts.outOfStock + counts.lowStock

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.myCatalog')}</h1>
          <p className="text-sm text-[var(--muted)]">
            {products.length} {productsUnit(products.length)}
          </p>
        </div>
        <Link
          href="/vendor/productos/nuevo"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <PlusIcon className="h-4 w-4" /> {t('vendor.newProduct')}
        </Link>
      </div>

      {/* Issues summary banner */}
      {totalIssues > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {totalIssues === 1
                ? t('vendor.fix.oneNeedsAttention')
                : t('vendor.fix.manyNeedAttention').replace('{n}', String(totalIssues))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.rejected > 0 && (
              <SummaryChip tone="red" icon={<XCircleIcon className="h-3.5 w-3.5" />}>
                {counts.rejected} {t('vendor.fix.chipRejected')}
              </SummaryChip>
            )}
            {counts.expired > 0 && (
              <SummaryChip tone="amber" icon={<CalendarDaysIcon className="h-3.5 w-3.5" />}>
                {counts.expired} {t('vendor.fix.chipExpired')}
              </SummaryChip>
            )}
            {counts.outOfStock > 0 && (
              <SummaryChip tone="red" icon={<CubeIcon className="h-3.5 w-3.5" />}>
                {counts.outOfStock} {t('vendor.fix.chipOutOfStock')}
              </SummaryChip>
            )}
            {counts.lowStock > 0 && (
              <SummaryChip tone="amber" icon={<CubeIcon className="h-3.5 w-3.5" />}>
                {counts.lowStock} {t('vendor.fix.chipLowStock')}
              </SummaryChip>
            )}
          </div>
          <p className="basis-full text-xs text-amber-800/80 dark:text-amber-300/80">
            {t('vendor.fix.hint')}
          </p>
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-16 text-center">
          <p className="text-[var(--muted)] mb-3">{t('vendor.noProducts')}</p>
          <Link
            href="/vendor/productos/nuevo"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            <PlusIcon className="h-4 w-4" /> {t('vendor.addFirstProduct')}
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="divide-y divide-[var(--border)]">
            {annotated.map(({ product, problem }) => {
              const statusConfig = STATUS_CONFIG[product.status] ?? {
                label: product.status,
                variant: 'default' as BadgeVariant,
              }
              const expirationTone = getExpirationTone(product.expiresAt, now)
              const expirationLabel = formatExpirationLabel(product.expiresAt, now)
              const hasProblem = problem !== null
              return (
                <div
                  key={product.id}
                  className={`flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--surface-raised)] sm:flex-row sm:items-center sm:gap-4 ${
                    hasProblem ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-4 sm:flex-1 sm:items-center">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                      {product.images?.[0] ? (
                        <Image
                          src={product.images[0]}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-2xl">🌿</div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-[var(--foreground)] truncate">{product.name}</p>
                        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                        {expirationTone === 'expired' && <Badge variant="red">{t('vendor.expired')}</Badge>}
                        {expirationTone === 'today' && <Badge variant="amber">{t('vendor.expiresToday')}</Badge>}
                        {expirationTone === 'soon' && <Badge variant="amber">{t('vendor.expiresSoon')}</Badge>}
                      </div>
                      <p className="text-sm text-[var(--muted)] mt-0.5">
                        {formatPrice(Number(product.basePrice))} / {product.unit}
                        {product.category && ` · ${product.category.name}`}
                      </p>
                      {expirationLabel && (
                        <p
                          className={`mt-1 text-xs ${
                            expirationTone === 'expired'
                              ? 'text-red-600 dark:text-red-400'
                              : expirationTone === 'today' || expirationTone === 'soon'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-[var(--muted)]'
                          }`}
                        >
                          {expirationLabel}
                        </p>
                      )}
                      {product.status === 'REJECTED' && product.rejectionNote && (
                        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 dark:border-red-900/50 dark:bg-red-950/30">
                          <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-700 dark:text-red-300">
                            <span className="font-semibold">{t('vendor.fix.rejectionReason')}:</span>{' '}
                            {product.rejectionNote}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    {product.trackStock && (
                      <p
                        className={`text-sm font-medium sm:text-right ${
                          product.stock === 0
                            ? 'text-red-600 dark:text-red-400'
                            : product.stock <= 5
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-[var(--muted)]'
                        }`}
                      >
                        {product.stock === 0
                          ? t('vendor.noStock')
                          : `${product.stock} ${t('vendor.inStock')}`}
                      </p>
                    )}

                    <ProductQuickFix product={product} problem={problem} />

                    <ProductActions product={product} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryChip({
  children,
  icon,
  tone,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  tone: 'red' | 'amber'
}) {
  const cls =
    tone === 'red'
      ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60'
      : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {icon}
      {children}
    </span>
  )
}

function productsUnit(count: number) {
  return count === 1 ? 'producto' : 'productos'
}
