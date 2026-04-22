import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getReviewQueueItem } from '@/domains/ingestion'
import { requireIngestionAdmin, IngestionFeatureUnavailableError } from '@/domains/ingestion/authz'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMadridDate } from '@/lib/utils'
import { ReviewItemActions } from '@/components/admin/ingestion/ReviewItemActions'

export const metadata: Metadata = { title: 'Review item | Admin' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ itemId: string }>
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
      if (reason.startsWith('unextractableDedupe:')) return 'Fusionado automático (dedupe)'
      if (reason.startsWith('productDedupe:')) return 'Fusionado automático (dedupe)'
      return reason
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[var(--foreground)]">{value ?? '—'}</dd>
    </div>
  )
}

interface ExtractionPayloadShape {
  rulesFired?: string[]
  products?: Array<{
    productOrdinal?: number
    extractionMeta?: Record<string, { rule?: string; source?: string }>
    confidenceByField?: Record<string, number>
    confidenceModel?: {
      method?: string
      weights?: Record<string, number>
      excludedFields?: string[]
      bonus?: { rule?: string; amount?: number } | null
    }
  }>
  vendorHint?: { externalId?: string | null; displayName?: string | null; meta?: unknown }
}

export default async function ReviewItemDetailPage({ params }: PageProps) {
  try {
    await requireIngestionAdmin()
  } catch (err) {
    if (err instanceof IngestionFeatureUnavailableError) notFound()
    throw err
  }

  const { itemId } = await params
  const item = await getReviewQueueItem(itemId)
  if (!item) notFound()

  const payload = (item.target.kind === 'PRODUCT_DRAFT'
    ? (item.target.extraction.payload as ExtractionPayloadShape | null)
    : (item.target.extraction.payload as ExtractionPayloadShape | null)) ?? {}
  const rulesFired = payload.rulesFired ?? []
  const productOrdinal =
    item.target.kind === 'PRODUCT_DRAFT' ? item.target.draft.productOrdinal : 0
  const productPayload = payload.products?.find(
    (p) => (p.productOrdinal ?? 0) === productOrdinal,
  )

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/ingestion"
          className="text-xs text-[var(--muted-foreground)] hover:underline"
        >
          ← Volver a la cola
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
          {item.target.kind === 'PRODUCT_DRAFT' ? 'Draft de producto' : 'Sin precio extractado'}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <Badge variant={item.state === 'ENQUEUED' ? 'outline' : 'green'}>
            {item.state === 'ENQUEUED' ? 'Por revisar' : 'Resuelto'}
          </Badge>
          {item.autoResolvedReason && <span>· {humaniseReason(item.autoResolvedReason)}</span>}
          <span>· Creado {formatMadridDate(item.createdAt)}</span>
        </div>
      </div>

      {item.target.kind === 'UNEXTRACTABLE_PRODUCT' && (
        <Card>
          <CardBody className="bg-amber-50/50 dark:bg-amber-950/20">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              <strong>Detectado como productor</strong> pero sin datos estructurados
              (precio, unidad…). Clasificación: {item.target.extraction.classification}.
              No inventamos campos — revisión humana obligatoria.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">Mensaje original</h2>
        </CardHeader>
        <CardBody>
          <pre className="whitespace-pre-wrap break-words rounded bg-[var(--muted)]/40 p-3 text-sm text-[var(--foreground)]">
            {item.message.text ?? '(sin texto)'}
          </pre>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Autor" value={item.message.authorId ?? '—'} />
            <Field label="Publicado" value={formatMadridDate(item.message.postedAt)} />
            <Field label="Chat" value={item.message.chatId} />
            <Field label="Mensaje id" value={item.message.id} />
          </dl>
        </CardBody>
      </Card>

      {item.target.kind === 'PRODUCT_DRAFT' && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Extracción</h2>
            <Badge variant={bandVariant(item.target.draft.confidenceBand)}>
              {item.target.draft.confidenceBand} · {item.target.draft.confidenceOverall}
            </Badge>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Producto" value={item.target.draft.productName ?? '—'} />
              <Field
                label="Precio"
                value={formatPriceCents(item.target.draft.priceCents, item.target.draft.currencyCode)}
              />
              <Field label="Unidad" value={item.target.draft.unit ?? '—'} />
              <Field label="Peso (g)" value={item.target.draft.weightGrams ?? '—'} />
              <Field label="Categoría" value={item.target.draft.categorySlug ?? '—'} />
              <Field label="Disponibilidad" value={item.target.draft.availability ?? '—'} />
              <Field label="Status" value={item.target.draft.status} />
              <Field label="Extractor" value={item.target.draft.extractorVersion} />
              <Field label="Ordinal" value={item.target.draft.productOrdinal} />
            </dl>
          </CardBody>
        </Card>
      )}

      {item.target.kind === 'PRODUCT_DRAFT' && item.target.vendorDraft && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">Vendor draft inferido</h2>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field
                label="Display name"
                value={
                  item.target.vendorDraft.displayName === 'Unknown vendor' ? (
                    <span>
                      <span className="text-[var(--muted-foreground)]">—</span>
                      <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                        (fallback: el extractor no infirió el nombre)
                      </span>
                    </span>
                  ) : (
                    item.target.vendorDraft.displayName
                  )
                }
              />
              <Field label="External id" value={item.target.vendorDraft.externalId ?? '—'} />
              <Field label="Draft id" value={item.target.vendorDraft.id} />
            </dl>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">Trazabilidad</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field
            label="Reglas disparadas"
            value={
              rulesFired.length ? (
                <div className="flex flex-wrap gap-1">
                  {rulesFired.map((rule) => (
                    <Badge key={rule} variant="default">
                      {rule}
                    </Badge>
                  ))}
                </div>
              ) : item.target.kind === 'UNEXTRACTABLE_PRODUCT' ? (
                <span className="text-xs text-[var(--muted-foreground)]">
                  El extractor de reglas no se ejecuta cuando la clasificación es{' '}
                  <span className="font-mono">
                    {item.target.extraction.classification ?? 'PRODUCT_NO_PRICE'}
                  </span>
                  .
                </span>
              ) : (
                '—'
              )
            }
          />

          <details className="group rounded border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              Detalles técnicos
            </summary>
            <div className="mt-3 space-y-4">
              {productPayload?.extractionMeta && (
                <Field
                  label="Origen de cada campo"
                  value={
                    <ul className="space-y-1 text-xs">
                      {Object.entries(productPayload.extractionMeta).map(([field, meta]) => (
                        <li key={field}>
                          <span className="font-mono text-[var(--muted-foreground)]">{field}</span>:{' '}
                          <span className="font-mono">{meta.rule}</span>
                          {meta.source && (
                            <span className="ml-2 text-[var(--muted-foreground)]">
                              (“{meta.source}”)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  }
                />
              )}
              {productPayload?.confidenceModel && (
                <Field
                  label="Modelo de confianza"
                  value={
                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="text-[var(--muted-foreground)]">método: </span>
                        <span className="font-mono">{productPayload.confidenceModel.method}</span>
                      </div>
                      {productPayload.confidenceModel.weights && (
                        <div>
                          <span className="text-[var(--muted-foreground)]">pesos:</span>
                          <ul className="ml-4 list-disc space-y-0.5">
                            {Object.entries(productPayload.confidenceModel.weights)
                              .sort(([, a], [, b]) => b - a)
                              .map(([field, weight]) => (
                                <li key={field}>
                                  <span className="font-mono">{field}</span>
                                  <span className="ml-2 text-[var(--muted-foreground)]">×{weight}</span>
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}
                      {productPayload.confidenceModel.excludedFields?.length ? (
                        <div>
                          <span className="text-[var(--muted-foreground)]">excluidos: </span>
                          <span className="font-mono">
                            {productPayload.confidenceModel.excludedFields.join(', ')}
                          </span>
                        </div>
                      ) : null}
                      {productPayload.confidenceModel.bonus && (
                        <div>
                          <span className="text-[var(--muted-foreground)]">bonus: </span>
                          <span className="font-mono">
                            {productPayload.confidenceModel.bonus.rule} (+
                            {productPayload.confidenceModel.bonus.amount})
                          </span>
                        </div>
                      )}
                    </div>
                  }
                />
              )}
              <Field
                label="Correlation id"
                value={
                  <span className="font-mono text-xs">
                    {item.target.extraction.correlationId}
                  </span>
                }
              />
            </div>
          </details>
        </CardBody>
      </Card>

      {item.target.kind === 'UNEXTRACTABLE_PRODUCT' && item.target.dedupeCandidates.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">Posibles duplicados</h2>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2 text-sm">
              {item.target.dedupeCandidates.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded border border-[var(--border)] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex gap-2 text-xs">
                      <Badge variant={c.kind === 'STRONG' ? 'green' : 'amber'}>{c.kind}</Badge>
                      <Badge variant={c.riskClass === 'LOW' ? 'green' : c.riskClass === 'MEDIUM' ? 'amber' : 'red'}>
                        riesgo {c.riskClass}
                      </Badge>
                      {c.autoApplied && <Badge variant="blue">fusión automática</Badge>}
                    </div>
                    <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                      {c.otherMessageText ?? '(sin texto)'}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                    {formatMadridDate(c.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">Acciones</h2>
        </CardHeader>
        <CardBody>
          {item.target.kind === 'PRODUCT_DRAFT' ? (
            <ReviewItemActions
              kind="PRODUCT_DRAFT"
              draftId={item.target.draft.id}
              canEdit={item.target.draft.status === 'PENDING'}
              initialValues={{
                productName: item.target.draft.productName,
                priceCents: item.target.draft.priceCents,
                currencyCode: item.target.draft.currencyCode,
                unit: item.target.draft.unit,
                weightGrams: item.target.draft.weightGrams,
                categorySlug: item.target.draft.categorySlug,
                availability: item.target.draft.availability,
              }}
            />
          ) : (
            <ReviewItemActions
              kind="UNEXTRACTABLE_PRODUCT"
              extractionId={item.target.extraction.id}
              canAct={item.state === 'ENQUEUED'}
            />
          )}
        </CardBody>
      </Card>
    </div>
  )
}
