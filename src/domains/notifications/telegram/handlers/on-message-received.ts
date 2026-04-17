import { db } from '@/lib/db'
import type { MessageReceivedPayload } from '../../events'
import { sendToUser } from '../service'
import { messageReceivedTemplate } from '../templates'

export async function onMessageReceived(payload: MessageReceivedPayload): Promise<void> {
  const vendor = await db.vendor.findUnique({
    where: { id: payload.vendorId },
    select: { userId: true },
  })
  if (!vendor) return

  await sendToUser(vendor.userId, 'MESSAGE_RECEIVED', messageReceivedTemplate(payload), {
    payloadRef: `conversation:${payload.conversationId}`,
  })
}
