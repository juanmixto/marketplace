'use server'

import { z } from 'zod'
import { UserRole } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { createAuditLog, getAuditRequestIp } from '@/lib/audit'
import { safeRevalidatePath } from '@/lib/revalidate'
import { logger } from '@/lib/logger'
import { VendorClaimError } from './claim-errors'

/**
 * Phase 4 PR-E — ghost vendor claim flow.
 *
 * When a draft is published from `/admin/ingestion`, a Ghost User +
 * Ghost Vendor pair is created deterministically by Telegram
 * authorId. The Vendor carries a one-time `claimCode` that the admin
 * hands to the real producer out-of-band (Telegram DM, WhatsApp,
 * email — the channel is outside the system on purpose).
 *
 * The real producer logs into their normal account and calls this
 * action with the code. If everything checks out we transfer
 * `Vendor.userId` from the ghost to the caller, promote the caller
 * to `VENDOR` role, and delete the now-orphaned ghost User.
 *
 * From that moment on the vendor behaves exactly like a
 * self-applied one: `vendor.status='APPLYING'`, `stripeOnboarded=false`.
 * The producer lands at `/vendor/dashboard`, fills in profile +
 * Stripe at `/vendor/perfil`, and admin approves → ACTIVE. That path
 * is Phase 1/2 vendor lifecycle and untouched here.
 */

const claimSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(8)
    .max(8)
    .regex(/^[A-Z0-9]+$/),
})

export interface ClaimResult {
  vendorId: string
  vendorSlug: string
  vendorDisplayName: string
}

export async function claimGhostVendor(input: unknown): Promise<ClaimResult> {
  const session = await getActionSession()
  if (!session) {
    throw new VendorClaimError('unauthenticated', 'Debes iniciar sesión para reclamar un productor.')
  }

  const parsed = claimSchema.safeParse(input)
  if (!parsed.success) {
    throw new VendorClaimError(
      'invalidCode',
      'El código debe tener 8 caracteres (letras y números, sin espacios).',
    )
  }

  const code = parsed.data.code
  const ip = await getAuditRequestIp()

  // Caller can only claim if they don't already own a vendor — we
  // enforce 1:1 User↔Vendor as the existing schema unique requires.
  const callerVendor = await db.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (callerVendor) {
    throw new VendorClaimError(
      'alreadyVendor',
      'Tu cuenta ya tiene un productor asociado. Cada usuario puede tener uno solo.',
    )
  }

  const vendor = await db.vendor.findUnique({
    where: { claimCode: code },
    select: {
      id: true,
      slug: true,
      displayName: true,
      userId: true,
      claimCodeExpiresAt: true,
      status: true,
    },
  })

  // Constant-timing is not a concern here — the code space is 32^8
  // and the endpoint is rate-limited by the existing middleware on
  // `/cuenta/*`. A "not found" vs "expired" distinction is useful
  // for the producer to tell "I mistyped" from "ask admin for a
  // fresh one".
  if (!vendor) {
    throw new VendorClaimError('notFound', 'Código no encontrado. Revisa que lo hayas escrito igual que te lo pasaron.')
  }
  if (!vendor.claimCodeExpiresAt || vendor.claimCodeExpiresAt.getTime() < Date.now()) {
    throw new VendorClaimError(
      'expired',
      'El código ha caducado. Pide al admin que te genere uno nuevo.',
    )
  }

  const ghostUserId = vendor.userId

  // Transfer in a single transaction. Order matters:
  //   1. Move Vendor.userId to the caller (the UNIQUE on userId
  //      would reject this if the caller already had a vendor; we
  //      pre-checked above).
  //   2. Bump caller's role to VENDOR.
  //   3. Clear claimCode + claimCodeExpiresAt (single-use).
  //   4. Delete the now-orphaned ghost User. Its FK children are
  //      either empty (no orders/reviews on a user that never
  //      logged in) or auth-side (tokens, 2FA) which cascade
  //      harmlessly.
  await db.$transaction(async (tx) => {
    await tx.vendor.update({
      where: { id: vendor.id },
      data: {
        userId: session.user.id,
        claimCode: null,
        claimCodeExpiresAt: null,
      },
    })
    await tx.user.update({
      where: { id: session.user.id },
      data: { role: UserRole.VENDOR },
    })
    await tx.user.delete({ where: { id: ghostUserId } })
  })

  await createAuditLog({
    action: 'VENDOR_CLAIMED',
    entityType: 'Vendor',
    entityId: vendor.id,
    actorId: session.user.id,
    actorRole: UserRole.VENDOR,
    before: { ownerUserId: ghostUserId, role: 'ghost' },
    after: {
      ownerUserId: session.user.id,
      vendorSlug: vendor.slug,
      vendorStatus: vendor.status,
    },
    ip,
  })

  logger.info('vendors.claim_succeeded', {
    vendorId: vendor.id,
    ghostUserId,
    newOwnerUserId: session.user.id,
  })

  safeRevalidatePath('/cuenta')
  safeRevalidatePath('/vendor/dashboard')
  safeRevalidatePath('/admin/productores')
  safeRevalidatePath('/admin/ingestion')

  return {
    vendorId: vendor.id,
    vendorSlug: vendor.slug,
    vendorDisplayName: vendor.displayName,
  }
}

/**
 * Read-only helper for the admin surface: look up a vendor by claim
 * code to preview what the producer will take ownership of before
 * they enter it. Returns `null` when the code is invalid or expired
 * so the admin UI can render a consistent "not available" message.
 */
export async function peekClaimCode(code: string) {
  const parsed = claimSchema.safeParse({ code })
  if (!parsed.success) return null
  const vendor = await db.vendor.findUnique({
    where: { claimCode: parsed.data.code },
    select: {
      id: true,
      slug: true,
      displayName: true,
      claimCodeExpiresAt: true,
      _count: { select: { products: true } },
    },
  })
  if (!vendor) return null
  if (!vendor.claimCodeExpiresAt || vendor.claimCodeExpiresAt.getTime() < Date.now()) {
    return null
  }
  return {
    vendorId: vendor.id,
    displayName: vendor.displayName,
    productsCount: vendor._count.products,
    expiresAt: vendor.claimCodeExpiresAt,
  }
}
