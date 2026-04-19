'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { slugify } from '@/lib/utils'
import { safeRevalidatePath } from '@/lib/revalidate'
import { createAuditLog, getAuditRequestIp } from '@/lib/audit'

export const vendorApplicationSchema = z.object({
  displayName: z.string().trim().min(2, 'Nombre demasiado corto').max(80),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  category: z
    .enum(['BAKERY', 'CHEESE', 'WINERY', 'ORCHARD', 'OLIVE_OIL', 'FARM', 'DRYLAND', 'LOCAL_PRODUCER'])
    .optional(),
})

export type VendorApplicationInput = z.infer<typeof vendorApplicationSchema>

export type VendorApplicationResult =
  | { ok: true; vendorId: string }
  | { ok: false; error: 'unauthenticated' | 'already_applied' | 'validation'; issues?: string[] }

async function generateUniqueSlug(base: string): Promise<string> {
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

/**
 * Self-service vendor application. Any authenticated user (typically a
 * CUSTOMER) can submit one application. Creates a Vendor row in APPLYING
 * status linked to the caller's User. Does NOT change User.role — that
 * happens at admin approval time so buyers keep buying while they wait.
 */
export async function applyAsVendor(input: unknown): Promise<VendorApplicationResult> {
  const session = await getActionSession()
  if (!session) return { ok: false, error: 'unauthenticated' }

  const parsed = vendorApplicationSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'validation',
      issues: parsed.error.issues.map(i => i.message),
    }
  }

  const existing = await db.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (existing) return { ok: false, error: 'already_applied' }

  const slug = await generateUniqueSlug(parsed.data.displayName)
  const description = parsed.data.description?.trim() || null
  const location = parsed.data.location?.trim() || null

  const vendor = await db.vendor.create({
    data: {
      userId: session.user.id,
      slug,
      displayName: parsed.data.displayName.trim(),
      description,
      location,
      category: parsed.data.category ?? null,
      status: 'APPLYING',
    },
  })

  const ip = await getAuditRequestIp()
  await createAuditLog({
    action: 'VENDOR_APPLICATION_SUBMITTED',
    entityType: 'Vendor',
    entityId: vendor.id,
    actorId: session.user.id,
    actorRole: session.user.role,
    after: {
      id: vendor.id,
      status: vendor.status,
      displayName: vendor.displayName,
      slug: vendor.slug,
    },
    ip,
  })

  safeRevalidatePath('/admin/productores')
  safeRevalidatePath('/cuenta/hazte-vendedor')
  safeRevalidatePath('/cuenta')

  return { ok: true, vendorId: vendor.id }
}

/**
 * Convenience wrapper for use from a <form action={...}> binding.
 * Redirects on success to the status page.
 */
export async function applyAsVendorFromForm(formData: FormData): Promise<void> {
  const input = {
    displayName: formData.get('displayName'),
    description: formData.get('description'),
    location: formData.get('location'),
    category: formData.get('category') || undefined,
  }

  const result = await applyAsVendor(input)
  if (result.ok) {
    redirect('/cuenta/hazte-vendedor?enviada=1')
  }
  if (result.error === 'unauthenticated') {
    redirect('/login?callbackUrl=/cuenta/hazte-vendedor')
  }
  if (result.error === 'already_applied') {
    redirect('/cuenta/hazte-vendedor')
  }
  // validation errors: caller should re-render with issues — for now throw
  throw new Error(result.issues?.join(', ') ?? 'Validación fallida')
}

export async function getMyVendorApplication() {
  const session = await getActionSession()
  if (!session) return null
  return db.vendor.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      slug: true,
      displayName: true,
      status: true,
      createdAt: true,
    },
  })
}
