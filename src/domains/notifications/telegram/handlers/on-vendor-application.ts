import { db } from '@/lib/db'
import type {
  VendorApplicationApprovedPayload,
  VendorApplicationRejectedPayload,
} from '../../events'
import { sendToUser } from '../service'
import {
  vendorApplicationApprovedTemplate,
  vendorApplicationRejectedTemplate,
} from '../templates'

async function resolveFirstName(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { firstName: true },
  })
  return user?.firstName ?? null
}

export async function onVendorApplicationApproved(
  payload: VendorApplicationApprovedPayload,
): Promise<void> {
  const firstName = await resolveFirstName(payload.userId)
  await sendToUser(
    payload.userId,
    'BUYER_VENDOR_APPLICATION_APPROVED',
    vendorApplicationApprovedTemplate(payload, { firstName: firstName ?? undefined }),
    { payloadRef: `vendor:${payload.vendorId}` },
  )
}

export async function onVendorApplicationRejected(
  payload: VendorApplicationRejectedPayload,
): Promise<void> {
  const firstName = await resolveFirstName(payload.userId)
  await sendToUser(
    payload.userId,
    'BUYER_VENDOR_APPLICATION_REJECTED',
    vendorApplicationRejectedTemplate(payload, { firstName: firstName ?? undefined }),
    { payloadRef: `vendor:${payload.vendorId}` },
  )
}
