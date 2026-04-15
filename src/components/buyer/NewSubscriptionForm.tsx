'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ForwardIcon,
  MapPinIcon,
  PauseIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { startSubscriptionCheckout } from '@/domains/subscriptions/buyer-actions'
import { formatPrice } from '@/lib/utils'

interface PlanSummary {
  id: string
  cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  priceSnapshot: number
  taxRateSnapshot: number
  cutoffDayOfWeek: number
  product: {
    name: string
    slug: string
    unit: string
    image: string | null
  }
  vendor: {
    displayName: string
    slug: string
  }
}

interface AddressOption {
  id: string
  label: string | null
  firstName: string
  lastName: string
  line1: string
  line2: string | null
  city: string
  province: string
  postalCode: string
  isDefault: boolean
}

interface Props {
  plan: PlanSummary
  addresses: AddressOption[]
}

const MIN_LEAD_DAYS = 2
const MAX_LEAD_DAYS = 60

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function cadenceLabel(cadence: PlanSummary['cadence']): string {
  if (cadence === 'WEEKLY') return 'cada semana'
  if (cadence === 'BIWEEKLY') return 'cada dos semanas'
  return 'cada mes'
}

function cadenceDays(cadence: PlanSummary['cadence']): number {
  if (cadence === 'WEEKLY') return 7
  if (cadence === 'BIWEEKLY') return 14
  return 30
}

function deliveriesPerMonth(cadence: PlanSummary['cadence']): number {
  if (cadence === 'WEEKLY') return 4
  if (cadence === 'BIWEEKLY') return 2
  return 1
}

export function NewSubscriptionForm({ plan, addresses }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const defaultAddressId = addresses.find(a => a.isDefault)?.id ?? addresses[0]?.id
  const [shippingAddressId, setShippingAddressId] = useState<string>(defaultAddressId ?? '')

  // Default first delivery: one cadence from today, so the pre-filled
  // value matches the legacy behavior when the buyer doesn't touch it.
  const defaultFirstDelivery = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + cadenceDays(plan.cadence))
    return toYmd(d)
  }, [plan.cadence])

  const minDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + MIN_LEAD_DAYS)
    return toYmd(d)
  }, [])

  const maxDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + MAX_LEAD_DAYS)
    return toYmd(d)
  }, [])

  const [firstDeliveryAt, setFirstDeliveryAt] = useState<string>(defaultFirstDelivery)

  const priceWithTax = plan.priceSnapshot * (1 + plan.taxRateSnapshot)
  const monthlyEstimate = priceWithTax * deliveriesPerMonth(plan.cadence)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    if (!shippingAddressId) {
      setError('Selecciona una dirección de envío')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await startSubscriptionCheckout({
          planId: plan.id,
          shippingAddressId,
          firstDeliveryAt,
        })
        window.location.assign(result.url)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'No se ha podido iniciar la suscripción. Inténtalo de nuevo en unos segundos.'
        )
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <Link
          href={`/productos/${plan.product.slug}`}
          className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Volver al producto
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-[var(--foreground)]">Confirmar suscripción</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Revisa los detalles antes de activar el cobro recurrente. Podrás saltar
          entregas, pausar o cancelar cuando quieras.
        </p>
      </div>

      {/* Plan summary card */}
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="flex items-start gap-4 p-4 sm:p-5">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
            {plan.product.image ? (
              <Image
                src={plan.product.image}
                alt={plan.product.name}
                fill
                className="object-cover"
                sizes="80px"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-3xl">🧺</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[var(--foreground)]">
              {plan.product.name}
            </p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">{plan.vendor.displayName}</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--foreground)]">
              <ArrowPathIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {formatPrice(priceWithTax)}{' '}
                <span className="text-[var(--muted)]">/ {plan.product.unit}</span>{' '}
                <span className="text-[var(--muted)]">· {cadenceLabel(plan.cadence)}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Coste mensual aproximado:{' '}
              <span className="font-medium text-[var(--foreground)]">
                {formatPrice(monthlyEstimate)}
              </span>{' '}
              ({deliveriesPerMonth(plan.cadence)} entregas/mes)
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Shipping address */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <MapPinIcon className="h-4 w-4 text-[var(--foreground-soft)]" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Dirección de envío
            </h2>
          </div>
          <div className="space-y-2">
            {addresses.map(addr => (
              <label
                key={addr.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  shippingAddressId === addr.id
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-[var(--border)] hover:bg-[var(--surface-raised)]'
                }`}
              >
                <input
                  type="radio"
                  name="shippingAddressId"
                  value={addr.id}
                  checked={shippingAddressId === addr.id}
                  onChange={() => setShippingAddressId(addr.id)}
                  className="mt-1 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--foreground)]">
                      {addr.label ?? `${addr.firstName} ${addr.lastName}`}
                    </span>
                    {addr.isDefault && (
                      <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Predeterminada
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[var(--muted)]">
                    {addr.line1}
                    {addr.line2 ? `, ${addr.line2}` : ''} · {addr.postalCode} {addr.city},{' '}
                    {addr.province}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <Link
            href={`/cuenta/direcciones?returnTo=${encodeURIComponent(
              `/cuenta/suscripciones/nueva?planId=${plan.id}`,
            )}`}
            className="mt-3 inline-block text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            + Añadir otra dirección
          </Link>
        </section>

        {/* First delivery date */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDaysIcon className="h-4 w-4 text-[var(--foreground-soft)]" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Fecha de la primera entrega
            </h2>
          </div>
          <input
            type="date"
            value={firstDeliveryAt}
            min={minDate}
            max={maxDate}
            onChange={e => setFirstDeliveryAt(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            required
          />
          <p className="mt-2 text-xs text-[var(--muted)]">
            A partir de esa fecha, cada nueva entrega llegará{' '}
            <span className="font-medium text-[var(--foreground)]">
              {cadenceLabel(plan.cadence)}
            </span>
            . Las entregas deben programarse con al menos {MIN_LEAD_DAYS} días de antelación
            y hasta {MAX_LEAD_DAYS} días en el futuro.
          </p>
        </section>

        {/* Terms — what the buyer commits to */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheckIcon className="h-4 w-4 text-[var(--foreground-soft)]" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Qué incluye la suscripción
            </h2>
          </div>
          <ul className="space-y-2 text-sm text-[var(--foreground-soft)]">
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <span>
                Recibirás la caja {cadenceLabel(plan.cadence)} hasta que la canceles.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ForwardIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <span>
                Puedes <strong>saltar una entrega</strong> antes del día de cierre semanal
                sin coste.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <PauseIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <span>
                Puedes <strong>pausar la suscripción</strong> el tiempo que quieras y
                reanudarla cuando vuelvas.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <XCircleIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <span>
                Puedes <strong>cancelar sin compromiso</strong> en cualquier momento
                desde tu cuenta.
              </span>
            </li>
          </ul>
        </section>

        {error && (
          <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300" role="alert">
            {error}
          </p>
        )}

        {/* Sticky-ish CTA */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href={`/productos/${plan.product.slug}`}
            className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={pending || !shippingAddressId}
            data-testid="confirm-subscription-submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
          >
            {pending ? 'Redirigiendo al pago…' : 'Confirmar y pagar'}
          </button>
        </div>
      </form>
    </div>
  )
}
