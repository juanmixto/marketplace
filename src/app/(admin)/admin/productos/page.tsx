import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminProductsFilters } from '@/components/admin/AdminProductsFilters'
import { db } from '@/lib/db'
import { cn, formatMadridDate, formatPrice } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { ProductModerationActions } from '@/components/admin/ProductModerationActions'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { getProductStatusTone } from '@/domains/admin/overview'
import type { Prisma } from '@/generated/prisma/client'
import type { ProductStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = { title: 'Productos | Admin' }
export const revalidate = 30

const PRODUCT_STATUS_OPTIONS = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const satisfies readonly ProductStatus[]

const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'Por revisar',
  ACTIVE: 'Activo',
  REJECTED: 'Rechazado',
  SUSPENDED: 'Suspendido',
}

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
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const status = parseStatus(params.status)
  const category = params.category?.trim() ?? ''
  const stock = parseStock(params.stock)
  const page = Number.isFinite(Number(params.page)) ? Math.max(Number(params.page), 1) : 1

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
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Moderación</p>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Productos</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Revisión del catálogo y señales de stock.</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-right text-sm text-[var(--muted)] shadow-sm">
          <p>{totalProducts} producto{totalProducts === 1 ? '' : 's'} en el resultado actual</p>
          <p>Página {page} de {totalPages}</p>
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
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Búsqueda y filtros</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Encuentra productos por nombre, productor, categoría o stock.</p>
        </CardHeader>
        <CardBody>
          <AdminProductsFilters q={q} status={status} category={category} stock={stock} categories={categories} />
        </CardBody>
      </Card>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              <th className="px-5 py-3 text-left">Producto</th>
              <th className="px-5 py-3 text-left">Productor</th>
              <th className="px-5 py-3 text-left">Categoría</th>
              <th className="px-5 py-3 text-right">Precio</th>
              <th className="px-5 py-3 text-right">Stock</th>
              <th className="px-5 py-3 text-left">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {products.map(product => (
              <tr key={product.id} className="transition-colors hover:bg-[var(--surface-raised)]/80">
                <td className="px-5 py-4 align-middle">
                  <p className="font-semibold text-[var(--foreground)]">{product.name}</p>
                  <p className="text-xs text-[var(--muted)]">Actualizado {formatMadridDate(product.updatedAt)}</p>
                </td>
                <td className="px-5 py-4 align-middle font-medium text-[var(--foreground)]">{product.vendor.displayName}</td>
                <td className="px-5 py-4 align-middle text-[var(--foreground-soft)]">{product.category?.name ?? 'Sin categoría'}</td>
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
                  {product.trackStock ? product.stock : 'Sin control'}
                </td>
                <td className="px-5 py-4 align-middle">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusBadge label={PRODUCT_STATUS_LABELS[product.status]} tone={getProductStatusTone(product.status)} />
                    {product.sourceIngestionDraftId && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                        title={`Creado desde draft de ingestión ${product.sourceIngestionDraftId}`}
                      >
                        Importado de Telegram
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
                      Editar
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-[var(--muted)]">
                  No hay productos para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--muted)]">
          <span>Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref(base, { page: page - 1 })}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-medium text-[var(--foreground-soft)] hover:border-[var(--border-strong)]"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref(base, { page: page + 1 })}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-medium text-[var(--foreground-soft)] hover:border-[var(--border-strong)]"
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
