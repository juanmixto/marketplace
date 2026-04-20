import { db } from '@/lib/db'
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

export interface ListReviewQueueInput {
  kind?: ReviewQueueListKind | 'ALL'
  state?: IngestionReviewState | 'ALL'
  page?: number
  pageSize?: number
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

  const where = {
    kind: { in: kindFilter },
    ...(input.state && input.state !== 'ALL' ? { state: input.state } : {}),
  }

  const [items, total] = await Promise.all([
    db.ingestionReviewQueueItem.findMany({
      where,
      orderBy: [
        { state: 'asc' },
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.ingestionReviewQueueItem.count({ where }),
  ])

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
