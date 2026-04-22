'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PAYMENT_STATUS_LABELS } from '@/domains/admin/orders'
import { ORDER_STATUS_LABELS } from '@/lib/constants'

const ORDER_STATUS_OPTIONS = ['all', 'PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'] as const
const PAYMENT_STATUS_OPTIONS = ['all', 'PENDING', 'SUCCEEDED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const
const INCIDENT_OPTIONS = ['all', 'open'] as const

type OrderStatusFilter = (typeof ORDER_STATUS_OPTIONS)[number]
type PaymentStatusFilter = (typeof PAYMENT_STATUS_OPTIONS)[number]
type IncidentFilter = (typeof INCIDENT_OPTIONS)[number]

interface Props {
  q?: string
  status?: string
  payment?: string
  incidents?: string
}

const DEBOUNCE_MS = 300

export function AdminOrdersFilters({ q, status, payment, incidents }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const normalizedQuery = q ?? ''
  const normalizedStatus = normalizeOrderStatus(status)
  const normalizedPayment = normalizePaymentStatus(payment)
  const normalizedIncidents = normalizeIncidentFilter(incidents)
  const [query, setQuery] = useState(normalizedQuery)
  const [statusValue, setStatusValue] = useState<OrderStatusFilter>(normalizedStatus)
  const [paymentValue, setPaymentValue] = useState<PaymentStatusFilter>(normalizedPayment)
  const [incidentValue, setIncidentValue] = useState<IncidentFilter>(normalizedIncidents)

  useEffect(() => {
    setQuery(normalizedQuery)
    setStatusValue(normalizedStatus)
    setPaymentValue(normalizedPayment)
    setIncidentValue(normalizedIncidents)
  }, [normalizedIncidents, normalizedPayment, normalizedQuery, normalizedStatus])

  const href = useMemo(
    () =>
      buildOrderFiltersHref(
        {
          q: query || undefined,
          status: statusValue,
          payment: paymentValue,
          incidents: incidentValue,
        },
        1
      ),
    [incidentValue, paymentValue, query, statusValue]
  )

  useEffect(() => {
    if (
      query === normalizedQuery &&
      statusValue === normalizedStatus &&
      paymentValue === normalizedPayment &&
      incidentValue === normalizedIncidents
    ) {
      return
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(href, { scroll: false })
      })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [href, normalizedIncidents, normalizedPayment, normalizedQuery, normalizedStatus, paymentValue, query, router, startTransition, statusValue, incidentValue])

  const clearFilters = () => {
    setQuery('')
    setStatusValue('all')
    setPaymentValue('all')
    setIncidentValue('all')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto] lg:items-end">
        <Input
          name="q"
          label="Buscar"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="MP-2026, email, ciudad, producto o productor"
        />
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Estado del pedido</span>
          <select
            name="status"
            value={statusValue}
            onChange={e => setStatusValue(e.target.value as OrderStatusFilter)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {ORDER_STATUS_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option === 'all' ? 'Todos' : ORDER_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Estado del pago</span>
          <select
            name="payment"
            value={paymentValue}
            onChange={e => setPaymentValue(e.target.value as PaymentStatusFilter)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {PAYMENT_STATUS_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option === 'all' ? 'Todos' : PAYMENT_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Incidencias</span>
          <select
            name="incidents"
            value={incidentValue}
            onChange={e => setIncidentValue(e.target.value as IncidentFilter)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">Todas</option>
            <option value="open">Abiertas</option>
          </select>
        </label>
        <Button type="button" variant="secondary" size="md" onClick={clearFilters} disabled={isPending}>
          <ArrowPathIcon className="h-4 w-4" />
          Limpiar
        </Button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Se aplica automáticamente al escribir o cambiar filtros. La paginación y el detalle seleccionado se mantienen en la URL.
      </p>
    </div>
  )
}

function normalizeOrderStatus(value?: string): OrderStatusFilter {
  return ORDER_STATUS_OPTIONS.includes(value as OrderStatusFilter) ? (value as OrderStatusFilter) : 'all'
}

function normalizePaymentStatus(value?: string): PaymentStatusFilter {
  return PAYMENT_STATUS_OPTIONS.includes(value as PaymentStatusFilter) ? (value as PaymentStatusFilter) : 'all'
}

function normalizeIncidentFilter(value?: string): IncidentFilter {
  return INCIDENT_OPTIONS.includes(value as IncidentFilter) ? (value as IncidentFilter) : 'all'
}

function buildOrderFiltersHref(
  filters: { q?: string; status: string; payment: string; incidents: string },
  page = 1
) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.payment && filters.payment !== 'all') params.set('payment', filters.payment)
  if (filters.incidents && filters.incidents !== 'all') params.set('incidents', filters.incidents)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/admin/pedidos?${query}` : '/admin/pedidos'
}
