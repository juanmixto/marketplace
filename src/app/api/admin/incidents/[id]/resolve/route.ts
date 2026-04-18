import { getActionSession } from '@/lib/action-session'
import { isAdminRole } from '@/lib/roles'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { IncidentResolution } from '@/generated/prisma/enums'
import { refundPaymentIntent } from '@/domains/payments/provider'
import { logger } from '@/lib/logger'

const schema = z.object({
  resolution:   z.nativeEnum(IncidentResolution),
  internalNote: z.string().max(2000).optional(),
  refundAmount: z.coerce.number().min(0).max(1_000_000).optional(),
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

  const { id } = await params

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
      if (refundAmount > Number(payment.amount)) {
        return NextResponse.json(
          { message: 'El importe del reembolso supera el pago original' },
          { status: 400 },
        )
      }
      if (!payment.providerRef) {
        return NextResponse.json(
          { message: 'El pago no tiene providerRef — imposible reembolsar' },
          { status: 400 },
        )
      }
    }

    // Fire the provider refund BEFORE we mark the Incident RESOLVED
    // so a Stripe failure leaves the incident in its original state
    // and the admin sees a clear error. If this throws, the catch
    // below re-raises — no partial success.
    let providerRefundRef: string | null = null
    if (payment && refundAmount && refundAmount > 0 && fundedBy) {
      const refundResult = await refundPaymentIntent(
        payment.providerRef!,
        Math.round(refundAmount * 100),
        {
          incidentId: id,
          orderId: incident.order.id,
          orderNumber: incident.order.orderNumber,
          fundedBy,
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
        await tx.refund.create({
          data: {
            paymentId: payment.id,
            amount: refundAmount,
            reason: `${incident.type} · ${resolution}`,
            fundedBy,
            providerRef: providerRefundRef,
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
