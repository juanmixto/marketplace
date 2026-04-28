import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import {
  getMyFulfillmentKpis,
  getMyFulfillmentsPaginated,
  type VendorFulfillmentSort,
} from '@/domains/vendors/actions'
import type { FulfillmentStatus } from '@/generated/prisma/enums'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDate } from '@/lib/utils'
import { FulfillmentActions } from '@/components/vendor/FulfillmentActions'
import { SellerOrdersTracker } from '@/components/vendor/SellerOrdersTracker'
import { OrdersFilterBar } from '@/components/vendor/OrdersFilterBar'
import type { BadgeVariant } from '@/domains/catalog/types'
import { parseOrderAddressSnapshot } from '@/types/order'
import { getServerT } from '@/i18n/server'
import type { TranslationKeys } from '@/i18n/locales'
import { ShoppingBagIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'

export const metadata: Metadata = { title: 'Mis pedidos' }

const STATUS_CONFIG: Record<string, { labelKey: TranslationKeys; variant: BadgeVariant }> = {
  PENDING:         { labelKey: 'vendor.orders.statusPending',   variant: 'amber' },
  CONFIRMED:       { labelKey: 'vendor.orders.statusConfirmed', variant: 'default' },
  PREPARING:       { labelKey: 'vendor.orders.statusPreparing', variant: 'default' },
  LABEL_REQUESTED: { labelKey: 'vendor.orders.statusPreparing', variant: 'default' },
  LABEL_FAILED:    { labelKey: 'vendor.orders.statusPending',   variant: 'red' },
  READY:           { labelKey: 'vendor.orders.statusReady',     variant: 'green' },
  SHIPPED:         { labelKey: 'vendor.orders.statusShipped',   variant: 'green' },
  DELIVERED:       { labelKey: 'vendor.orders.statusDelivered', variant: 'green' },
  INCIDENT:        { labelKey: 'vendor.orders.statusIncident',  variant: 'red' },
  CANCELLED:       { labelKey: 'vendor.orders.statusCancelled', variant: 'red' },
}

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'LABEL_REQUESTED', 'LABEL_FAILED', 'READY', 'INCIDENT'] as const

type FulfillmentRow = Awaited<ReturnType<typeof getMyFulfillmentsPaginated>>['items'][number]
type Translate = Awaited<ReturnType<typeof getServerT>>

const OVERDUE_HOURS = 24

interface PageProps {
  searchParams: Promise<{
    estado?: string
    desde?: string
    hasta?: string
    q?: string
    orden?: string
    cursor?: string
  }>
}

function parseStatuses(estado: string): FulfillmentStatus[] | undefined {
  if (estado === 'all' || !estado) return undefined
  return estado
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean) as FulfillmentStatus[]
}

