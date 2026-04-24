import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getReviewQueueItem } from '@/domains/ingestion'
import { requireIngestionAdmin, IngestionFeatureUnavailableError } from '@/domains/ingestion/authz'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ReviewItemActions } from '@/components/admin/ingestion/ReviewItemActions'
import { formatDate } from '@/lib/utils'

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
    case 'adminApproved':
      return 'Aprobado por admin'
    case 'adminDiscarded':
    case 'adminDiscardedUnextractable':
      return 'Descartado por admin'
    case 'adminMarkedValid':
      return 'Marcado como válido por admin'
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-[var(--foreground)]">{value}</p>
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

  const payload = (item.target.extraction.payload as ExtractionPayloadShape | null) ?? {}
  const rulesFired = payload.rulesFired ?? []
  const productOrdinal =
    item.target.kind === 'PRODUCT_DRAFT' ? item.target.draft.productOrdinal : 0
  const productPayload = payload.products?.find((p) => (p.productOrdinal ?? 0) === productOrdinal)

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm">
        <CardHeader className="flex flex-col gap-4 border-b border-[var(--border)] bg-[var(--surface)] lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Link
              href="/admin/ingestion"
              className="inline-flex text-xs text-[var(--muted-foreground)] hover:underline"
            >
              ← Volver a la cola
            </Link>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                Revisión
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                {item.target.kind === 'PRODUCT_DRAFT' ? 'Draft de producto' : 'Sin precio extractado'}
              </h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Resumen del mensaje, la extracción y la acción humana pendiente.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
              <Badge variant={item.state === 'ENQUEUED' ? 'outline' : 'green'}>
                {item.state === 'ENQUEUED' ? 'Por revisar' : 'Resuelto'}
              </Badge>
              {item.autoResolvedReason && <Badge variant="default">{humaniseReason(item.autoResolvedReason)}</Badge>}
              <span className="rounded-full border border-[var(--border)] px-2.5 py-1">
                Creado {formatDate(item.createdAt)}
              </span>
            </div>
          </div>

          <div className="grid min-w-[20rem] gap-2 sm:grid-cols-2">
            <MiniStat label="Autor" value={item.message.authorId ?? '—'} />
            <MiniStat label="Publicado" value={formatDate(item.message.postedAt)} />
            <MiniStat label="Chat" value={item.message.chatId} />
            <MiniStat label="Mensaje id" value={String(item.message.id)} />
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
          {item.target.kind === 'UNEXTRACTABLE_PRODUCT' && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-200">
              <strong>Sin datos estructurados.</strong> Clasificación {item.target.extraction.classification}. Revisión humana obligatoria.
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section className="space-y-3">
              <p className="text-sm font-semibold text-[var(--foreground)]">Mensaje original</p>
              <pre className="whitespace-pre-wrap break-words rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--foreground)]">
                {item.message.text ?? '(sin texto)'}
              </pre>
            </section>

            <section className="space-y-3">
              <p className="text-sm font-semibold text-[var(--foreground)]">Estado de extracción</p>
              {item.target.kind === 'PRODUCT_DRAFT' ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--foreground)]">Confidence</p>
                    <Badge variant={bandVariant(item.target.draft.confidenceBand)}>
                      {item.target.draft.confidenceBand} · {item.target.draft.confidenceOverall}
                    </Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                    <Field label="Producto" value={item.target.draft.productName ?? '—'} />
                    <Field
                      label="Precio"
                      value={formatPriceCents(item.target.draft.priceCents, item.target.draft.currencyCode)}
                    />
                    <Field label="Unidad" value={item.target.draft.unit ?? '—'} />
                    <Field label="Peso" value={item.target.draft.weightGrams ?? '—'} />
                    <Field label="Categoría" value={item.target.draft.categorySlug ?? '—'} />
                    <Field label="Disponibilidad" value={item.target.draft.availability ?? '—'} />
                    <Field label="Estado" value={item.target.draft.status} />
                    <Field label="Extractor" value={item.target.draft.extractorVersion} />
                    <Field label="Ordinal" value={item.target.draft.productOrdinal} />
                  </dl>
                </div>
              ) : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
                  No hay extracción estructurada para este item.
                </div>
              )}

              {item.target.kind === 'PRODUCT_DRAFT' && item.target.vendorDraft && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="text-sm font-medium text-[var(--foreground)]">Vendor inferido</p>
                  <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <Field
                      label="Nombre"
                      value={
                        item.target.vendorDraft.displayName === 'Unknown vendor'
                          ? '—'
                          : item.target.vendorDraft.displayName
                      }
                    />
                    <Field label="External id" value={item.target.vendorDraft.externalId ?? '—'} />
                    <Field label="Draft id" value={item.target.vendorDraft.id} />
                  </dl>
                </div>
              )}
            </section>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm">
          <CardHeader className="border-b border-[var(--border)] bg-[var(--surface)]">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Trazabilidad</h2>
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

            <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <summary className="cursor-pointer text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                Ver detalles técnicos
              </summary>
              <div className="mt-4 space-y-4">
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
                              <span className="ml-2 text-[var(--muted-foreground)]">("{meta.source}")</span>
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
                  value={<span className="font-mono text-xs">{item.target.extraction.correlationId}</span>}
                />
              </div>
            </details>
          </CardBody>
        </Card>

        <Card className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm">
          <CardHeader className="border-b border-[var(--border)] bg-[var(--surface)]">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Acciones</h2>
          </CardHeader>
          <CardBody className="space-y-4">
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

            {item.target.kind === 'UNEXTRACTABLE_PRODUCT' && item.target.dedupeCandidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--foreground)]">Posibles duplicados</p>
                <ul className="space-y-2 text-sm">
                  {item.target.dedupeCandidates.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2 text-xs">
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
                        {formatDate(c.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
