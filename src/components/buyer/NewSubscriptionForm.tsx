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

type Cadence = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'

export interface PlanSummary {
  id: string
  cadence: Cadence
  priceSnapshot: number
  taxRateSnapshot: number
  cutoffDayOfWeek: number
}

export interface ProductSummary {
  id: string
  name: string
  slug: string
  unit: string
  image: string | null
}

export interface VendorSummary {
  displayName: string
  slug: string
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
  product: ProductSummary
  vendor: VendorSummary
  plans: PlanSummary[]
  addresses: AddressOption[]
  /**
   * When the buyer arrived via a legacy `?planId=…` link we preselect
   * that plan in the cadence picker so the UX feels continuous. Null
   * means "use the shortest cadence as default".
   */
  initialPlanId: string | null
}

const MIN_LEAD_DAYS = 2
const MAX_LEAD_DAYS = 60

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function cadenceLabel(cadence: Cadence): string {
  if (cadence === 'WEEKLY') return 'cada semana'
  if (cadence === 'BIWEEKLY') return 'cada dos semanas'
  return 'cada mes'
}

function cadenceShort(cadence: Cadence): string {
  if (cadence === 'WEEKLY') return 'Semanal'
  if (cadence === 'BIWEEKLY') return 'Quincenal'
  return 'Mensual'
}

function cadenceDays(cadence: Cadence): number {
  if (cadence === 'WEEKLY') return 7
  if (cadence === 'BIWEEKLY') return 14
  return 30
}

function deliveriesPerMonth(cadence: Cadence): number {
  if (cadence === 'WEEKLY') return 4
  if (cadence === 'BIWEEKLY') return 2
  return 1
}

export function NewSubscriptionForm({
  product,
  vendor,
  plans,
  addresses,
  initialPlanId,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Sort plans by cadence length so the cheapest-frequency (monthly) is
  // last and the default (weekly or whatever is shortest) is first.
  const orderedPlans = useMemo(
    () => [...plans].sort((a, b) => cadenceDays(a.cadence) - cadenceDays(b.cadence)),
    [plans],
  )

  const defaultPlanId =
    (initialPlanId && orderedPlans.find(p => p.id === initialPlanId)?.id) ??
    orderedPlans[0]?.id

  const [selectedPlanId, setSelectedPlanId] = useState<string>(defaultPlanId ?? '')
  const selectedPlan =
    orderedPlans.find(p => p.id === selectedPlanId) ?? orderedPlans[0]

  const defaultAddressId = addresses.find(a => a.isDefault)?.id ?? addresses[0]?.id
  const [shippingAddressId, setShippingAddressId] = useState<string>(defaultAddressId ?? '')

  // Default first delivery: one cadence of the SELECTED plan from today.
  // We recompute on cadence change via useMemo → the date input's
  // `defaultValue` doesn't track cadence, so the buyer's manual pick is
  // preserved as long as it stays valid. They can always edit it.
  const initialFirstDelivery = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + cadenceDays(selectedPlan?.cadence ?? 'WEEKLY'))
    return toYmd(d)
  }, [selectedPlan?.cadence])

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

  const [firstDeliveryAt, setFirstDeliveryAt] = useState<string>(initialFirstDelivery)

  // When the buyer switches cadence, reset the first-delivery date to
  // the new default — weekly default != biweekly default. If they had
  // manually picked a date that's still inside [min, max] we leave it,
  // but using a key-on-change approach is simpler: bump the default
  // when cadence changes and let React reconcile.
  const [touchedDate, setTouchedDate] = useState(false)
  const effectiveFirstDelivery = touchedDate ? firstDeliveryAt : initialFirstDelivery

  function handleCadenceChange(planId: string) {
    setSelectedPlanId(planId)
    setTouchedDate(false)
  }

  if (!selectedPlan) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <p className="text-sm text-[var(--muted)]">
          No hay planes disponibles para este producto.
        </p>
      </div>
    )
  }

  const priceWithTax = selectedPlan.priceSnapshot * (1 + selectedPlan.taxRateSnapshot)
  const monthlyEstimate = priceWithTax * deliveriesPerMonth(selectedPlan.cadence)
  const hasCadenceChoice = orderedPlans.length >= 2

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
          planId: selectedPlanId,
          shippingAddressId,
          firstDeliveryAt: effectiveFirstDelivery,
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
          href={`/productos/${product.slug}`}
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

      {/* Product summary card */}
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="flex items-start gap-4 p-4 sm:p-5">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover"
                sizes="80px"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-3xl">🧺</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[var(--foreground)]">{product.name}</p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">{vendor.displayName}</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--foreground)]">
              <ArrowPathIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {formatPrice(priceWithTax)}{' '}
                <span className="text-[var(--muted)]">/ {product.unit}</span>{' '}
                <span className="text-[var(--muted)]">· {cadenceLabel(selectedPlan.cadence)}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Coste mensual aproximado:{' '}
              <span className="font-medium text-[var(--foreground)]">
                {formatPrice(monthlyEstimate)}
              </span>{' '}
              ({deliveriesPerMonth(selectedPlan.cadence)} entregas/mes)
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Cadence selector (only if >= 2 plans available for this product) */}
        {hasCadenceChoice && (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <ArrowPathIcon className="h-4 w-4 text-[var(--foreground-soft)]" />
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                Elige tu frecuencia
              </h2>
            </div>
            <p className="mb-3 text-xs text-[var(--muted)]">
              Podrás cambiarla cancelando la suscripción y volviendo a suscribirte con otra frecuencia.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {orderedPlans.map(p => {
                const withTax = p.priceSnapshot * (1 + p.taxRateSnapshot)
                const monthly = withTax * deliveriesPerMonth(p.cadence)
                const isSelected = selectedPlanId === p.id
                return (
                  <label
                    key={p.id}
                    data-testid={`cadence-option-${p.cadence}`}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-[var(--border)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cadence"
                      value={p.id}
                      checked={isSelected}
                      onChange={() => handleCadenceChange(p.id)}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[var(--foreground)]">
                        {cadenceShort(p.cadence)}
                      </span>
                      {isSelected && (
                        <CheckCircleIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                    <div className="text-sm text-[var(--foreground)]">
                      {formatPrice(withTax)}
                      <span className="text-[var(--muted)]"> / {product.unit}</span>
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">
                      ≈ {formatPrice(monthly)} / mes
                    </div>
                  </label>
                )
              })}
            </div>
          </section>
        )}

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
              `/cuenta/suscripciones/nueva?productId=${product.id}`,
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
            value={effectiveFirstDelivery}
            min={minDate}
            max={maxDate}
            onChange={e => {
              setTouchedDate(true)
              setFirstDeliveryAt(e.target.value)
            }}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            required
          />
          <p className="mt-2 text-xs text-[var(--muted)]">
            A partir de esa fecha, cada nueva entrega llegará{' '}
            <span className="font-medium text-[var(--foreground)]">
              {cadenceLabel(selectedPlan.cadence)}
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
                Recibirás la caja {cadenceLabel(selectedPlan.cadence)} hasta que la canceles.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ForwardIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <span>
                Puedes <strong>saltar</strong> o <strong>reprogramar</strong> la próxima entrega
                antes del día de cierre semanal.
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

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href={`/productos/${product.slug}`}
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