export default async function VendorPedidosPage({ searchParams }: PageProps) {
  const params = await searchParams
  const t = await getServerT()

  const estado = (params.estado ?? '').trim()
  const q = (params.q ?? '').trim()
  const desde = params.desde ? new Date(params.desde + 'T00:00:00') : undefined
  const hasta = params.hasta ? new Date(params.hasta + 'T23:59:59') : undefined
  const orden = (params.orden ?? 'recent') as VendorFulfillmentSort
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined

  // Default view: active statuses only — same UX as before pagination.
  // `?estado=all` opts into the full history. Explicit comma-separated
  // status lists (KPI clicks, overdue link) round-trip unchanged.
  const explicitStatuses = parseStatuses(estado)
  const statuses =
    estado === 'all'
      ? undefined
      : explicitStatuses ?? ([...ACTIVE_STATUSES] as FulfillmentStatus[])

  const [kpis, page] = await Promise.all([
    getMyFulfillmentKpis(),
    getMyFulfillmentsPaginated({
      cursor,
      statuses,
      q: q || undefined,
      dateFrom: desde,
      dateTo: hasta,
      sort: orden,
    }),
  ])

  const totalLifetime =
    kpis.pending + kpis.inPrep + kpis.ready + kpis.shippedRecent + kpis.incident
  const totalLabel =
    totalLifetime === 1
      ? t('vendor.orders.totalOne')
      : t('vendor.orders.totalOther').replace('{count}', String(totalLifetime))

  const trackedOrders = page.items
    .filter((f) => ACTIVE_STATUSES.includes(f.status as (typeof ACTIVE_STATUSES)[number]))
    .map((f) => ({
      fulfillmentId: f.id,
      orderId: f.orderId,
      orderValue: f.order.lines.reduce(
        (sum, line) => sum + Number(line.unitPrice) * line.quantity,
        0,
      ),
      itemCount: f.order.lines.reduce((sum, line) => sum + line.quantity, 0),
    }))

  const isFirstPage = !cursor
  const isEmpty = isFirstPage && page.items.length === 0 && totalLifetime === 0

  return (
    <div className="space-y-6">
      <SellerOrdersTracker orders={trackedOrders} />

      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.orders.title')}</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">{totalLabel}</p>
      </div>

      {isEmpty ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <ShoppingBagIcon className="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('vendor.orders.emptyTitle')}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{t('vendor.orders.emptyBody')}</p>
          <Link
            href="/vendor/productos"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
          >
            <ArchiveBoxIcon className="h-4 w-4" /> {t('vendor.orders.emptyCta')}
          </Link>
        </div>
      ) : (
        <>
          <KpiBar t={t} currentEstado={estado} kpis={kpis} />

          {kpis.overdue > 0 && <OverdueAlert count={kpis.overdue} t={t} />}

          <OrdersFilterBar
            currentQ={q}
            currentFrom={params.desde ?? ''}
            currentTo={params.hasta ?? ''}
            currentSort={orden}
          />

          {page.items.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-12 text-center">
              <p className="text-[var(--muted)]">{t('vendor.orders.noMatches')}</p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-[var(--muted)]">
                {t('vendor.orders.showingCount').replace('{count}', String(page.items.length))}
              </p>
              <FulfillmentList fulfillments={page.items} t={t} now={Date.now()} />
              <Pagination
                t={t}
                searchParams={params}
                isFirstPage={isFirstPage}
                hasNextPage={page.hasNextPage}
                nextCursor={page.nextCursor}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

function buildHref(
  params: Record<string, string | undefined>,
  override: { cursor?: string | null },
) {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (key === 'cursor') continue
    if (typeof value === 'string' && value.length > 0) query[key] = value
  }
  if (override.cursor) query.cursor = override.cursor
  const qs = new URLSearchParams(query).toString()
  return qs ? `/vendor/pedidos?${qs}` : '/vendor/pedidos'
}

function Pagination({
  t,
  searchParams,
  isFirstPage,
  hasNextPage,
  nextCursor,
}: {
  t: Translate
  searchParams: Record<string, string | undefined>
  isFirstPage: boolean
  hasNextPage: boolean
  nextCursor: string | null
}) {
  if (isFirstPage && !hasNextPage) return null
  return (
    <nav
      aria-label={t('vendor.orders.paginationLabel')}
      className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4"
    >
      {isFirstPage ? (
        <span aria-hidden="true" />
      ) : (
        <Link
          href={buildHref(searchParams, { cursor: null })}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
        >
          {t('vendor.orders.paginationFirst')}
        </Link>
      )}
      {hasNextPage && nextCursor ? (
        <Link
          href={buildHref(searchParams, { cursor: nextCursor })}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
        >
          {t('vendor.orders.paginationOlder')}
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  )
}

function KpiBar({
  t,
  kpis,
  currentEstado,
}: {
  t: Translate
  kpis: Awaited<ReturnType<typeof getMyFulfillmentKpis>>
  currentEstado: string
}) {
  const cards: Array<{ key: string; label: string; value: string | number; tone: string; estado: string | null }> = [
    { key: 'new',        label: t('vendor.orders.kpi.new'),        value: kpis.pending,       tone: 'amber',   estado: 'PENDING' },
    { key: 'prep',       label: t('vendor.orders.kpi.prep'),       value: kpis.inPrep,        tone: 'slate',   estado: 'CONFIRMED,PREPARING,LABEL_REQUESTED,LABEL_FAILED' },
    { key: 'ready',      label: t('vendor.orders.kpi.ready'),      value: kpis.ready,         tone: 'emerald', estado: 'READY' },
    { key: 'shippedWeek',label: t('vendor.orders.kpi.shippedWeek'),value: kpis.shippedRecent, tone: 'emerald', estado: 'SHIPPED,DELIVERED' },
    { key: 'incident',   label: t('vendor.orders.kpi.incident'),   value: kpis.incident,      tone: 'red',     estado: 'INCIDENT' },
    { key: 'revenue30d', label: t('vendor.orders.kpi.revenue30d'), value: formatPrice(kpis.revenue30d), tone: 'slate', estado: null },
  ]

  const toneClasses: Record<string, string> = {
    amber:   'border-amber-300/60 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30',
    emerald: 'border-emerald-300/60 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30',
    red:     'border-red-300/60 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30',
    slate:   'border-[var(--border)] bg-[var(--surface)]',
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(c => {
        const isActive = c.estado !== null && c.estado === currentEstado
        const base = toneClasses[c.tone] ?? toneClasses.slate
        const content = (
          <div
            className={[
              'rounded-2xl border p-3 text-left shadow-sm transition-colors',
              base,
              isActive ? 'ring-2 ring-emerald-500/60' : '',
              c.estado !== null ? 'cursor-pointer hover:bg-[var(--surface-raised)]' : '',
            ].join(' ')}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">{c.label}</p>
            <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">{c.value}</p>
          </div>
        )
        if (c.estado === null) return <div key={c.key}>{content}</div>
        return (
          <Link key={c.key} href={`/vendor/pedidos?estado=${encodeURIComponent(c.estado)}`} scroll={false}>
            {content}
          </Link>
        )
      })}
    </div>
  )
}

function OverdueAlert({ count, t }: { count: number; t: Translate }) {
  const msg = count === 1
    ? t('vendor.orders.overdueOne')
    : t('vendor.orders.overdueOther').replace('{count}', String(count))
  return (
    <Link
      href="/vendor/pedidos?estado=PENDING&orden=oldest"
      className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>⚠️</span>
        <span className="font-medium">{msg}</span>
      </span>
      <span className="text-xs font-semibold">{t('vendor.orders.overdueCta')} →</span>
    </Link>
  )
}

function ageLabel(created: Date, now: number, t: Translate): string {
  const diffMs = now - new Date(created).getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return t('vendor.orders.ageMinutes')
  if (hours < 24) return t('vendor.orders.ageHours').replace('{h}', String(hours))
  const days = Math.floor(hours / 24)
  return t('vendor.orders.ageDays').replace('{d}', String(days))
}

function FulfillmentList({ fulfillments, t, now }: { fulfillments: FulfillmentRow[]; t: Translate; now: number }) {
  return (
    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      {fulfillments.map(f => {
        const statusEntry = STATUS_CONFIG[f.status]
        const statusLabel = statusEntry ? t(statusEntry.labelKey) : f.status
        const statusVariant: BadgeVariant = statusEntry?.variant ?? 'default'
        const customer = f.order.customer
        const shippingAddress = parseOrderAddressSnapshot(f.order.shippingAddressSnapshot) ?? f.order.address
        const total = f.order.lines.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0)
        const itemCount = f.order.lines.reduce((s, l) => s + l.quantity, 0)
        const isOverdue = f.status === 'PENDING' && (now - new Date(f.createdAt).getTime()) > OVERDUE_HOURS * 3_600_000
        return (
          <div key={f.id} className="p-4 transition-colors hover:bg-[var(--surface-raised)]/70 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/vendor/pedidos/${f.orderId}`}
                    className="font-medium text-[var(--foreground)] hover:underline"
                  >
                    {t('vendor.orders.orderNumber').replace('{id}', f.orderId.slice(-6).toUpperCase())}
                  </Link>
                  <Badge variant={statusVariant}>{statusLabel}</Badge>
                  {isOverdue && (
                    <Badge variant="red">{t('vendor.orders.badgeOverdue')}</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {customer.firstName} {customer.lastName} · {formatDate(f.createdAt)} · {ageLabel(f.createdAt, now, t)}
                </p>
                {shippingAddress && (
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-light)]">
                    {shippingAddress.line1}, {shippingAddress.city} {shippingAddress.postalCode}
                  </p>
                )}
                <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                  {t('vendor.orders.itemsTotal')
                    .replace('{items}', String(itemCount))
                    .replace('{total}', formatPrice(total))}
                </p>
              </div>
              <FulfillmentActions
                fulfillmentId={f.id}
                status={f.status}
                labelUrl={f.shipment?.labelUrl ?? null}
                trackingUrl={f.shipment?.trackingUrl ?? null}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {f.order.lines.slice(0, 4).map(line => (
                <div
                  key={line.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]/40 px-2 py-1"
                  title={`${line.quantity} × ${line.product.name}`}
                >
                  <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded bg-[var(--surface-raised)]">
                    {line.product.images?.[0]
                      ? <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="28px" />
                      : <div className="flex h-full items-center justify-center text-sm">🌿</div>}
                  </div>
                  <span className="text-xs text-[var(--foreground)]">
                    {line.quantity} × {line.product.name}
                  </span>
                </div>
              ))}
              {f.order.lines.length > 4 && (
                <span className="self-center text-xs text-[var(--muted)]">
                  +{f.order.lines.length - 4}
                </span>
              )}
            </div>

            {f.trackingNumber && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {t('vendor.orders.tracking')}: <span className="font-mono">{f.trackingNumber}</span>
                {f.carrier && ` (${f.carrier})`}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
