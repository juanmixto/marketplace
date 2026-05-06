import { getActionSession } from '@/lib/action-session'
import { isFinanceAdminRole } from '@/lib/roles'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { IncidentResolution } from '@/generated/prisma/enums'
import { refundPaymentIntent } from '@/domains/payments/provider'
import { assertOrderTransition, canTransitionOrder } from '@/domains/orders/state-machine'
import { recordOrderEvent } from '@/domains/orders'
import { logger } from '@/lib/logger'
import { AlreadyProcessedError, withIdempotency } from '@/lib/idempotency'
import { createAuditLog, getAuditRequestIp } from '@/lib/audit'
import { zCuid } from '@/lib/validation/primitives'
import {
  enforceAdminMutationRateLimit,
  AdminMutationRateLimitError,
} from '@/domains/admin/rate-limit'

// `z.coerce.number()` happily coerces "abc" to NaN; the downstream guards
// `refundAmount > 0` and `refundAmount > Number(payment.amount)` are then
// both false (NaN compares false either way), but the trailing
// `incident.update({ data: { refundAmount } })` would persist NaN. The
// preprocess+`.finite()` pair is the only spelling that rejects it cleanly.
const schema = z.object({
  resolution: z.nativeEnum(IncidentResolution),
  internalNote: z.string().trim().max(2000).optional(),
  refundAmount: z.preprocess(
    v => (typeof v === 'string' && v.trim() !== '' ? Number.parseFloat(v) : v),
    z.number().finite().min(0).max(1_000_000),
  ).optional(),
  fundedBy: z.enum(['PLATFORM', 'VENDOR']).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

class IncidentDomainError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Resolve an incident, optionally issuing a Stripe refund.
 *
 * Authz (#1141): hard-gated to `isFinanceAdminRole` (ADMIN_FINANCE,
 * ADMIN_OPS, SUPERADMIN). Catalogue and support admins must NOT touch
 * this surface — closing an incident is always a financial decision
 * and the legacy `isAdminRole` check let any admin issue refunds up
 * to 1,000,000 €. Doc: `docs/authz-audit.md` § "Role precision".
 *
 * Audit (#1141): refunds and resolutions go through `createAuditLog`
 * inside the same transaction as the DB writes. The previous code
 * only emitted `logger.info`, leaving the most sensitive admin
 * operation outside the immutable audit trail.
 *
 * Idempotency (#1152): the route requires an `Idempotency-Key` header
 * (UUID issued client-side). A double-submit on a flaky network
 * cannot fire a second Stripe refund nor produce a second AuditLog
 * row — `withIdempotency` rejects the replay with 409.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const session = await getActionSession()
  if (!session || !isFinanceAdminRole(session.user.role)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 403 })
  }

  // #1352: refund operations are direct money movement — keep the
  // bucket strict (5/min/admin). Catches the runaway-loop scenario
  // a stolen admin cookie would use to drain the platform.
  try {
    await enforceAdminMutationRateLimit({
      scope: 'incident-resolve',
      actorId: session.user.id,
      limit: 5,
      windowSeconds: 60,
    })
  } catch (err) {
    if (err instanceof AdminMutationRateLimitError) {
      return NextResponse.json(
        { message: err.message },
        {
          status: 429,
          headers: { 'Retry-After': String(err.retryAfterSeconds) },
        },
      )
    }
    throw err
  }

  const idempotencyKey = request.headers.get('idempotency-key')
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 80) {
    return NextResponse.json(
      { message: 'Idempotency-Key header requerido' },
      { status: 400 },
    )
  }

  const idCheck = zCuid.safeParse((await params).id)
  if (!idCheck.success) {
    return NextResponse.json({ message: 'Identificador inválido' }, { status: 400 })
  }
  const id = idCheck.data

  try {
    const { resolution, internalNote, refundAmount, fundedBy } = schema.parse(await request.json())

    if (refundAmount !== undefined && refundAmount > 0 && !fundedBy) {
      return NextResponse.json(
        { message: 'fundedBy es obligatorio cuando refundAmount > 0' },
        { status: 400 },
      )
    }

    const result = await withIdempotency(
      'incident.resolve',
      idempotencyKey,
      session.user.id,
      () => doResolve({
        id,
        resolution,
        internalNote,
        refundAmount,
        fundedBy,
        session,
      }),
    )
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AlreadyProcessedError) {
      return NextResponse.json(
        { message: 'Esta resolución ya fue procesada' },
        { status: 409 },
      )
    }
    if (err instanceof IncidentDomainError) {
      return NextResponse.json({ message: err.message }, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 })
    }
    logger.error('incident.resolve.failed', {
      incidentId: id,
      error: err,
    })
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}

