import type { MessageReceivedPayload } from '../../events'
import { sendWebPushToUser } from '../service'
import { messageReceivedPush } from '../templates'
import { resolveVendorFirstName, resolveVendorUserId } from './shared'

export async function onMessageReceived(payload: MessageReceivedPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const vendorFirstName = await resolveVendorFirstName(payload.vendorId)
  await sendWebPushToUser(
    userId,
    'MESSAGE_RECEIVED',
    messageReceivedPush(payload, { vendorFirstName }),
    { payloadRef: `conversation:${payload.conversationId}` },
  )
}
