import { db } from '@/lib/db'
import type { MessageReceivedPayload } from '../../events'
import { sendToUser } from '../service'
import { messageReceivedTemplate } from '../templates'
import { resolveVendorFirstName } from './order-view'

export async function onMessageReceived(payload: MessageReceivedPayload): Promise<void> {
  const vendor = await db.vendor.findUnique({
    where: { id: payload.vendorId },
    select: { userId: true },
  })
  if (!vendor) return

  const vendorFirstName = await resolveVendorFirstName(payload.vendorId)

  await sendToUser(
    vendor.userId,
    'MESSAGE_RECEIVED',
    messageReceivedTemplate(payload, { vendorFirstName }),
    { payloadRef: `conversation:${payload.conversationId}` },
  )
}
