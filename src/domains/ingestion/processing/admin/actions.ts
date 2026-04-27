'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuditRequestIp, mutateWithAudit } from '@/lib/audit'
import { safeRevalidatePath } from '@/lib/revalidate'
import { logger } from '@/lib/logger'
import { slugify } from '@/lib/utils'
import { requireIngestionAdmin } from '@/domains/ingestion/authz'
import { isIngestionPublishEnabled } from '@/domains/ingestion/flags'
import { IngestionPublishValidationError } from './errors'

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

const publishSchema = z.object({
  draftId: z.string().min(1),
})

const UNIT_MAP: Record<string, string> = {
  KG: 'kg',
  G: 'g',
  L: 'l',
  ML: 'ml',
  UNIT: 'unit',
}

/**
 * Collapse whitespace, strip control chars, cap at 200 characters,
 * and trim. Keeps emojis — they're load-bearing brand signal in
 * Telegram producer posts. Returns empty string if nothing useful is
 * left; the caller raises a validation error in that case.
 */
function sanitiseProductName(raw: string | null | undefined): string {
  if (!raw) return ''
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 200)
}

function ghostUserEmail(tgAuthorId: string): string {
  return `tg-${tgAuthorId}@ingestion.ghost.local`
}

async function resolveUniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'producto'
  let candidate = root
  let suffix = 0
  while (await db.product.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1
    candidate = `${root}-${suffix}`
    if (suffix > 50) {
      candidate = `${root}-${Date.now()}`
      break
    }
  }
  return candidate
}

/**
 * Alphanumeric code without ambiguous glyphs (0/O, 1/I/L) so the
 * operator can dictate it over Telegram without the producer asking
 * "is that a zero or an o". 8 chars = 32^8 ≈ 1.1 × 10¹² permutations
 * which is plenty for the audit volumes we expect while keeping the
 * code short enough to type by hand.
 */
const CLAIM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CLAIM_CODE_LENGTH = 8
const CLAIM_CODE_TTL_MS = 365 * 24 * 60 * 60 * 1000

function generateClaimCode(): string {
  let out = ''
  const { randomInt } = globalThis.crypto
    ? { randomInt: (n: number) => {
        const buf = new Uint32Array(1)
        crypto.getRandomValues(buf)
        return buf[0]! % n
      } }
    : { randomInt: (n: number) => Math.floor(Math.random() * n) }
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) {
    out += CLAIM_CODE_ALPHABET[randomInt(CLAIM_CODE_ALPHABET.length)]
  }
  return out
}

async function issueUniqueClaimCode(): Promise<string> {
  // Retry on the ~0% chance of a collision against the UNIQUE index.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateClaimCode()
    const hit = await db.vendor.findUnique({ where: { claimCode: code }, select: { id: true } })
    if (!hit) return code
  }
  throw new Error('Failed to issue unique claim code after 5 attempts')
}

async function resolveUniqueVendorSlug(base: string): Promise<string> {
  const root = slugify(base) || 'productor'
  let candidate = root
  let suffix = 0
  while (await db.vendor.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1
    candidate = `${root}-${suffix}`
    if (suffix > 50) {
      candidate = `${root}-${Date.now()}`
      break
    }
  }
  return candidate
}

interface PublishResult {
  status: 'CREATED' | 'IDEMPOTENT'
  productId: string
  vendorId: string
  ghostUserId: string
}

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

