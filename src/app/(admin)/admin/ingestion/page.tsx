import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  listReviewQueue,
  REVIEW_QUEUE_PAGE_SIZE,
  type ReviewQueueListKind,
} from '@/domains/ingestion'
import { requireIngestionAdmin } from '@/domains/ingestion/authz'
import { IngestionFeatureUnavailableError } from '@/domains/ingestion/authz'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Ingestion · Review queue | Admin' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    kind?: string
    state?: string
    page?: string
  }>
}

const KIND_OPTIONS: Array<{ value: ReviewQueueListKind | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Todo' },
  { value: 'PRODUCT_DRAFT', label: 'Product drafts' },
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

function buildHref(base: { kind: string; state: string }, overrides: { kind?: string; state?: string; page?: number } = {}) {
  const next = { ...base, ...overrides }
  const params = new URLSearchParams()
  if (next.kind && next.kind !== 'ALL') params.set('kind', next.kind)
  if (next.state && next.state !== 'ENQUEUED') params.set('state', next.state)
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
  const result = await listReviewQueue({ kind, state, page, pageSize: REVIEW_QUEUE_PAGE_SIZE })
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))

  const baseParams = { kind, state }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Ingestion · Review queue
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Drafts and unextractable producer messages queued for human review. Nothing here touches the public catalog yet.
        </p>
      </div>

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
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--muted)]/40 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Texto</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Confianza</th>
                  <th className="px-4 py-3 font-medium">Precio</th>
                  <th className="px-4 py-3 font-medium">Autor</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
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
                          className="block max-w-[32rem] truncate text-[var(--foreground)] hover:underline"
                          title={row.messageText ?? ''}
                        >
                          {productName ?? row.messageText ?? '(sin texto)'}
                        </Link>
                        {productName && row.messageText && (
                          <div className="mt-0.5 max-w-[32rem] truncate text-xs text-[var(--muted-foreground)]">
                            {row.messageText}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge variant={isProduct ? 'blue' : 'amber'}>
                          {isProduct ? 'PRODUCT' : 'SIN PRECIO'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge variant={bandVariant(band)}>
                          {band} · {confidenceOverall}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top text-[var(--muted-foreground)]">{priceLabel}</td>
                      <td className="px-4 py-3 align-top text-[var(--muted-foreground)]">
                        {row.authorId ?? '—'}
                      </td>
                      <td className="px-4 py-3 align-top text-[var(--muted-foreground)]">
                        {row.messagePostedAt ? formatDate(row.messagePostedAt) : '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge variant={row.state === 'ENQUEUED' ? 'outline' : 'green'}>
                          {row.state === 'ENQUEUED' ? 'Por revisar' : 'Resuelto'}
                        </Badge>
                        {row.autoResolvedReason && (
                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {row.autoResolvedReason}
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
