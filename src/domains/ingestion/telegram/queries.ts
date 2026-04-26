import { db } from '@/lib/db'

/**
 * Per-chat ingestion stats for the admin overview page. Aggregates
 * the four numbers operators actually care about — raw, processed,
 * pending (raw with no extraction result yet), drafts produced —
 * plus the most recent sync run so the UI can show "last synced X
 * ago / status".
 *
 * Implemented as a single round-trip with `$queryRawUnsafe` + a few
 * subqueries instead of N+1 Prisma counts. At current volumes this
 * is plenty; revisit only if chats grow past tens of thousands.
 */

export interface ChatIngestionStats {
  chatId: string
  rawMessages: number
  processed: number
  pending: number
  drafts: number
  lastSync: { status: string; startedAt: Date; finishedAt: Date | null } | null
}

interface StatsRow {
  chatId: string
  rawMessages: number
  processed: number
  pending: number
  drafts: number
  lastSyncStatus: string | null
  lastSyncStartedAt: Date | null
  lastSyncFinishedAt: Date | null
}

export async function listChatIngestionStats(
  chatIds: string[],
): Promise<Map<string, ChatIngestionStats>> {
  if (chatIds.length === 0) return new Map()

  // Postgres doesn't accept an empty array literal in $1 cleanly with
  // Prisma's adapter; we pre-checked the length above so this is safe.
  const rows = await db.$queryRawUnsafe<StatsRow[]>(
    `
    SELECT
      c.id AS "chatId",
      COALESCE(raw.n, 0)::int AS "rawMessages",
      COALESCE(proc.n, 0)::int AS "processed",
      COALESCE(raw.n, 0)::int - COALESCE(proc.n, 0)::int AS "pending",
      COALESCE(drafts.n, 0)::int AS "drafts",
      ls.status::text AS "lastSyncStatus",
      ls."startedAt" AS "lastSyncStartedAt",
      ls."finishedAt" AS "lastSyncFinishedAt"
    FROM "TelegramIngestionChat" c
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS n FROM "TelegramIngestionMessage" m WHERE m."chatId" = c.id
    ) raw ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT e."messageId") AS n
      FROM "IngestionExtractionResult" e
      JOIN "TelegramIngestionMessage" m ON m.id = e."messageId"
      WHERE m."chatId" = c.id
    ) proc ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS n
      FROM "IngestionProductDraft" d
      JOIN "TelegramIngestionMessage" m ON m.id = d."sourceMessageId"
      WHERE m."chatId" = c.id
    ) drafts ON true
    LEFT JOIN LATERAL (
      SELECT status, "startedAt", "finishedAt"
      FROM "TelegramIngestionSyncRun"
      WHERE "chatId" = c.id
      ORDER BY "startedAt" DESC
      LIMIT 1
    ) ls ON true
    WHERE c.id = ANY($1::text[])
    `,
    chatIds,
  )

  const out = new Map<string, ChatIngestionStats>()
  for (const r of rows) {
    out.set(r.chatId, {
      chatId: r.chatId,
      rawMessages: r.rawMessages,
      processed: r.processed,
      pending: r.pending,
      drafts: r.drafts,
      lastSync:
        r.lastSyncStatus && r.lastSyncStartedAt
          ? {
              status: r.lastSyncStatus,
              startedAt: r.lastSyncStartedAt,
              finishedAt: r.lastSyncFinishedAt,
            }
          : null,
    })
  }
  return out
}
