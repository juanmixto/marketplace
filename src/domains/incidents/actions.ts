'use server'

/**
 * Buyer-side incident (dispute) server actions (#29).
 *
 * The admin side of the dispute system already exists under
 * src/app/api/admin/incidents/** and src/app/(admin)/admin/incidencias.
 * This module adds the buyer-facing half: opening an incident from a
 * delivered/shipped order, posting messages on it, and listing the
 * authenticated buyer's own incidents.
 *
 * The buyer pages that consume these actions are intentionally a
 * follow-up PR — the server primitives need to land first so the UI work
 * can be reviewed and tested in isolation.
 *
 * Auth model (mirrors the rest of src/domains/<domain>/actions.ts):
 *   - openIncident / addIncidentMessage / getMyIncidents
 *       require an authenticated session; resource ownership is
 *       enforced per call (an incident's customerId must match the
 *       caller's user id).
 *   - Admin-only operations (resolve, internal notes, etc.) live in
 *       admin actions / API routes; this file is buyer-only.
 */

import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { redirect } from 'next/navigation'
import { isAdminRole } from '@/lib/roles'
import { IncidentStatus, IncidentType } from '@/generated/prisma/enums'

// 72h SLA on first response, per the issue.
export const INCIDENT_SLA_HOURS = 72

export class IncidentAuthError extends Error {
  constructor(message = 'No autorizado') {
    super(message)
    this.name = 'IncidentAuthError'
  }
}

export class IncidentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IncidentValidationError'
  }
}

const openIncidentSchema = z.object({
  orderId: z.string().min(1),
  type: z.nativeEnum(IncidentType),
  description: z.string().min(10).max(5000),
})

const addMessageSchema = z.object({
  incidentId: z.string().min(1),
  body: z.string().min(1).max(5000),
})

export type OpenIncidentInput = z.infer<typeof openIncidentSchema>
export type AddIncidentMessageInput = z.infer<typeof addMessageSchema>

/**
 * Buyer opens a new incident on one of their orders.
 *
 * Validation:
 *   - the order must exist and belong to the caller
 *   - the order's status must be DELIVERED, SHIPPED or PARTIALLY_SHIPPED
 *     (anything earlier and the buyer can still cancel; anything later
 *     means the dispute window is closed)
 *   - description must be substantive (10..5000 chars)
 *
 * The incident starts in OPEN status with slaDeadline = now + 72h.
 */
export async function openIncident(
  input: OpenIncidentInput
): Promise<{ incidentId: string }> {
  const session = await getActionSession()
  if (!session) redirect('/login')

  const parsed = openIncidentSchema.parse(input)

  const order = await db.order.findUnique({
    where: { id: parsed.orderId },
    select: { id: true, customerId: true, status: true },
  })

  if (!order || order.customerId !== session.user.id) {
    // Not exposing whether the order exists prevents enumeration of
    // other customers' order ids.
    throw new IncidentAuthError('Pedido no encontrado')
  }

  const eligibleStatuses: Array<typeof order.status> = [
    'DELIVERED',
    'SHIPPED',
    'PARTIALLY_SHIPPED',
  ]
  if (!eligibleStatuses.includes(order.status)) {
    throw new IncidentValidationError(
      'Solo puedes abrir una incidencia sobre pedidos enviados o entregados'
    )
  }

  const slaDeadline = new Date(Date.now() + INCIDENT_SLA_HOURS * 60 * 60 * 1000)

  const incident = await db.incident.create({
    data: {
      orderId: order.id,
      customerId: session.user.id,
      type: parsed.type,
      description: parsed.description,
      status: IncidentStatus.OPEN,
      slaDeadline,
    },
    select: { id: true },
  })

  return { incidentId: incident.id }
}

/**
 * Add a message to an existing incident thread.
 *
 * The buyer can add messages to their own incidents. Admins can add
 * messages to any incident (the existing admin route already handles
 * that path; this function lives here so the buyer pages don't need to
 * call into admin code, and so a future "vendor messaging" extension
 * has a single chokepoint).
 *
 * `authorRole` is inferred from the session — never trusted from the
 * client.
 */
export async function addIncidentMessage(
  input: AddIncidentMessageInput
): Promise<{ messageId: string }> {
  const session = await getActionSession()
  if (!session) redirect('/login')

  const parsed = addMessageSchema.parse(input)

  const incident = await db.incident.findUnique({
    where: { id: parsed.incidentId },
    select: { id: true, customerId: true, status: true },
  })

  if (!incident) {
    throw new IncidentAuthError('Incidencia no encontrada')
  }

  const isOwner = incident.customerId === session.user.id
  const isAdmin = isAdminRole(session.user.role)
  if (!isOwner && !isAdmin) {
    throw new IncidentAuthError('Incidencia no encontrada')
  }

  const closedStatuses: Array<typeof incident.status> = ['RESOLVED', 'CLOSED']
  if (closedStatuses.includes(incident.status)) {
    throw new IncidentValidationError(
      'No puedes añadir mensajes a una incidencia cerrada'
    )
  }

  const message = await db.incidentMessage.create({
    data: {
      incidentId: incident.id,
      authorId: session.user.id,
      authorRole: session.user.role,
      body: parsed.body,
    },
    select: { id: true },
  })

  return { messageId: message.id }
}

/**
 * Returns the authenticated buyer's incidents, newest first, with the
 * order number / total joined for the listing UI. The thread itself is
 * loaded by a separate read so this stays cheap for /cuenta/incidencias.
 */
export async function getMyIncidents() {
  const session = await getActionSession()
  if (!session) redirect('/login')

  const incidents = await db.incident.findMany({
    where: { customerId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      status: true,
      slaDeadline: true,
      resolvedAt: true,
      createdAt: true,
      order: {
        select: { id: true, orderNumber: true, grandTotal: true, status: true },
      },
      _count: { select: { messages: true } },
    },
  })

  return incidents.map(incident => ({
    id: incident.id,
    type: incident.type,
    status: incident.status,
    slaDeadline: incident.slaDeadline,
    slaOverdue:
      incident.status !== 'RESOLVED' &&
      incident.status !== 'CLOSED' &&
      incident.slaDeadline.getTime() < Date.now(),
    resolvedAt: incident.resolvedAt,
    createdAt: incident.createdAt,
    order: {
      id: incident.order.id,
      orderNumber: incident.order.orderNumber,
      grandTotal: Number(incident.order.grandTotal),
      status: incident.order.status,
    },
    messageCount: incident._count.messages,
  }))
}

/**
 * Loads a single incident with its full message thread. The caller must
 * be the buyer who owns it OR an admin. Used by both the buyer detail
 * page and (eventually) the admin detail page.
 */
export async function getIncidentDetail(incidentId: string) {
  const session = await getActionSession()
  if (!session) redirect('/login')

  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: {
      order: {
        select: { id: true, orderNumber: true, grandTotal: true, status: true },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          authorRole: true,
          createdAt: true,
        },
      },
    },
  })

  if (!incident) {
    throw new IncidentAuthError('Incidencia no encontrada')
  }

  const isOwner = incident.customerId === session.user.id
  const isAdmin = isAdminRole(session.user.role)
  if (!isOwner && !isAdmin) {
    throw new IncidentAuthError('Incidencia no encontrada')
  }

  return incident
}
