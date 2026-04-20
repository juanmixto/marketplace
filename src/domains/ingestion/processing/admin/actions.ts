'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuditRequestIp, mutateWithAudit } from '@/lib/audit'
import { safeRevalidatePath } from '@/lib/revalidate'
import { logger } from '@/lib/logger'
import { requireIngestionAdmin } from '@/domains/ingestion/authz'

/**
 * Phase 3 admin mutations for the ingestion review queue.
 *
 * Scope is deliberately narrow: these actions ONLY move state inside
 * the `Ingestion*` tables. No writes to `Product`, `Vendor`, or
 * `ProductImage` happen here — turning an approved draft into a real
 * product is a Phase 4 concern, so "approve" means "operator signed
 * off on the draft" and nothing more.
 *
 * Every mutation:
 *   1. Goes through `requireIngestionAdmin` (admin role + flag gate).
 *   2. Parses a Zod input.
 *   3. Writes exactly one `AuditLog` row in the same transaction as
 *      the state change.
 *   4. Revalidates the admin routes that display the affected item.
 */

const REVALIDATE_PATH = '/admin/ingestion'

const approveSchema = z.object({
  draftId: z.string().min(1),
})

const editFieldsSchema = z.object({
  productName: z.string().trim().max(120).nullable().optional(),
  categorySlug: z.string().trim().max(80).nullable().optional(),
  unit: z
    .enum(['KG', 'G', 'L', 'ML', 'UNIT'])
    .nullable()
    .optional(),
  weightGrams: z.number().int().positive().max(1_000_000).nullable().optional(),
  priceCents: z.number().int().nonnegative().max(10_000_000).nullable().optional(),
  currencyCode: z.string().length(3).nullable().optional(),
  availability: z
    .enum(['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'])
    .nullable()
    .optional(),
})

const editSchema = z.object({
  draftId: z.string().min(1),
  patch: editFieldsSchema,
})

const discardDraftSchema = z.object({
  draftId: z.string().min(1),
})

const unextractableActionSchema = z.object({
  extractionId: z.string().min(1),
})

function draftAuditSnapshot(draft: {
  id: string
  status: string
  productName: string | null
  categorySlug: string | null
  unit: string | null
  weightGrams: number | null
  priceCents: number | null
  currencyCode: string | null
  availability: string | null
}) {
  return {
    id: draft.id,
    status: draft.status,
    productName: draft.productName,
    categorySlug: draft.categorySlug,
    unit: draft.unit,
    weightGrams: draft.weightGrams,
    priceCents: draft.priceCents,
    currencyCode: draft.currencyCode,
    availability: draft.availability,
  }
}

/**
 * Operator marks a product draft as approved. The draft row flips to
 * `APPROVED` and the review queue item transitions `ENQUEUED →
 * AUTO_RESOLVED` with a reason tag so subsequent audits can tell
 * manual approvals apart from LOW-risk dedupe auto-merges.
 */
