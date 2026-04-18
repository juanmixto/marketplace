import { notFound } from 'next/navigation'
import { db } from '@/lib/db'

interface Props {
  params: Promise<{ ref: string }>
  searchParams: Promise<{ tab?: string; number?: string }>
}

/**
 * Dev-only landing page served when the MockShippingProvider is active.
 * Renders a fake label preview or a fake tracking timeline so producers
 * can click "Imprimir etiqueta" / "Ver seguimiento" without hitting a
 * real carrier. Never rendered in production because real providers
 * return absolute URLs pointing to the carrier.
 */
export default async function MockShipmentPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  const { ref } = await params
  const { tab = 'label', number } = await searchParams

  const shipment = await db.shipment.findFirst({
    where: { providerCode: 'SENDCLOUD', providerRef: ref },
    include: {
      fulfillment: {
        include: {
          vendor: { select: { displayName: true } },
          order: { select: { orderNumber: true } },
        },
      },
    },
  })

  if (!shipment) notFound()

  const to = shipment.toAddressSnapshot as Record<string, unknown>
  const from = shipment.fromAddressSnapshot as Record<string, unknown>

  const isLabel = tab !== 'tracking'

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">⚠️ Simulación (modo desarrollo)</p>
        <p className="mt-1">
          Esta página es una simulación del proveedor logístico. En producción
          con Sendcloud configurado verás la etiqueta real del carrier.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        <a
          href={`/dev/mock-shipment/${ref}?tab=label&number=${number ?? ''}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            isLabel
              ? 'bg-emerald-600 text-white'
              : 'border border-[var(--border)] text-[var(--foreground-soft)]'
          }`}
        >
          Etiqueta
        </a>
        <a
          href={`/dev/mock-shipment/${ref}?tab=tracking&number=${number ?? ''}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            !isLabel
              ? 'bg-emerald-600 text-white'
              : 'border border-[var(--border)] text-[var(--foreground-soft)]'
          }`}
        >
          Seguimiento
        </a>
      </div>

      {isLabel ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-white p-8 text-black">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Remitente</p>
              <p className="font-semibold">{String(from.contactName ?? '')}</p>
              <p className="text-sm">{String(from.line1 ?? '')}</p>
              <p className="text-sm">
                {String(from.postalCode ?? '')} {String(from.city ?? '')} ({String(from.province ?? '')})
              </p>
            </div>
            <div className="rounded border border-black px-2 py-1 text-xs font-bold">
              MOCK CARRIER
            </div>
          </div>
          <hr className="my-4 border-black/20" />
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Destinatario</p>
            <p className="text-xl font-bold">{String(to.contactName ?? '')}</p>
            <p>{String(to.line1 ?? '')}</p>
            {to.line2 ? <p>{String(to.line2)}</p> : null}
            <p className="text-lg font-semibold">
              {String(to.postalCode ?? '')} {String(to.city ?? '')}
            </p>
            <p>{String(to.province ?? '')}</p>
          </div>
          <hr className="my-4 border-black/20" />
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Tracking</p>
              <p className="font-mono text-lg">{shipment.trackingNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-gray-500">Peso</p>
              <p className="font-semibold">{shipment.weightGrams} g</p>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center">
            <div className="h-24 w-full bg-[repeating-linear-gradient(90deg,black_0_2px,white_2px_4px)]" />
          </div>
          <p className="mt-2 text-center font-mono text-xs">{shipment.trackingNumber}</p>
          <p className="mt-4 text-center text-xs text-gray-500">
            Pedido {shipment.fulfillment.order.orderNumber} · {shipment.fulfillment.vendor.displayName}
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Tracking</p>
            <p className="font-mono text-lg text-[var(--foreground)]">
              {shipment.trackingNumber ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Estado actual</p>
            <p className="text-[var(--foreground)]">{shipment.status}</p>
          </div>
          <ol className="mt-4 space-y-3 border-l-2 border-emerald-300 pl-4">
            <li>
              <p className="text-sm font-semibold text-[var(--foreground)]">Etiqueta creada</p>
              <p className="text-xs text-[var(--muted)]">
                {shipment.labelCreatedAt?.toLocaleString('es-ES') ?? '—'}
              </p>
            </li>
            {shipment.handedOverAt && (
              <li>
                <p className="text-sm font-semibold text-[var(--foreground)]">En tránsito</p>
                <p className="text-xs text-[var(--muted)]">
                  {shipment.handedOverAt.toLocaleString('es-ES')}
                </p>
              </li>
            )}
            {shipment.deliveredAt && (
              <li>
                <p className="text-sm font-semibold text-[var(--foreground)]">Entregado</p>
                <p className="text-xs text-[var(--muted)]">
                  {shipment.deliveredAt.toLocaleString('es-ES')}
                </p>
              </li>
            )}
          </ol>
          <p className="mt-4 text-xs text-[var(--muted)]">
            En modo mock no hay eventos reales del carrier. Usa el botón «Refrescar» del
            panel admin para forzar una transición.
          </p>
        </div>
      )}
    </div>
  )
}
