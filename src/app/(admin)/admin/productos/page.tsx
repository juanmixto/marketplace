import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { db } from '@/lib/db'
import { cn, formatDate, formatPrice } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { ProductModerationActions } from '@/components/admin/ProductModerationActions'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ProductStatusFilterSelect } from '@/components/admin/ProductStatusFilterSelect'
import { getProductStatusTone } from '@/domains/admin/overview'
import type { Prisma } from '@/generated/prisma/client'
import type { ProductStatus } from '@/generated/prisma/enums'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Productos | Admin' }
export const revalidate = 30

const PRODUCT_STATUS_OPTIONS = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const satisfies readonly ProductStatus[]
const STOCK_OPTIONS = ['all', 'out', 'low', 'in', 'untracked'] as const
type StockFilter = (typeof STOCK_OPTIONS)[number]

const PAGE_SIZE = 24

interface Props {
  searchParams: Promise<{
    q?: string
    status?: string
    category?: string
    stock?: string
    page?: string
  }>
}

function parseStatus(value: string | undefined): ProductStatus | 'all' {
  if (value && (PRODUCT_STATUS_OPTIONS as readonly string[]).includes(value)) {
    return value as ProductStatus
  }
  return 'all'
}

function parseStock(value: string | undefined): StockFilter {
  if (value && (STOCK_OPTIONS as readonly string[]).includes(value)) {
    return value as StockFilter
  }
  return 'all'
}

interface BaseParams {
  q: string
  status: ProductStatus | 'all'
  category: string
  stock: StockFilter
}

function buildHref(base: BaseParams, overrides: Partial<BaseParams> & { page?: number } = {}) {
  const next = { ...base, ...overrides }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.status && next.status !== 'all') params.set('status', next.status)
  if (next.category) params.set('category', next.category)
  if (next.stock && next.stock !== 'all') params.set('stock', next.stock)
  if (overrides.page && overrides.page > 1) params.set('page', String(overrides.page))
  const query = params.toString()
  return query ? `/admin/productos?${query}` : '/admin/productos'
}

