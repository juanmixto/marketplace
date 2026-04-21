import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import type {
  IngestionDraftKind,
  IngestionReviewState,
} from '@/generated/prisma/enums'

/**
 * Read-side helpers for the Phase 3 admin review UI.
 *
 * Returns de-normalised shapes (review item + its polymorphic target)
 * so the UI does not have to reach back into Prisma for each row. The
 * `targetId` column on `IngestionReviewQueueItem` is polymorphic by
 * design — it points at a `ProductDraft.id` for `PRODUCT_DRAFT` rows
 * and at an `ExtractionResult.id` for `UNEXTRACTABLE_PRODUCT` rows —
 * so hydration has to branch per kind. Doing it here keeps the
 * branching out of components.
 *
 * `AUTO_RESOLVED` items are included in the list by default so
 * operators can audit auto-merges; callers can filter to just
 * `ENQUEUED` via `state`.
 */

export const REVIEW_QUEUE_PAGE_SIZE = 50

export type ReviewQueueListKind =
  | Extract<IngestionDraftKind, 'PRODUCT_DRAFT' | 'UNEXTRACTABLE_PRODUCT'>

export type ReviewQueueSortKey =
  | 'fecha'
  | 'tipo'
  | 'confianza'
  | 'precio'
  | 'autor'
  | 'estado'

export type ReviewQueueSortDir = 'asc' | 'desc'

export interface ListReviewQueueInput {
  kind?: ReviewQueueListKind | 'ALL'
  state?: IngestionReviewState | 'ALL'
  page?: number
  pageSize?: number
  sort?: ReviewQueueSortKey
  dir?: ReviewQueueSortDir
}

/**
 * Column expressions for the raw ORDER BY. Only this map's keys are
 * accepted as sort keys, so using `Prisma.raw` against these strings
 * is safe (no caller-supplied SQL ever reaches the expression).
 */
const SORT_EXPR: Record<ReviewQueueSortKey, string> = {
  // `m."postedAt"` is the real time of the message, which is what a
  // human reviewer actually cares about. Fall back to q."createdAt"
  // for items where the join didn't resolve (shouldn't happen in
  // practice, but keeps the ordering total).
  fecha: 'COALESCE(m."postedAt", q."createdAt")',
  tipo: 'q."kind"',
  // Confidence lives on the product draft; unextractable items are
  // always NULL here and sort to the end regardless of direction.
  confianza: 'd."confidenceOverall"',
  precio: 'd."priceCents"',
  autor: 'm."tgAuthorId"',
  estado: 'q."state"',
}

export interface ReviewQueueListRowProduct {
  kind: 'PRODUCT_DRAFT'
  draft: {
    id: string
    productName: string | null
    priceCents: number | null
    currencyCode: string | null
    unit: string | null
    confidenceOverall: string
    confidenceBand: string
    status: string
  }
}

export interface ReviewQueueListRowUnextractable {
  kind: 'UNEXTRACTABLE_PRODUCT'
  extractionId: string
  classification: string | null
  confidenceOverall: string
  confidenceBand: string
}

export interface ReviewQueueListRow {
  itemId: string
  state: IngestionReviewState
  autoResolvedReason: string | null
  createdAt: Date
  messageText: string | null
  messagePostedAt: Date | null
  authorId: string | null
  target: ReviewQueueListRowProduct | ReviewQueueListRowUnextractable
}

export interface ReviewQueueListResult {
  rows: ReviewQueueListRow[]
  total: number
  page: number
  pageSize: number
}