export async function approveProductDraft(input: z.infer<typeof approveSchema>) {
  const session = await requireIngestionAdmin()
  const { draftId } = approveSchema.parse(input)
  const ip = await getAuditRequestIp()

  const existing = await db.ingestionProductDraft.findUnique({ where: { id: draftId } })
  if (!existing) throw new Error('Draft not found')
  if (existing.status !== 'PENDING') {
    throw new Error(`Draft already resolved (status=${existing.status})`)
  }

  await mutateWithAudit(async (tx) => {
    const updated = await tx.ingestionProductDraft.update({
      where: { id: draftId },
      data: { status: 'APPROVED' },
    })
    await tx.ingestionReviewQueueItem.updateMany({
      where: { kind: 'PRODUCT_DRAFT', targetId: draftId, state: 'ENQUEUED' },
      data: {
        state: 'AUTO_RESOLVED',
        autoResolvedReason: 'adminApproved',
        autoResolvedAt: new Date(),
      },
    })
    return {
      result: updated,
      audit: {
        action: 'INGESTION_DRAFT_APPROVED',
        entityType: 'IngestionProductDraft',
        entityId: draftId,
        before: draftAuditSnapshot(existing),
        after: draftAuditSnapshot(updated),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  logger.info('ingestion.admin.draft_approved', { draftId, actorId: session.user.id })
  safeRevalidatePath(REVALIDATE_PATH)
}

/**
 * Partial update on a pending draft. Only the `editFieldsSchema`
 * whitelist is writeable — status / provenance / dedupe pointers stay
 * immutable here so the UI can never corrupt extractor output.
 */
export async function editProductDraft(input: z.infer<typeof editSchema>) {
  const session = await requireIngestionAdmin()
  const { draftId, patch } = editSchema.parse(input)
  const ip = await getAuditRequestIp()

  const existing = await db.ingestionProductDraft.findUnique({ where: { id: draftId } })
  if (!existing) throw new Error('Draft not found')
  if (existing.status !== 'PENDING') {
    throw new Error(`Cannot edit a resolved draft (status=${existing.status})`)
  }

  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) data[k] = v
  }
  if (Object.keys(data).length === 0) {
    throw new Error('Empty patch')
  }

  await mutateWithAudit(async (tx) => {
    const updated = await tx.ingestionProductDraft.update({
      where: { id: draftId },
      data,
    })
    return {
      result: updated,
      audit: {
        action: 'INGESTION_DRAFT_EDITED',
        entityType: 'IngestionProductDraft',
        entityId: draftId,
        before: draftAuditSnapshot(existing),
        after: draftAuditSnapshot(updated),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  logger.info('ingestion.admin.draft_edited', { draftId, actorId: session.user.id })
  safeRevalidatePath(REVALIDATE_PATH)
}

/**
 * Reject a pending product draft. Status → `REJECTED`, review queue
 * item → `AUTO_RESOLVED` with reason `adminDiscarded`.
 */
export async function discardProductDraft(input: z.infer<typeof discardDraftSchema>) {
  const session = await requireIngestionAdmin()
  const { draftId } = discardDraftSchema.parse(input)
  const ip = await getAuditRequestIp()

  const existing = await db.ingestionProductDraft.findUnique({ where: { id: draftId } })
  if (!existing) throw new Error('Draft not found')
  if (existing.status !== 'PENDING') {
    throw new Error(`Draft already resolved (status=${existing.status})`)
  }

  await mutateWithAudit(async (tx) => {
    const updated = await tx.ingestionProductDraft.update({
      where: { id: draftId },
      data: { status: 'REJECTED' },
    })
    await tx.ingestionReviewQueueItem.updateMany({
      where: { kind: 'PRODUCT_DRAFT', targetId: draftId, state: 'ENQUEUED' },
      data: {
        state: 'AUTO_RESOLVED',
        autoResolvedReason: 'adminDiscarded',
        autoResolvedAt: new Date(),
      },
    })
    return {
      result: updated,
      audit: {
        action: 'INGESTION_DRAFT_DISCARDED',
        entityType: 'IngestionProductDraft',
        entityId: draftId,
        before: draftAuditSnapshot(existing),
        after: draftAuditSnapshot(updated),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  logger.info('ingestion.admin.draft_discarded', { draftId, actorId: session.user.id })
  safeRevalidatePath(REVALIDATE_PATH)
}

/**
 * Discard a `PRODUCT_NO_PRICE` / UNEXTRACTABLE extraction. Resolves
 * the review item only — the extraction row itself stays so the audit
 * trail survives. No draft exists to flip.
 */
export async function discardUnextractable(
  input: z.infer<typeof unextractableActionSchema>,
) {
  const session = await requireIngestionAdmin()
  const { extractionId } = unextractableActionSchema.parse(input)
  const ip = await getAuditRequestIp()

  const item = await db.ingestionReviewQueueItem.findFirst({
    where: {
      kind: 'UNEXTRACTABLE_PRODUCT',
      targetId: extractionId,
      state: 'ENQUEUED',
    },
  })
  if (!item) throw new Error('Review item not found or already resolved')

  await mutateWithAudit(async (tx) => {
    const updated = await tx.ingestionReviewQueueItem.update({
      where: { id: item.id },
      data: {
        state: 'AUTO_RESOLVED',
        autoResolvedReason: 'adminDiscardedUnextractable',
        autoResolvedAt: new Date(),
      },
    })
    return {
      result: updated,
      audit: {
        action: 'INGESTION_UNEXTRACTABLE_DISCARDED',
        entityType: 'IngestionExtractionResult',
        entityId: extractionId,
        before: { state: 'ENQUEUED' },
        after: { state: 'AUTO_RESOLVED', reason: 'adminDiscardedUnextractable' },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  logger.info('ingestion.admin.unextractable_discarded', {
    extractionId,
    actorId: session.user.id,
  })
  safeRevalidatePath(REVALIDATE_PATH)
}

/**
 * Mark an UNEXTRACTABLE extraction as valid (operator considers the
 * producer real, we just couldn't parse structured fields). Resolves
 * the review item with reason `adminMarkedValid`; no draft is created
 * yet — that flow lands in Phase 4 when we actually start publishing.
 */
export async function markUnextractableValid(
  input: z.infer<typeof unextractableActionSchema>,
) {
  const session = await requireIngestionAdmin()
  const { extractionId } = unextractableActionSchema.parse(input)
  const ip = await getAuditRequestIp()

  const item = await db.ingestionReviewQueueItem.findFirst({
    where: {
      kind: 'UNEXTRACTABLE_PRODUCT',
      targetId: extractionId,
      state: 'ENQUEUED',
    },
  })
  if (!item) throw new Error('Review item not found or already resolved')

  await mutateWithAudit(async (tx) => {
    const updated = await tx.ingestionReviewQueueItem.update({
      where: { id: item.id },
      data: {
        state: 'AUTO_RESOLVED',
        autoResolvedReason: 'adminMarkedValid',
        autoResolvedAt: new Date(),
      },
    })
    return {
      result: updated,
      audit: {
        action: 'INGESTION_UNEXTRACTABLE_MARKED_VALID',
        entityType: 'IngestionExtractionResult',
        entityId: extractionId,
        before: { state: 'ENQUEUED' },
        after: { state: 'AUTO_RESOLVED', reason: 'adminMarkedValid' },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  logger.info('ingestion.admin.unextractable_marked_valid', {
    extractionId,
    actorId: session.user.id,
  })
  safeRevalidatePath(REVALIDATE_PATH)
}