const vendorLeadActionSchema = z.object({
  vendorDraftId: z.string().min(1),
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
 * Phase 4 — promote an ingested `IngestionProductDraft` into a real
 * `Product` row. "Aprobar y crear producto" is what this action
 * represents; there is no longer a simbolic "approve without
 * publishing" step.
 *
 * Identity model — producers observed in Telegram do not have a
 * platform `User`. To keep `Vendor.userId` non-nullable, we upsert a
 * *ghost* User/Vendor pair keyed deterministically by `tgAuthorId`:
 *
 *   User.email   = `tg-<authorId>@ingestion.ghost.local`
 *   User fields  = { isActive:false, emailVerified:null, passwordHash:null, role:VENDOR }
 *   Vendor      = { userId → ghost user, status:'APPLYING', stripeOnboarded:false }
 *
 * The three independent blockers on the User row prevent the ghost
 * from ever passing `authorizeCredentials`, and the Vendor status +
 * `stripeOnboarded=false` combination is already filtered out of the
 * public catalog by `getAvailableProductWhere` (hardened in PR-A).
 *
 * Idempotency is guaranteed by `Product.sourceIngestionDraftId`'s
 * UNIQUE constraint. Re-running the action against the same draft
 * returns the existing Product unchanged.
 *
 * Hard validations (raise `IngestionPublishValidationError`):
 *   - Source message must carry a `tgAuthorId`. Without a stable
 *     producer identity we refuse to create the ghost pair.
 *   - `priceCents` must be present and strictly positive.
 *   - `productName` must be non-empty after sanitisation.
 *   - `currencyCode` must be EUR (or null → assumed EUR). Anything
 *     else is refused until multi-currency lands.
 */
export async function publishApprovedDraft(
  input: z.infer<typeof publishSchema>,
): Promise<PublishResult> {
  const session = await requireIngestionAdmin()
  const { draftId } = publishSchema.parse(input)

  // Strict publish-flag gate is separate from the admin UI flag —
  // operators can have review access without the publish path armed.
  const publishEnabled = await isIngestionPublishEnabled({
    userId: session.user.id,
    email: session.user.email ?? undefined,
    role: session.user.role,
  })
  if (!publishEnabled) {
    throw new IngestionPublishValidationError(
      'flagOff',
      'Publicación desactivada: flag feat-ingestion-publish no está habilitada para este operador.',
    )
  }

  const ip = await getAuditRequestIp()

  const draft = await db.ingestionProductDraft.findUnique({
    where: { id: draftId },
    include: {
      sourceMessage: { select: { id: true, tgAuthorId: true } },
    },
  })
  if (!draft) throw new IngestionPublishValidationError('notFound', 'Draft no encontrado')

  // Idempotent short-circuit before touching anything else: if a
  // Product already exists pointing at this draft, surface it and
  // return. Callers cannot tell a first-time publish apart from a
  // re-publish unless they inspect `status`.
  const existingProduct = await db.product.findUnique({
    where: { sourceIngestionDraftId: draftId },
    select: { id: true, vendorId: true, vendor: { select: { userId: true } } },
  })
  if (existingProduct) {
    logger.info('ingestion.admin.publish_idempotent', {
      draftId,
      productId: existingProduct.id,
      actorId: session.user.id,
    })
    return {
      status: 'IDEMPOTENT',
      productId: existingProduct.id,
      vendorId: existingProduct.vendorId,
      ghostUserId: existingProduct.vendor.userId,
    }
  }

  if (draft.status !== 'PENDING') {
    throw new IngestionPublishValidationError(
      'alreadyResolved',
      `Draft ya resuelto (status=${draft.status}). Re-publicar un rechazado no está permitido.`,
    )
  }

  // ── Hard validations ────────────────────────────────────────────
  const tgAuthorId = draft.sourceMessage.tgAuthorId?.toString() ?? null
  if (!tgAuthorId) {
    throw new IngestionPublishValidationError(
      'missingAuthor',
      'El mensaje origen no tiene tgAuthorId — no se puede crear un vendor ghost estable.',
    )
  }
  if (draft.priceCents == null || draft.priceCents <= 0) {
    throw new IngestionPublishValidationError(
      'invalidPrice',
      'El draft no tiene priceCents > 0. Edita el draft antes de publicar.',
    )
  }
  const productName = sanitiseProductName(draft.productName)
  if (productName.length === 0) {
    throw new IngestionPublishValidationError(
      'emptyName',
      'El nombre de producto queda vacío tras sanitizar. Edita el draft antes de publicar.',
    )
  }
  const currencyCode = (draft.currencyCode ?? 'EUR').toUpperCase()
  if (currencyCode !== 'EUR') {
    throw new IngestionPublishValidationError(
      'unsupportedCurrency',
      `Solo EUR está soportado (draft usa ${currencyCode}).`,
    )
  }

  // ── Ghost identity: upsert User + Vendor ────────────────────────
  const email = ghostUserEmail(tgAuthorId)
  const existingGhostUser = await db.user.findUnique({
    where: { email },
    select: { id: true, vendor: { select: { id: true } } },
  })

  let ghostUserId: string
  let vendorId: string
  if (existingGhostUser) {
    ghostUserId = existingGhostUser.id
    if (existingGhostUser.vendor) {
      vendorId = existingGhostUser.vendor.id
    } else {
      // Defensive: a ghost user without its vendor row should not
      // exist in practice, but nothing stops an operator from
      // deleting one manually. Re-create the vendor if so.
      const vendorSlug = await resolveUniqueVendorSlug(
        `productor-tg-${tgAuthorId.slice(-4)}`,
      )
      const vendor = await db.vendor.create({
        data: {
          userId: ghostUserId,
          slug: vendorSlug,
          displayName: `Productor Telegram ${tgAuthorId.slice(-4)}`,
          status: 'APPLYING',
          stripeOnboarded: false,
          claimCode: await issueUniqueClaimCode(),
          claimCodeExpiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MS),
        },
      })
      vendorId = vendor.id
    }
  } else {
    const ghostUser = await db.user.create({
      data: {
        email,
        firstName: 'Productor',
        lastName: `tg-${tgAuthorId.slice(0, 6)}`,
        role: 'VENDOR',
        isActive: false,
        emailVerified: null,
        passwordHash: null,
      },
    })
    ghostUserId = ghostUser.id
    const vendorSlug = await resolveUniqueVendorSlug(
      `productor-tg-${tgAuthorId.slice(-4)}`,
    )
    const vendor = await db.vendor.create({
      data: {
        userId: ghostUserId,
        slug: vendorSlug,
        displayName: `Productor Telegram ${tgAuthorId.slice(-4)}`,
        status: 'APPLYING',
        stripeOnboarded: false,
        claimCode: await issueUniqueClaimCode(),
        claimCodeExpiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MS),
      },
    })
    vendorId = vendor.id
  }

  // ── Category: slug → id, fallback to cat_uncategorized ──────────
  let categoryId = 'cat_uncategorized'
  if (draft.categorySlug) {
    const cat = await db.category.findUnique({
      where: { slug: draft.categorySlug },
      select: { id: true },
    })
    if (cat) categoryId = cat.id
  }

  // ── Product row + state transition + audit, one transaction ─────
  const productSlug = await resolveUniqueSlug(productName)
  const basePrice = (draft.priceCents / 100).toFixed(2)
  const unit = UNIT_MAP[draft.unit ?? 'UNIT'] ?? 'unit'
  const availability = draft.availability ?? 'UNKNOWN'
  const stock = availability === 'AVAILABLE' ? 1 : 0

  const { productId } = await mutateWithAudit(async (tx) => {
    const product = await tx.product.create({
      data: {
        vendorId,
        categoryId,
        name: productName,
        slug: productSlug,
        status: 'PENDING_REVIEW',
        basePrice,
        unit,
        stock,
        trackStock: false,
        weightGrams: draft.weightGrams,
        sourceIngestionDraftId: draftId,
        sourceTelegramMessageId: draft.sourceMessageId,
      },
    })

    await tx.ingestionProductDraft.update({
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
      result: { productId: product.id },
      audit: {
        action: 'INGESTION_DRAFT_PUBLISHED',
        entityType: 'IngestionProductDraft',
        entityId: draftId,
        before: draftAuditSnapshot(draft),
        after: {
          draftId,
          productId: product.id,
          vendorId,
          ghostUserId,
          sourceMessageId: draft.sourceMessageId,
          productSlug,
          productStatus: product.status,
          basePriceEur: basePrice,
          unit,
          categoryId,
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  logger.info('ingestion.admin.draft_published', {
    draftId,
    productId,
    vendorId,
    ghostUserId,
    actorId: session.user.id,
  })
  safeRevalidatePath(REVALIDATE_PATH)
  safeRevalidatePath('/admin/productos')

  return { status: 'CREATED', productId, vendorId, ghostUserId }
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

/**
 * Approve a vendor lead and create the corresponding ghost vendor.
 *
 * Creates (or reuses, when the same author has already been promoted)
 * a `User` + `Vendor` pair owned by a fake email. The vendor lands in
 * `APPLYING` status with a fresh claim code so the real producer can
 * later claim ownership through the existing claim flow (Phase 4
 * PR-E). Marks the IngestionVendorDraft as APPROVED and resolves the
 * review queue item.
 *
 * Idempotent on draft id: re-running on an already-APPROVED draft is
 * a no-op that surfaces a friendly error.
 */
export async function approveVendorLead(
  input: z.infer<typeof vendorLeadActionSchema>,
): Promise<{ vendorId: string; claimCode: string }> {
  const session = await requireIngestionAdmin()
  const { vendorDraftId } = vendorLeadActionSchema.parse(input)
  const ip = await getAuditRequestIp()

  const vendorDraft = await db.ingestionVendorDraft.findUnique({
    where: { id: vendorDraftId },
  })
  if (!vendorDraft) throw new Error('Vendor draft not found')
  if (vendorDraft.status !== 'PENDING') {
    throw new Error(
      `Vendor draft already resolved (status=${vendorDraft.status})`,
    )
  }

  // Resolve a stable Telegram author id for the ghost user email. We
  // walk the inferred messages oldest-first because the very first
  // message we saw from this author is the most likely to carry the
  // author id (a later message can be from someone else replying in
  // the same thread).
  const messageIds = Array.isArray(vendorDraft.inferredFromMessageIds)
    ? (vendorDraft.inferredFromMessageIds as unknown[]).filter(
        (x): x is string => typeof x === 'string',
      )
    : []
  const sourceMessage = messageIds.length
    ? await db.telegramIngestionMessage.findFirst({
        where: { id: { in: messageIds }, tgAuthorId: { not: null } },
        select: { tgAuthorId: true },
        orderBy: { postedAt: 'asc' },
      })
    : null
  const tgAuthorId = sourceMessage?.tgAuthorId?.toString() ?? null
  if (!tgAuthorId) {
    throw new Error(
      'Vendor lead has no Telegram author id — cannot create ghost user. Link the producer manually.',
    )
  }

  const email = ghostUserEmail(tgAuthorId)
  const existingGhostUser = await db.user.findUnique({
    where: { email },
    select: { id: true, vendor: { select: { id: true, claimCode: true } } },
  })

  let vendorId: string
  let claimCode: string

  await mutateWithAudit(async (tx) => {
    if (existingGhostUser?.vendor) {
      // Already promoted on a previous draft; just attach this draft.
      vendorId = existingGhostUser.vendor.id
      claimCode = existingGhostUser.vendor.claimCode ?? ''
    } else {
      const ghostUserId = existingGhostUser
        ? existingGhostUser.id
        : (
            await tx.user.create({
              data: {
                email,
                firstName: 'Productor',
                lastName: `tg-${tgAuthorId.slice(0, 6)}`,
                role: 'VENDOR',
                isActive: false,
                emailVerified: null,
                passwordHash: null,
              },
            })
          ).id
      const vendorSlug = await resolveUniqueVendorSlug(
        `productor-tg-${tgAuthorId.slice(-4)}`,
      )
      const fresh = await issueUniqueClaimCode()
      const created = await tx.vendor.create({
        data: {
          userId: ghostUserId,
          slug: vendorSlug,
          displayName: vendorDraft.displayName || `Productor Telegram ${tgAuthorId.slice(-4)}`,
          status: 'APPLYING',
          stripeOnboarded: false,
          claimCode: fresh,
          claimCodeExpiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MS),
        },
      })
      vendorId = created.id
      claimCode = fresh
    }

    await tx.ingestionVendorDraft.update({
      where: { id: vendorDraftId },
      data: { status: 'APPROVED' },
    })
    await tx.ingestionReviewQueueItem.updateMany({
      where: {
        kind: 'VENDOR_DRAFT',
        targetId: vendorDraftId,
        state: 'ENQUEUED',
      },
      data: {
        state: 'AUTO_RESOLVED',
        autoResolvedReason: 'adminApproved',
        autoResolvedAt: new Date(),
      },
    })

    return {
      result: { vendorId },
      audit: {
        action: 'INGESTION_VENDOR_LEAD_APPROVED',
        entityType: 'IngestionVendorDraft',
        entityId: vendorDraftId,
        before: {
          status: vendorDraft.status,
          externalId: vendorDraft.externalId,
        },
        after: {
          status: 'APPROVED',
          vendorId,
          tgAuthorId,
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  logger.info('ingestion.admin.vendor_lead_approved', {
    vendorDraftId,
    vendorId: vendorId!,
    tgAuthorId,
    actorId: session.user.id,
  })
  safeRevalidatePath(REVALIDATE_PATH)
  return { vendorId: vendorId!, claimCode: claimCode! }
}

/**
 * Discard a vendor lead: mark the draft REJECTED and resolve the
 * review queue item with `adminDiscarded`. No vendor is created.
 */
export async function discardVendorLead(
  input: z.infer<typeof vendorLeadActionSchema>,
): Promise<void> {
  const session = await requireIngestionAdmin()
  const { vendorDraftId } = vendorLeadActionSchema.parse(input)
  const ip = await getAuditRequestIp()

  const vendorDraft = await db.ingestionVendorDraft.findUnique({
    where: { id: vendorDraftId },
  })
  if (!vendorDraft) throw new Error('Vendor draft not found')
  if (vendorDraft.status !== 'PENDING') {
    throw new Error(
      `Vendor draft already resolved (status=${vendorDraft.status})`,
    )
  }

  await mutateWithAudit(async (tx) => {
    const updated = await tx.ingestionVendorDraft.update({
      where: { id: vendorDraftId },
      data: { status: 'REJECTED' },
    })
    await tx.ingestionReviewQueueItem.updateMany({
      where: {
        kind: 'VENDOR_DRAFT',
        targetId: vendorDraftId,
        state: 'ENQUEUED',
      },
      data: {
        state: 'AUTO_RESOLVED',
        autoResolvedReason: 'adminDiscarded',
        autoResolvedAt: new Date(),
      },
    })
    return {
      result: updated,
      audit: {
        action: 'INGESTION_VENDOR_LEAD_DISCARDED',
        entityType: 'IngestionVendorDraft',
        entityId: vendorDraftId,
        before: { status: vendorDraft.status },
        after: { status: 'REJECTED' },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  logger.info('ingestion.admin.vendor_lead_discarded', {
    vendorDraftId,
    actorId: session.user.id,
  })
  safeRevalidatePath(REVALIDATE_PATH)
}
