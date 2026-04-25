import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  listReviewQueue,
  REVIEW_QUEUE_PAGE_SIZE,
  type ReviewQueueListKind,
  type ReviewQueueSortKey,
  type ReviewQueueSortDir,
} from '@/domains/ingestion'
import { requireIngestionAdmin } from '@/domains/ingestion/authz'
import { IngestionFeatureUnavailableError } from '@/domains/ingestion/authz'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Ingestion · Review queue | Admin' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    kind?: string
    state?: string
    page?: string
    sort?: string
    dir?: string
    flash?: string
    productId?: string
  }>
}

type SortKey = ReviewQueueSortKey
type SortDir = ReviewQueueSortDir

const SORT_KEYS: readonly SortKey[] = [
  'fecha',
  'tipo',
  'confianza',
  'precio',
  'autor',
  'estado',
]

function parseSort(v: string | undefined): SortKey {
  return (SORT_KEYS as readonly string[]).includes(v ?? '') ? (v as SortKey) : 'fecha'
}

function parseDir(v: string | undefined): SortDir {
  return v === 'asc' ? 'asc' : 'desc'
}

type FlashKind = 'published' | 'discarded' | 'markedValid'

function parseFlash(v: string | undefined): FlashKind | null {
  if (v === 'published' || v === 'discarded' || v === 'markedValid') return v
  return null
}

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: '2-digit',
})

function formatShortDate(d: Date): string {
  // "28 mar 26" — Intl gives "28 mar. 26" on some runtimes, strip the
  // trailing dot off the month abbreviation for consistency.
  return DATE_FORMATTER.format(d).replace('.', '')
}

const KIND_OPTIONS: Array<{ value: ReviewQueueListKind | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Todo' },
  { value: 'PRODUCT_DRAFT', label: 'Drafts de producto' },
  { value: 'UNEXTRACTABLE_PRODUCT', label: 'Sin precio' },
]

const STATE_OPTIONS: Array<{ value: 'ENQUEUED' | 'AUTO_RESOLVED' | 'ALL'; label: string }> = [
  { value: 'ENQUEUED', label: 'Por revisar' },
  { value: 'AUTO_RESOLVED', label: 'Resueltos' },
  { value: 'ALL', label: 'Todos' },
]

function parseKind(v: string | undefined): ReviewQueueListKind | 'ALL' {
  if (v === 'PRODUCT_DRAFT' || v === 'UNEXTRACTABLE_PRODUCT') return v
  return 'ALL'
}

function parseState(v: string | undefined): 'ENQUEUED' | 'AUTO_RESOLVED' | 'ALL' {
  if (v === 'AUTO_RESOLVED' || v === 'ALL') return v
  return 'ENQUEUED'
}

interface HrefBase {
  kind: string
  state: string
  sort: SortKey
  dir: SortDir
}

function buildHref(
  base: HrefBase,
  overrides: Partial<HrefBase> & { page?: number } = {},
) {
  const next = { ...base, ...overrides }
  const params = new URLSearchParams()
  if (next.kind && next.kind !== 'ALL') params.set('kind', next.kind)
  if (next.state && next.state !== 'ENQUEUED') params.set('state', next.state)
  if (next.sort !== 'fecha') params.set('sort', next.sort)
  if (next.dir !== 'desc') params.set('dir', next.dir)
  if (overrides.page && overrides.page > 1) params.set('page', String(overrides.page))
  const qs = params.toString()
  return qs ? `/admin/ingestion?${qs}` : '/admin/ingestion'
}

function bandVariant(band: string): 'green' | 'amber' | 'red' | 'outline' {
  if (band === 'HIGH') return 'green'
  if (band === 'MEDIUM') return 'amber'
  if (band === 'LOW') return 'red'
  return 'outline'
}

function formatPriceCents(cents: number | null, currency: string | null): string {
  if (cents == null) return '—'
  return `${(cents / 100).toFixed(2)} ${currency ?? 'EUR'}`
}

function humaniseReason(reason: string): string {
  switch (reason) {
    case 'adminApproved': return 'Aprobado por admin'
    case 'adminDiscarded': return 'Descartado por admin'
    case 'adminDiscardedUnextractable': return 'Descartado por admin'
    case 'adminMarkedValid': return 'Marcado como válido por admin'
    default:
      // Product-draft dedupe (scanner.ts) writes `dedupe:<rule>`:
      if (reason === 'dedupe:identicalAcrossAllFields') return 'Duplicado exacto (auto-fusionado)'
      if (reason.startsWith('dedupe:')) return 'Duplicado (auto-fusionado)'
      // Unextractable dedupe (unextractable.ts) writes
      // `unextractableDedupe:<rule>`.
      if (reason.startsWith('unextractableDedupe:')) return 'Duplicado sin-precio (auto-fusionado)'
      if (reason.startsWith('productDedupe:')) return 'Duplicado (auto-fusionado)'
      return reason
  }
}

