/**
 * One-shot backfill: populate `topicId` on messages ingested before
 * the column existed by re-parsing the `rawJson` Telethon payload.
 *
 * The payload shape mirrors what the sidecar emits today:
 *   raw.reply_to.forum_topic === true  → message belongs to a topic
 *   raw.reply_to.reply_to_top_id       → topic id when nested
 *   raw.reply_to.reply_to_msg_id       → topic id when this is the
 *                                         first reply (= the topic's
 *                                         creating message itself)
 *
 * `topicTitle` is left null on backfill — the sidecar only learns
 * titles from a live /topics call, and we don't want this script to
 * hit Telegram. Titles will be filled in on the next sync run for
 * each chat.
 *
 * Idempotent: skips rows whose topicId is already set.
 *
 * Usage:
 *   npx tsx scripts/ingestion-backfill-message-topics.ts [--chat <id>] [--dry]
 */
import { db } from '@/lib/db'

interface Args {
  chatId: string | null
  dryRun: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let chatId: string | null = null
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--chat' && argv[i + 1]) {
      chatId = argv[++i]!
    } else if (a === '--dry' || a === '--dry-run') {
      dryRun = true
    }
  }
  return { chatId, dryRun }
}

function topicIdFromRaw(raw: unknown): bigint | null {
  if (!raw || typeof raw !== 'object') return null
  const replyTo = (raw as Record<string, unknown>).reply_to
  if (!replyTo || typeof replyTo !== 'object') return null
  const r = replyTo as Record<string, unknown>
  // We accept two shapes:
  //   1. Real Telegram forum:   forum_topic = true, reply_to_top_id set.
  //   2. Pinned-message style:  forum_topic = false, but reply_to_top_id
  //      is present — admins partition the chat by replying to a pinned
  //      header message ("MIEL FRUTOS SECOS", etc.). Plenty of large
  //      community supergroups still run this way. We treat the top id
  //      as the topic id in both cases; "forum_topic" is informational.
  const top = r.reply_to_top_id
  if (top != null && (typeof top === 'number' || typeof top === 'string')) {
    try {
      return BigInt(top)
    } catch {
      // fall through
    }
  }
  // No top id → if there's a plain reply_to_msg_id we cannot tell if it
  // points at a topic header or a peer's previous comment. Skip rather
  // than create a noisy synthetic topic per replied-to message.
  return null
}

async function main() {
  const args = parseArgs()
  console.log('[backfill] chat=%s dry=%s', args.chatId ?? '(all)', args.dryRun)

  const where: { topicId: null; chatId?: string } = { topicId: null }
  if (args.chatId) where.chatId = args.chatId

  const total = await db.telegramIngestionMessage.count({ where })
  console.log(`[backfill] candidates: ${total}`)

  const pageSize = 500
  let cursor: string | null = null
  let scanned = 0
  let updated = 0
  while (scanned < total) {
    const batch: Array<{ id: string; rawJson: unknown }> =
      await db.telegramIngestionMessage.findMany({
        where,
        select: { id: true, rawJson: true },
        orderBy: { id: 'asc' },
        take: pageSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
    if (batch.length === 0) break
    cursor = batch[batch.length - 1]!.id

    const updates: Array<{ id: string; topicId: bigint }> = []
    for (const row of batch) {
      const topicId = topicIdFromRaw(row.rawJson)
      if (topicId !== null) updates.push({ id: row.id, topicId })
    }
    scanned += batch.length

    if (updates.length === 0) {
      console.log(`[backfill] scanned=${scanned} no topics in batch`)
      continue
    }

    if (args.dryRun) {
      console.log(`[backfill] would update ${updates.length} rows in this batch`)
      updated += updates.length
    } else {
      // One UPDATE per chunk; 500 is small enough to keep the txn quick.
      await db.$transaction(
        updates.map((u) =>
          db.telegramIngestionMessage.update({
            where: { id: u.id },
            data: { topicId: u.topicId },
          }),
        ),
      )
      updated += updates.length
      console.log(`[backfill] scanned=${scanned} updated=${updated}`)
    }
  }
  console.log(`[backfill] done. scanned=${scanned} updated=${updated}`)
  await db.$disconnect()
}

main().catch((err) => {
  console.error('[backfill] failed:', err)
  process.exit(1)
})
