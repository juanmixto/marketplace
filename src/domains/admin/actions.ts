'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const ADMIN_ROLES = ['ADMIN_SUPPORT', 'ADMIN_CATALOG', 'ADMIN_FINANCE', 'ADMIN_OPS', 'SUPERADMIN'] as const

async function requireAdmin() {
  const session = await auth()
  if (!session || !ADMIN_ROLES.includes(session.user.role as typeof ADMIN_ROLES[number])) {
    redirect('/login')
  }
  return session
}

// ─── Vendor moderation ────────────────────────────────────────────────────────

/**
 * Activates a vendor account (APPLYING/PENDING_DOCS → ACTIVE).
 */
export async function approveVendor(vendorId: string) {
  await requireAdmin()

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new Error('Productor no encontrado')
  if (!['APPLYING', 'PENDING_DOCS'].includes(vendor.status)) {
    throw new Error('El productor ya está activo o suspendido')
  }

  await db.vendor.update({
    where: { id: vendorId },
    data: { status: 'ACTIVE' },
  })

  revalidatePath('/admin/productores')
}

/**
 * Rejects a vendor application.
 */
export async function rejectVendor(vendorId: string) {
  await requireAdmin()

  await db.vendor.update({
    where: { id: vendorId },
    data: { status: 'REJECTED' },
  })

  revalidatePath('/admin/productores')
}

/**
 * Suspends an active vendor (temporary).
 */
export async function suspendVendor(vendorId: string) {
  await requireAdmin()

  await db.vendor.update({
    where: { id: vendorId },
    data: { status: 'SUSPENDED_TEMP' },
  })

  revalidatePath('/admin/productores')
}

// ─── Product moderation ───────────────────────────────────────────────────────

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionNote: z.string().max(500).optional(),
})

/**
 * Approves or rejects a product in PENDING_REVIEW status.
 * On approval, sets status to ACTIVE.
 * On rejection, sets status to REJECTED and records the note.
 */
export async function reviewProduct(
  productId: string,
  action: 'approve' | 'reject',
  rejectionNote?: string
) {
  await requireAdmin()

  const { action: validAction, rejectionNote: note } = reviewSchema.parse({ action, rejectionNote })

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) throw new Error('Producto no encontrado')
  if (product.status !== 'PENDING_REVIEW') {
    throw new Error('El producto no está en revisión')
  }

  await db.product.update({
    where: { id: productId },
    data:
      validAction === 'approve'
        ? { status: 'ACTIVE', rejectionNote: null }
        : { status: 'REJECTED', rejectionNote: note ?? 'No cumple los requisitos del catálogo' },
  })

  revalidatePath('/admin/productos')
  revalidatePath('/vendor/productos')
}

/**
 * Suspends an active product.
 */
export async function suspendProduct(productId: string, reason: string) {
  await requireAdmin()

  await db.product.update({
    where: { id: productId },
    data: { status: 'SUSPENDED', rejectionNote: reason },
  })

  revalidatePath('/admin/productos')
  revalidatePath('/vendor/productos')
}