export default async function IngestionReviewQueuePage({ searchParams }: PageProps) {
  try {
    await requireIngestionAdmin()
  } catch (err) {
    if (err instanceof IngestionFeatureUnavailableError) notFound()
    throw err
  }

  const sp = await searchParams
  const kind = parseKind(sp.kind)
  const state = parseState(sp.state)
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)
  const sort = parseSort(sp.sort)
  const dir = parseDir(sp.dir)
  const result = await listReviewQueue({ kind, state, page, pageSize: REVIEW_QUEUE_PAGE_SIZE, sort, dir })
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))

  // Post-action flash: the item detail redirects here with
  // ?flash=<kind> after a terminal action so we can render a
  // contextual banner and offer a one-click hop to the next
  // pending item, instead of leaving the operator stuck on a
  // disabled detail page.
  const flash = parseFlash(sp.flash)
  const flashProductId = sp.productId?.trim() || null
  // Next pending item = first ENQUEUED row under current filters.
  // Cheap: reuse listReviewQueue with pageSize=1 and state=ENQUEUED.
  const nextPending = flash
    ? await listReviewQueue({
        kind,
        state: 'ENQUEUED',
        page: 1,
        pageSize: 1,
        sort: 'fecha',
        dir: 'desc',
      })
    : null
  const nextPendingItemId = nextPending?.rows[0]?.itemId ?? null
  const pendingRemaining = nextPending?.total ?? 0

  const baseParams: HrefBase = { kind, state, sort, dir }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Ingesta · Cola de revisión
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Drafts y mensajes de productor sin precio pendientes de revisión humana. Nada de lo que haya aquí toca todavía el catálogo público.
        </p>
      </div>

      {flash && (
        <FlashBanner
          flash={flash}
          productId={flashProductId}
          nextPendingItemId={nextPendingItemId}
          pendingRemaining={pendingRemaining}
        />
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {KIND_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                href={buildHref(baseParams, { kind: opt.value })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  kind === opt.value
                    ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                    : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]/60',
                )}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {STATE_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                href={buildHref(baseParams, { state: opt.value })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  state === opt.value
                    ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                    : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]/60',
                )}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </CardHeader>

        <CardBody className="p-0">
          <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
            <table className="w-full min-w-[880px] table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-[7rem]" />
                <col className="w-[8rem]" />
                <col className="w-[7rem]" />
                <col className="w-[7.5rem]" />
                <col className="w-[6rem]" />
                <col className="w-[12rem]" />
              </colgroup>
              <thead className="bg-[var(--muted)]/40 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Texto</th>
                  <SortableTh label="Tipo" sortKey="tipo" current={sort} dir={dir} base={baseParams} />
                  <SortableTh label="Confianza" sortKey="confianza" current={sort} dir={dir} base={baseParams} />
                  <SortableTh label="Precio" sortKey="precio" current={sort} dir={dir} base={baseParams} />
                  <SortableTh label="Autor" sortKey="autor" current={sort} dir={dir} base={baseParams} />
                  <SortableTh label="Fecha" sortKey="fecha" current={sort} dir={dir} base={baseParams} />
                  <SortableTh label="Estado" sortKey="estado" current={sort} dir={dir} base={baseParams} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                      No hay items en la cola para estos filtros.
                    </td>
                  </tr>
                )}
                {result.rows.map((row) => {
                  const target = row.target
                  const isProduct = target.kind === 'PRODUCT_DRAFT'
                  const band = isProduct ? target.draft.confidenceBand : target.confidenceBand
                  const confidenceOverall = isProduct
                    ? target.draft.confidenceOverall
                    : target.confidenceOverall
                  const productName = isProduct ? target.draft.productName : null
                  const priceLabel = isProduct
                    ? formatPriceCents(target.draft.priceCents, target.draft.currencyCode)
                    : '—'
                  return (
                    <tr key={row.itemId} className="hover:bg-[var(--muted)]/30">
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/admin/ingestion/${row.itemId}`}
                          className="block truncate text-[var(--foreground)] hover:underline"
                          title={row.messageText ?? ''}
                        >
                          {productName ?? row.messageText ?? '(sin texto)'}
                        </Link>
                        {productName && row.messageText && (
                          <div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                            {row.messageText}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <Badge variant={isProduct ? 'blue' : 'amber'} className="whitespace-nowrap">
                          {isProduct ? 'PRODUCT' : 'SIN PRECIO'}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        {isProduct ? (
                          <Badge variant={bandVariant(band)} className="whitespace-nowrap">
                            {band} · {confidenceOverall}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top text-[var(--muted-foreground)]">{priceLabel}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top text-[var(--muted-foreground)]">
                        {row.authorId ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top text-[var(--muted-foreground)]">
                        {row.messagePostedAt ? formatShortDate(row.messagePostedAt) : '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge variant={row.state === 'ENQUEUED' ? 'outline' : 'green'} className="whitespace-nowrap">
                          {row.state === 'ENQUEUED' ? 'Por revisar' : 'Resuelto'}
                        </Badge>
                        {row.autoResolvedReason && (
                          <div className="mt-1 text-xs leading-tight text-[var(--muted-foreground)]">
                            {humaniseReason(row.autoResolvedReason)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardBody>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted-foreground)]">
            <span>
              Página {page} de {totalPages} · {result.total} items
            </span>
            <div className="flex gap-2">
              <Link
                href={buildHref(baseParams, { page: page - 1 })}
                className={cn(
                  'rounded border border-[var(--border)] px-3 py-1 hover:border-[var(--foreground)]/60',
                  page <= 1 && 'pointer-events-none opacity-40',
                )}
                aria-disabled={page <= 1}
              >
                ← Anterior
              </Link>
              <Link
                href={buildHref(baseParams, { page: page + 1 })}
                className={cn(
                  'rounded border border-[var(--border)] px-3 py-1 hover:border-[var(--foreground)]/60',
                  page >= totalPages && 'pointer-events-none opacity-40',
                )}
                aria-disabled={page >= totalPages}
              >
                Siguiente →
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

interface SortableThProps {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  base: HrefBase
}

function SortableTh({ label, sortKey, current, dir, base }: SortableThProps) {
  const active = current === sortKey
  const nextDir: SortDir = active && dir === 'desc' ? 'asc' : 'desc'
  const arrow = active ? (dir === 'asc' ? '↑' : '↓') : '↕'
  return (
    <th className="whitespace-nowrap px-4 py-3 font-medium">
      <Link
        href={buildHref(base, { sort: sortKey, dir: nextDir, page: 1 })}
        className={cn(
          'inline-flex items-center gap-1 hover:text-[var(--foreground)]',
          active && 'text-[var(--foreground)]',
        )}
      >
        {label}
        <span className={cn('text-[10px]', !active && 'opacity-40')}>{arrow}</span>
      </Link>
    </th>
  )
}

interface FlashBannerProps {
  flash: FlashKind
  productId: string | null
  nextPendingItemId: string | null
  pendingRemaining: number
}

function FlashBanner({ flash, productId, nextPendingItemId, pendingRemaining }: FlashBannerProps) {
  const headline =
    flash === 'published'
      ? '✓ Producto creado'
      : flash === 'discarded'
        ? '✓ Item descartado'
        : '✓ Marcado como válido'
  const detail =
    flash === 'published'
      ? 'El producto está en PENDING_REVIEW en el catálogo. Cuando lo quieras publicar de verdad, flipalo a ACTIVE desde /admin/productos.'
      : flash === 'discarded'
        ? 'El draft queda como REJECTED en el audit. No se toca el catálogo.'
        : 'El item queda resuelto en la cola. El mensaje original sigue en la tabla de ingestión.'
  const tone =
    flash === 'discarded'
      ? 'border-red-500/30 bg-red-50/60 dark:border-red-500/20 dark:bg-red-950/20'
      : 'border-emerald-500/30 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-950/20'

  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4', tone)}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--foreground)]">{headline}</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{detail}</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {pendingRemaining === 0
            ? 'No quedan items pendientes en esta vista.'
            : `${pendingRemaining} item${pendingRemaining === 1 ? '' : 's'} pendiente${pendingRemaining === 1 ? '' : 's'} en esta vista.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {flash === 'published' && productId && (
          <Link
            href={`/admin/productos/${productId}/edit`}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
          >
            Ver producto creado →
          </Link>
        )}
        {nextPendingItemId && (
          <Link
            href={`/admin/ingestion/${nextPendingItemId}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-semibold text-[var(--foreground)] hover:border-[var(--border-strong)]"
          >
            Siguiente pendiente →
          </Link>
        )}
        <Link
          href="/admin/ingestion"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          aria-label="Cerrar aviso"
        >
          ×
        </Link>
      </div>
    </div>
  )
}
