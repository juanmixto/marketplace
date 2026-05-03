import { getActionSession } from '@/lib/action-session'
import { isAdminRole } from '@/lib/roles'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { IncidentResolution } from '@/generated/prisma/enums'
import { refundPaymentIntent } from '@/domains/payments/provider'
import { logger } from '@/lib/logger'
import { zCuid } from '@/lib/validation/primitives'

// `z.coerce.number()` happily coerces "abc" to NaN; the downstream guards
// `refundAmount > 0` and `refundAmount > Number(payment.amount)` are then
// both false (NaN compares false either way), but the trailing
// `incident.update({ data: { refundAmount } })` would persist NaN. The
// preprocess+`.finite()` pair is the only spelling that rejects it cleanly.
const schema = z.object({
  resolution:   z.nativeEnum(IncidentResolution),
  internalNote: z.string().trim().max(2000).optional(),
  refundAmount: z.preprocess(
    v => (typeof v === 'string' && v.trim() !== '' ? Number.parseFloat(v) : v),
    z.number().finite().min(0).max(1_000_000),
  ).optional(),
  fundedBy:     z.enum(['PLATFORM', 'VENDOR']).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getActionSession()
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 })
  }

  const idCheck = zCuid.safeParse((await params).id)
  if (!idCheck.success) {
    return NextResponse.json({ message: 'Identificador inválido' }, { status: 400 })
  }
  const id = idCheck.data

  try {
    const { resolution, internalNote, refundAmount, fundedBy } = schema.parse(await request.json())

    // Refund-specific validation. If the admin filled in a non-zero
    // amount, `fundedBy` becomes mandatory: downstream settlement and
    // commission reports need to know whose P&L takes the hit.
    if (refundAmount !== undefined && refundAmount > 0 && !fundedBy) {
      return NextResponse.json(
        { message: 'fundedBy es obligatorio cuando refundAmount > 0' },
        { status: 400 },
      )
    }

    const incident = await db.incident.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        type: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
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
      return NextResponse.json({ message: 'Incidencia no encontrada' }, { status: 404 })
    }
    if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') {
      return NextResponse.json({ message: 'La incidencia ya está cerrada' }, { status: 400 })
    }

    // Resolve the target Payment row if a refund is requested. We
    // refund against the most recent SUCCEEDED Payment on the Order;
    // multi-payment orders would need a richer UX but that's out of
    // scope here (#269 is the MVP).
    let payment: { id: string; amount: unknown; providerRef: string | null } | null = null
    if (refundAmount && refundAmount > 0) {
      payment = incident.order.payments[0] ?? null
      if (!payment) {
        return NextResponse.json(
          { message: 'No hay pago confirmado en este pedido' },
          { status: 400 },
        )
      }
      if (!payment.providerRef) {
        return NextResponse.json(
          { message: 'El pago no tiene providerRef — imposible reembolsar' },
          { status: 400 },
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
        return NextResponse.json(
          {
            message: `Solo quedan ${remaining.toFixed(2)}€ reembolsables en este pedido (ya se reembolsaron ${alreadyRefunded.toFixed(2)}€).`,
          },
          { status: 400 },
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

    const updated = await db.$transaction(async tx => {
      const incidentUpdate = await tx.incident.update({
        where: { id },
        data: {
          status:       'RESOLVED',
          resolution,
          internalNote: internalNote ?? null,
          resolvedAt:   new Date(),
          ...(refundAmount !== undefined && { refundAmount }),
          ...(fundedBy && { fundedBy }),
        },
        select: { id: true, status: true, resolution: true, resolvedAt: true },
      })

      if (payment && refundAmount && refundAmount > 0 && fundedBy) {
        // Authoritative cap re-check inside the transaction — closes any
        // TOCTOU window between the early validation and this commit.
        const totalSoFar = await tx.refund.aggregate({
          where: { paymentId: payment.id },
          _sum: { amount: true },
        })
        const alreadyRefunded = Number(totalSoFar._sum.amount ?? 0)
        const totalRefunded = alreadyRefunded + refundAmount
        if (totalRefunded > Number(payment.amount)) {
          throw new Error('refund cap exceeded inside transaction')
        }

        await tx.refund.create({
          data: {
            paymentId: payment.id,
            amount: refundAmount,
            reason: `${incident.type} · ${resolution}`,
            fundedBy,
            providerRef: providerRefundRef,
          },
        })

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
        await tx.order.update({
          where: { id: incident.order.id },
          data: {
            paymentStatus: isFullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
            ...(isFullyRefunded ? { status: 'REFUNDED' } : {}),
          },
        })
        await tx.orderEvent.create({
          data: {
            orderId: incident.order.id,
            type: 'REFUND_ISSUED',
            payload: {
              providerRef: payment.providerRef,
              providerRefundRef,
              amount: refundAmount,
              fundedBy,
              incidentId: id,
              isFullRefund: isFullyRefunded,
              recordedAt: new Date().toISOString(),
            },
          },
        })
      }

      return incidentUpdate
    })

    return NextResponse.json(updated)
  } catch (err) {
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