function truncate(text: string | null, max = 240): string | null {
  if (!text) return text
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/**
 * Paginated listing of review items for the admin UI. Polymorphic
 * target hydration is done in two targeted `findMany` calls (one per
 * kind) rather than via Prisma relations, because `targetId` is not a
 * real FK — the column is polymorphic across draft and extraction ids.
 */
export async function listReviewQueue(
  input: ListReviewQueueInput = {},
): Promise<ReviewQueueListResult> {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, input.pageSize ?? REVIEW_QUEUE_PAGE_SIZE))
  const kindFilter: ReviewQueueListKind[] =
    input.kind && input.kind !== 'ALL'
      ? [input.kind]
      : ['PRODUCT_DRAFT', 'UNEXTRACTABLE_PRODUCT']

  const sortKey: ReviewQueueSortKey = input.sort ?? 'fecha'
  const dir: ReviewQueueSortDir = input.dir === 'asc' ? 'asc' : 'desc'
  const stateFilter = input.state && input.state !== 'ALL' ? input.state : null
  const orderExpr = SORT_EXPR[sortKey]
  // NULLS sort stable and predictable: on asc they go last, on desc
  // also last — reviewers want concrete data first either way.
  const orderBy = Prisma.raw(
    `${orderExpr} ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, q."createdAt" DESC`,
  )
  const skip = (page - 1) * pageSize

  // Raw id query — LEFT JOIN the polymorphic targets and the message
  // row, then ORDER BY whichever field the caller asked for. The
  // joins are 1:1 so there's no row-multiplication.
  const kindsSql = Prisma.sql`(${Prisma.join(kindFilter.map((k) => Prisma.sql`${k}::"IngestionDraftKind"`))})`
  const stateSql = stateFilter
    ? Prisma.sql` AND q."state" = ${stateFilter}::"IngestionReviewState"`
    : Prisma.empty

  const idRows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT q."id"
    FROM "IngestionReviewQueueItem" q
    LEFT JOIN "IngestionProductDraft" d
      ON q."kind" = 'PRODUCT_DRAFT'::"IngestionDraftKind" AND d."id" = q."targetId"
    LEFT JOIN "IngestionExtractionResult" e
      ON q."kind" = 'UNEXTRACTABLE_PRODUCT'::"IngestionDraftKind" AND e."id" = q."targetId"
    LEFT JOIN "TelegramIngestionMessage" m
      ON m."id" = COALESCE(d."sourceMessageId", e."messageId")
    WHERE q."kind" IN ${kindsSql}${stateSql}
    ORDER BY ${orderBy}
    LIMIT ${pageSize} OFFSET ${skip}
  `)
  const orderedIds = idRows.map((r) => r.id)

  const where = {
    kind: { in: kindFilter },
    ...(stateFilter ? { state: stateFilter } : {}),
  }

  const [rawItems, total] = await Promise.all([
    orderedIds.length
      ? db.ingestionReviewQueueItem.findMany({ where: { id: { in: orderedIds } } })
      : [],
    db.ingestionReviewQueueItem.count({ where }),
  ])

  // Restore the raw-SQL ordering: findMany does not preserve the
  // order of `in` arrays.
  const itemById = new Map(rawItems.map((i) => [i.id, i]))
  const items = orderedIds.flatMap((id) => {
    const hit = itemById.get(id)
    return hit ? [hit] : []
  })

  const draftIds: string[] = []
  const extractionIds: string[] = []
  for (const item of items) {
    if (item.kind === 'PRODUCT_DRAFT') draftIds.push(item.targetId)
    if (item.kind === 'UNEXTRACTABLE_PRODUCT') extractionIds.push(item.targetId)
  }

  const [drafts, extractions] = await Promise.all([
    draftIds.length
      ? db.ingestionProductDraft.findMany({
          where: { id: { in: draftIds } },
          include: {
            sourceMessage: {
              select: { text: true, postedAt: true, tgAuthorId: true },
            },
          },
        })
      : [],
    extractionIds.length
      ? db.ingestionExtractionResult.findMany({
          where: { id: { in: extractionIds } },
          include: {
            message: {
              select: { text: true, postedAt: true, tgAuthorId: true },
            },
          },
        })
      : [],
  ])

  const draftById = new Map(drafts.map((d) => [d.id, d]))
  const extractionById = new Map(extractions.map((e) => [e.id, e]))

  const rows: ReviewQueueListRow[] = []
  for (const item of items) {
    if (item.kind === 'PRODUCT_DRAFT') {
      const d = draftById.get(item.targetId)
      if (!d) continue
      rows.push({
        itemId: item.id,
        state: item.state,
        autoResolvedReason: item.autoResolvedReason,
        createdAt: item.createdAt,
        messageText: truncate(d.sourceMessage.text),
        messagePostedAt: d.sourceMessage.postedAt,
        authorId: d.sourceMessage.tgAuthorId?.toString() ?? null,
        target: {
          kind: 'PRODUCT_DRAFT',
          draft: {
            id: d.id,
            productName: d.productName,
            priceCents: d.priceCents,
            currencyCode: d.currencyCode,
            unit: d.unit,
            confidenceOverall: d.confidenceOverall.toString(),
            confidenceBand: d.confidenceBand,
            status: d.status,
          },
        },
      })
    } else if (item.kind === 'UNEXTRACTABLE_PRODUCT') {
      const e = extractionById.get(item.targetId)
      if (!e) continue
      rows.push({
        itemId: item.id,
        state: item.state,
        autoResolvedReason: item.autoResolvedReason,
        createdAt: item.createdAt,
        messageText: truncate(e.message.text),
        messagePostedAt: e.message.postedAt,
        authorId: e.message.tgAuthorId?.toString() ?? null,
        target: {
          kind: 'UNEXTRACTABLE_PRODUCT',
          extractionId: e.id,
          classification: e.classification,
          confidenceOverall: e.confidenceOverall.toString(),
          confidenceBand: e.confidenceBand,
        },
      })
    }
  }

  return { rows, total, page, pageSize }
}

export interface ReviewQueueDetailProduct {
  kind: 'PRODUCT_DRAFT'
  draft: {
    id: string
    status: string
    productName: string | null
    categorySlug: string | null
    unit: string | null
    weightGrams: number | null
    priceCents: number | null
    currencyCode: string | null
    availability: string | null
    confidenceOverall: string
    confidenceBand: string
    extractorVersion: string
    productOrdinal: number
    createdAt: Date
    updatedAt: Date
  }
  extraction: {
    id: string
    payload: unknown
    confidenceByField: unknown
    engine: string
    extractorVersion: string
    schemaVersion: number
    classification: string | null
    correlationId: string
  }
  vendorDraft: {
    id: string
    displayName: string
    externalId: string | null
  } | null
}

export interface ReviewQueueDetailUnextractable {
  kind: 'UNEXTRACTABLE_PRODUCT'
  extraction: {
    id: string
    payload: unknown
    classification: string | null
    confidenceOverall: string
    confidenceBand: string
    engine: string
    extractorVersion: string
    correlationId: string
    createdAt: Date
  }
  dedupeCandidates: Array<{
    id: string
    kind: string
    riskClass: string
    autoApplied: boolean
    createdAt: Date
    otherExtractionId: string
    otherMessageText: string | null
  }>
}

export interface ReviewQueueDetail {
  itemId: string
  state: IngestionReviewState
  autoResolvedReason: string | null
  createdAt: Date
  message: {
    id: string
    text: string | null
    postedAt: Date
    authorId: string | null
    chatId: string
  }
  target: ReviewQueueDetailProduct | ReviewQueueDetailUnextractable
}

/**
 * Fully-hydrated detail view for a single review item. Returns `null`
 * when the item no longer exists (admin landed on a stale URL after
 * retention sweep).
 */
export async function getReviewQueueItem(
  itemId: string,
): Promise<ReviewQueueDetail | null> {
  const item = await db.ingestionReviewQueueItem.findUnique({
    where: { id: itemId },
  })
  if (!item) return null

  if (item.kind === 'PRODUCT_DRAFT') {
    const draft = await db.ingestionProductDraft.findUnique({
      where: { id: item.targetId },
      include: {
        sourceMessage: {
          select: {
            id: true,
            text: true,
            postedAt: true,
            tgAuthorId: true,
            chatId: true,
          },
        },
        sourceExtraction: true,
        vendorDraft: { select: { id: true, displayName: true, externalId: true } },
      },
    })
    if (!draft) return null
    return {
      itemId: item.id,
      state: item.state,
      autoResolvedReason: item.autoResolvedReason,
      createdAt: item.createdAt,
      message: {
        id: draft.sourceMessage.id,
        text: draft.sourceMessage.text,
        postedAt: draft.sourceMessage.postedAt,
        authorId: draft.sourceMessage.tgAuthorId?.toString() ?? null,
        chatId: draft.sourceMessage.chatId,
      },
      target: {
        kind: 'PRODUCT_DRAFT',
        draft: {
          id: draft.id,
          status: draft.status,
          productName: draft.productName,
          categorySlug: draft.categorySlug,
          unit: draft.unit,
          weightGrams: draft.weightGrams,
          priceCents: draft.priceCents,
          currencyCode: draft.currencyCode,
          availability: draft.availability,
          confidenceOverall: draft.confidenceOverall.toString(),
          confidenceBand: draft.confidenceBand,
          extractorVersion: draft.extractorVersion,
          productOrdinal: draft.productOrdinal,
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        },
        extraction: {
          id: draft.sourceExtraction.id,
          payload: draft.sourceExtraction.payload,
          confidenceByField: draft.sourceExtraction.confidenceByField,
          engine: draft.sourceExtraction.engine,
          extractorVersion: draft.sourceExtraction.extractorVersion,
          schemaVersion: draft.sourceExtraction.schemaVersion,
          classification: draft.sourceExtraction.classification,
          correlationId: draft.sourceExtraction.correlationId,
        },
        vendorDraft: draft.vendorDraft
          ? {
              id: draft.vendorDraft.id,
              displayName: draft.vendorDraft.displayName,
              externalId: draft.vendorDraft.externalId,
            }
          : null,
      },
    }
  }

  if (item.kind === 'UNEXTRACTABLE_PRODUCT') {
    const extraction = await db.ingestionExtractionResult.findUnique({
      where: { id: item.targetId },
      include: {
        message: {
          select: {
            id: true,
            text: true,
            postedAt: true,
            tgAuthorId: true,
            chatId: true,
          },
        },
        unextractableLefts: {
          include: {
            rightExtraction: {
              include: { message: { select: { text: true } } },
            },
          },
        },
        unextractableRights: {
          include: {
            leftExtraction: {
              include: { message: { select: { text: true } } },
            },
          },
        },
      },
    })
    if (!extraction) return null

    const dedupeCandidates: ReviewQueueDetailUnextractable['dedupeCandidates'] = [
      ...extraction.unextractableLefts.map((c) => ({
        id: c.id,
        kind: c.kind,
        riskClass: c.riskClass,
        autoApplied: c.autoApplied,
        createdAt: c.createdAt,
        otherExtractionId: c.rightExtractionId,
        otherMessageText: truncate(c.rightExtraction.message.text),
      })),
      ...extraction.unextractableRights.map((c) => ({
        id: c.id,
        kind: c.kind,
        riskClass: c.riskClass,
        autoApplied: c.autoApplied,
        createdAt: c.createdAt,
        otherExtractionId: c.leftExtractionId,
        otherMessageText: truncate(c.leftExtraction.message.text),
      })),
    ]

    return {
      itemId: item.id,
      state: item.state,
      autoResolvedReason: item.autoResolvedReason,
      createdAt: item.createdAt,
      message: {
        id: extraction.message.id,
        text: extraction.message.text,
        postedAt: extraction.message.postedAt,
        authorId: extraction.message.tgAuthorId?.toString() ?? null,
        chatId: extraction.message.chatId,
      },
      target: {
        kind: 'UNEXTRACTABLE_PRODUCT',
        extraction: {
          id: extraction.id,
          payload: extraction.payload,
          classification: extraction.classification,
          confidenceOverall: extraction.confidenceOverall.toString(),
          confidenceBand: extraction.confidenceBand,
          engine: extraction.engine,
          extractorVersion: extraction.extractorVersion,
          correlationId: extraction.correlationId,
          createdAt: extraction.createdAt,
        },
        dedupeCandidates,
      },
    }
  }

  // VENDOR_DRAFT / DEDUPE_CANDIDATE are out of Phase 3 scope — callers
  // should never hit them through the UI.
  return null
}
