import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  IngestionFeatureUnavailableError,
  requireIngestionAdmin,
} from '@/domains/ingestion/authz'
import { listChatIngestionStats } from '@/domains/ingestion/telegram/queries'

export const dynamic = 'force-dynamic'

/**
 * Live per-chat ingestion stats. The admin telegram page polls this
 * every couple of seconds while a sync or reprocess is in flight, so
 * operators can watch the pending column drop without manually
 * refreshing. Same numbers as `listChatIngestionStats` from the
 * server-rendered page; serializing dates to ISO so the client can
 * format them consistently.
 */
export async function GET() {
  try {
    await requireIngestionAdmin()
  } catch (err) {
    if (err instanceof IngestionFeatureUnavailableError) {
      return NextResponse.json({ message: 'Not available' }, { status: 404 })
    }
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const chats = await db.telegramIngestionChat.findMany({
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })
  const stats = await listChatIngestionStats(chats.map((c) => c.id))
  const payload = chats.map((c) => {
    const s = stats.get(c.id)
    return {
      chatId: c.id,
      rawMessages: s?.rawMessages ?? 0,
      processed: s?.processed ?? 0,
      pending: s?.pending ?? 0,
      drafts: s?.drafts ?? 0,
      lastSync: s?.lastSync
        ? {
            status: s.lastSync.status,
            startedAt: s.lastSync.startedAt.toISOString(),
            finishedAt: s.lastSync.finishedAt?.toISOString() ?? null,
          }
        : null,
    }
  })
  return NextResponse.json({ chats: payload, generatedAt: new Date().toISOString() })
}