interface ResolveArgs {
  id: string
  resolution: IncidentResolution
  internalNote?: string
  refundAmount?: number
  fundedBy?: 'PLATFORM' | 'VENDOR'
  session: { user: { id: string; role: string } }
}

async function doResolve({
  id,
  resolution,
  internalNote,
  refundAmount,
  fundedBy,
  session,
}: ResolveArgs) {
  const incident = await db.incident.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      type: true,
      resolution: true,
      internalNote: true,
      refundAmount: true,
      fundedBy: true,
      resolvedAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              amount: true,
              providerRef: true,
            },
          },
        },
      },
    },
  })
  if (!incident) {
    throw new IncidentDomainError('Incidencia no encontrada', 404)
  }
  if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') {
    throw new IncidentDomainError('La incidencia ya está cerrada', 400)
  }

  // Resolve the target Payment row if a refund is requested. We
  // refund against the most recent SUCCEEDED Payment on the Order;
  // multi-payment orders would need a richer UX but that's out of
  // scope here (#269 is the MVP).
  let payment: { id: string; amount: unknown; providerRef: string | null } | null = null
  if (refundAmount && refundAmount > 0) {
    payment = incident.order.payments[0] ?? null
    if (!payment) {
      throw new IncidentDomainError('No hay pago confirmado en este pedido', 400)
    }
    if (!payment.providerRef) {
      throw new IncidentDomainError(
        'El pago no tiene providerRef — imposible reembolsar',
        400,
      )
    }
    // #1163 H-7: cap = `payment.amount − Σ already refunded`, not the
    // gross. Two partial refunds across separate incidents would
    // otherwise both pass the old `> payment.amount` check (e.g. 60€
    // + 60€ on a 100€ pago); Stripe rejects the second with a generic
    // 500. Aggregate read here for the user-facing 400; the
    // authoritative re-check happens inside the tx below to close the
    // TOCTOU window.
    const refundedSoFar = await db.refund.aggregate({
      where: { paymentId: payment.id },
      _sum: { amount: true },
    })
    const alreadyRefunded = Number(refundedSoFar._sum.amount ?? 0)
    const remaining = Number(payment.amount) - alreadyRefunded
    if (refundAmount > remaining) {
      throw new IncidentDomainError(
        `Solo quedan ${remaining.toFixed(2)}€ reembolsables en este pedido (ya se reembolsaron ${alreadyRefunded.toFixed(2)}€).`,
        400,
      )
    }
  }

  // Fire the provider refund BEFORE we mark the Incident RESOLVED
  // so a Stripe failure leaves the incident in its original state
  // and the admin sees a clear error. If this throws, the catch
  // below re-raises — no partial success.
  //
  // #1153 H-3: pass an idempotency key derived from the incident id so
  // a retry after a network blip (admin re-clicks "Resolver" because
  // the response was lost in transit) reuses the existing Stripe
  // refund instead of issuing a second one. The key is stable per
  // incident, so even concurrent double-submits collapse on Stripe's
  // side regardless of our local race.
  //
  // #1148 H-1: `fundedBy` is propagated so destination charges issue
  // a `reverse_transfer: true` refund and only refund the application
  // fee when the platform owns the cost.
  let providerRefundRef: string | null = null
  if (payment && refundAmount && refundAmount > 0 && fundedBy) {
    const refundResult = await refundPaymentIntent(
      payment.providerRef!,
      Math.round(refundAmount * 100),
      {
        fundedBy,
        idempotencyKey: `refund_${id}`,
        metadata: {
          incidentId: id,
          orderId: incident.order.id,
          orderNumber: incident.order.orderNumber,
          fundedBy,
        },
      },
    )
    providerRefundRef = refundResult.id
    logger.info('incident.refund.issued', {
      incidentId: id,
      orderId: incident.order.id,
      providerRefundRef,
      amountCents: Math.round(refundAmount * 100),
      fundedBy,
    })
  }

  const ip = await getAuditRequestIp()
  const before = {
    id: incident.id,
    status: incident.status,
    resolution: incident.resolution,
    internalNote: incident.internalNote,
    refundAmount: incident.refundAmount === null ? null : Number(incident.refundAmount),
    fundedBy: incident.fundedBy,
  }

  return db.$transaction(async tx => {
    const updated = await tx.incident.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolution,
        internalNote: internalNote ?? null,
        resolvedAt: new Date(),
        ...(refundAmount !== undefined && { refundAmount }),
        ...(fundedBy && { fundedBy }),
      },
      select: {
        id: true,
        status: true,
        resolution: true,
        resolvedAt: true,
        internalNote: true,
        refundAmount: true,
        fundedBy: true,
      },
    })

    let refundId: string | null = null
    if (payment && refundAmount && refundAmount > 0 && fundedBy) {
      const totalSoFar = await tx.refund.aggregate({
        where: { paymentId: payment.id },
        _sum: { amount: true },
      })
      const alreadyRefunded = Number(totalSoFar._sum.amount ?? 0)
      const totalRefunded = alreadyRefunded + refundAmount
      if (totalRefunded > Number(payment.amount)) {
        const remaining = Number(payment.amount) - alreadyRefunded
        throw new IncidentDomainError(
          `Solo quedan ${remaining.toFixed(2)}€ reembolsables en este pedido (ya se reembolsaron ${alreadyRefunded.toFixed(2)}€).`,
          400,
        )
      }

      const refund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          amount: refundAmount,
          reason: `${incident.type} · ${resolution}`,
          fundedBy,
          providerRef: providerRefundRef,
        },
        select: { id: true },
      })
      refundId = refund.id

      // #1149 H-2: transition Payment + Order to (PARTIALLY_)REFUNDED
      // in the SAME transaction as the Refund row. Without this, the
      // webhook guard `shouldApplyPaymentSucceeded` (which checks
      // `orderPaymentStatus IN (REFUNDED, PARTIALLY_REFUNDED)`) is
      // unreachable, and a late `payment_intent.succeeded` would
      // resurrect the just-refunded order.
      const isFullyRefunded = totalRefunded >= Number(payment.amount)
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: isFullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      })
      const promoteToRefunded =
        isFullyRefunded && canTransitionOrder(incident.order.status, 'REFUNDED')
      if (promoteToRefunded) {
        assertOrderTransition(incident.order.status, 'REFUNDED')
      }
      await tx.order.update({
        where: { id: incident.order.id },
        data: {
          paymentStatus: isFullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          ...(promoteToRefunded ? { status: 'REFUNDED' as const } : {}),
        },
      })
      // #1356 — admin-mutating event MUST carry an actor; previously
      // refunds issued from the incident-resolve flow had `actorId =
      // null`, leaving "who refunded €X?" unanswerable in audit.
      await recordOrderEvent({
        client: tx,
        orderId: incident.order.id,
        type: 'REFUND_ISSUED',
        actorId: session.user.id,
        payload: {
          providerRef: payment.providerRef,
          providerRefundRef,
          amount: refundAmount,
          fundedBy,
          incidentId: id,
          isFullRefund: isFullyRefunded,
          recordedAt: new Date().toISOString(),
        },
      })
    }

    await createAuditLog(
      {
        action: refundId ? 'INCIDENT_REFUND_ISSUED' : 'INCIDENT_RESOLVED',
        entityType: 'Incident',
        entityId: id,
        before,
        after: {
          id: updated.id,
          status: updated.status,
          resolution: updated.resolution,
          internalNote: updated.internalNote,
          refundAmount: updated.refundAmount === null ? null : Number(updated.refundAmount),
          fundedBy: updated.fundedBy,
          refundId,
          providerRefundRef,
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
      tx,
    )

    return updated
  })
}