export default async function AdminProductsPage({ searchParams }: Props) {
  const t = await getServerT()
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const status = parseStatus(params.status)
  const category = params.category?.trim() ?? ''
  const stock = parseStock(params.stock)
  const page = Number.isFinite(Number(params.page)) ? Math.max(Number(params.page), 1) : 1

  const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
    DRAFT: t('admin.products.status.DRAFT'),
    PENDING_REVIEW: t('admin.products.status.PENDING_REVIEW'),
    ACTIVE: t('admin.products.status.ACTIVE'),
    REJECTED: t('admin.products.status.REJECTED'),
    SUSPENDED: t('admin.products.status.SUSPENDED'),
  }
  const STOCK_LABELS: Record<StockFilter, string> = {
    all: t('admin.products.stockFilter.all'),
    out: t('admin.products.stockFilter.out'),
    low: t('admin.products.stockFilter.low'),
    in: t('admin.products.stockFilter.in'),
    untracked: t('admin.products.stockFilter.untracked'),
  }

  const where: Prisma.ProductWhereInput = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
      { vendor: { is: { displayName: { contains: q, mode: 'insensitive' } } } },
    ]
  }
  if (status !== 'all') where.status = status
  if (category) where.categoryId = category
  if (stock === 'out') {
    where.trackStock = true
    where.stock = { equals: 0 }
  } else if (stock === 'low') {
    where.trackStock = true
    where.stock = { gt: 0, lte: 5 }
  } else if (stock === 'in') {
    where.trackStock = true
    where.stock = { gt: 0 }
  } else if (stock === 'untracked') {
    where.trackStock = false
  }

  const [products, totalProducts, productStats, categories] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        vendor: { select: { displayName: true } },
        category: { select: { name: true } },
      },
    }),
    db.product.count({ where }),
    db.product.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    db.category.findMany({
      where: { products: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE))
  const base: BaseParams = { q, status, category, stock }
  const statsByStatus = new Map(productStats.map(s => [s.status, s._count._all]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t('admin.products.kicker')}</p>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.products.title')}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{t('admin.products.subtitle')}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-right text-sm text-[var(--muted)] shadow-sm">
          <p>{t(totalProducts === 1 ? 'admin.products.totalSingular' : 'admin.products.totalPlural').replace('{count}', String(totalProducts))}</p>
          <p>{t('admin.products.pageOfTotal').replace('{page}', String(page)).replace('{total}', String(totalPages))}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {PRODUCT_STATUS_OPTIONS.map(option => {
          const isActive = status === option
          const count = statsByStatus.get(option) ?? 0
          return (
            <Link
              key={option}
              href={buildHref(base, { status: isActive ? 'all' : option })}
              aria-pressed={isActive}
              className={cn(
                'rounded-xl border bg-[var(--surface)] p-4 shadow-sm transition-colors',
                isActive
                  ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)]',
              )}
            >
              <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{PRODUCT_STATUS_LABELS[option]}</p>
              <p className="mt-2 text-3xl font-bold text-[var(--foreground)]">{count}</p>
            </Link>
          )
        })}
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('admin.products.searchTitle')}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t('admin.products.searchSubtitle')}</p>
        </CardHeader>
        <CardBody>
          <form className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto_auto] lg:items-end">
            <Input
              name="q"
              label={t('admin.common.search')}
              defaultValue={q}
              placeholder={t('admin.products.searchPlaceholder')}
            />
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-[var(--foreground-soft)]">{t('admin.common.status')}</span>
              <ProductStatusFilterSelect
                name="status"
                defaultValue={status}
                options={PRODUCT_STATUS_OPTIONS.map(option => ({ value: option, label: PRODUCT_STATUS_LABELS[option] }))}
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-[var(--foreground-soft)]">{t('admin.products.category')}</span>
              <select
                name="category"
                defaultValue={category}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">{t('admin.common.allFem')}</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-[var(--foreground-soft)]">{t('admin.products.stock')}</span>
              <select
                name="stock"
                defaultValue={stock}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {STOCK_OPTIONS.map(option => (
                  <option key={option} value={option}>{STOCK_LABELS[option]}</option>
                ))}
              </select>
            </label>
            <Button type="submit" className="gap-2">
              <MagnifyingGlassIcon className="h-4 w-4" />
              {t('admin.common.apply')}
            </Button>
            <Link
              href="/admin/productos"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground-soft)] shadow-sm transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
            >
              <ArrowPathIcon className="h-4 w-4" />
              {t('admin.common.clear')}
            </Link>
          </form>
        </CardBody>
      </Card>

      <div className="overflow-x-auto overscroll-x-contain touch-pan-x rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <table className="w-full min-w-[840px] table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              <th className="px-5 py-3 text-left">{t('admin.products.col.product')}</th>
              <th className="px-5 py-3 text-left">{t('admin.products.col.vendor')}</th>
              <th className="px-5 py-3 text-left">{t('admin.products.col.category')}</th>
              <th className="px-5 py-3 text-right">{t('admin.products.col.price')}</th>
              <th className="px-5 py-3 text-right">{t('admin.products.col.stock')}</th>
              <th className="px-5 py-3 text-left">{t('admin.products.col.status')}</th>
              <th className="px-5 py-3 text-right">{t('admin.products.col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {products.map(product => (
              <tr key={product.id} className="transition-colors hover:bg-[var(--surface-raised)]/80">
                <td className="px-5 py-4 align-middle">
                  <p className="font-semibold text-[var(--foreground)]">{product.name}</p>
                  <p className="text-xs text-[var(--muted)]">{t('admin.products.updatedAt').replace('{date}', formatDate(product.updatedAt))}</p>
                </td>
                <td className="px-5 py-4 align-middle font-medium text-[var(--foreground)]">{product.vendor.displayName}</td>
                <td className="px-5 py-4 align-middle text-[var(--foreground-soft)]">{product.category?.name ?? t('admin.products.noCategory')}</td>
                <td className="px-5 py-4 align-middle text-right font-medium text-[var(--foreground)]">{formatPrice(Number(product.basePrice))}</td>
                <td
                  className={cn(
                    'px-5 py-4 align-middle text-right',
                    !product.trackStock
                      ? 'text-[var(--muted)]'
                      : product.stock === 0
                        ? 'font-semibold text-red-600 dark:text-red-400'
                        : 'text-[var(--foreground)]',
                  )}
                >
                  {product.trackStock ? product.stock : t('admin.products.untrackedStock')}
                </td>
                <td className="px-5 py-4 align-middle">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusBadge label={PRODUCT_STATUS_LABELS[product.status]} tone={getProductStatusTone(product.status)} />
                    {product.sourceIngestionDraftId && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                        title={t('admin.products.fromTelegramTooltip').replace('{id}', product.sourceIngestionDraftId)}
                      >
                        {t('admin.products.fromTelegram')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 align-middle">
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                    <ProductModerationActions
                      productId={product.id}
                      productName={product.name}
                      status={product.status}
                    />
                    <Link
                      href={`/admin/productos/${product.id}/edit`}
                      className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      {t('admin.common.edit')}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-[var(--muted)]">
                  {t('admin.products.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--muted)]">
          <span>{t('admin.products.pageOfTotal').replace('{page}', String(page)).replace('{total}', String(totalPages))}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref(base, { page: page - 1 })}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-medium text-[var(--foreground-soft)] hover:border-[var(--border-strong)]"
              >
                {t('admin.common.previous')}
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref(base, { page: page + 1 })}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-medium text-[var(--foreground-soft)] hover:border-[var(--border-strong)]"
              >
                {t('admin.common.next')}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
