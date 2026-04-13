'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { redirect } from 'next/navigation'
import { isVendor } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'

async function requireVendorSession() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) redirect('/login')
  return { session, vendor }
}

const vendorAddressSchema = z.object({
  label: z.string().max(60).optional().nullable(),
  contactName: z.string().min(2).max(100),
  phone: z.string().min(6).max(30),
  line1: z.string().min(3).max(150),
  line2: z.string().max(150).optional().nullable(),
  city: z.string().min(2).max(80),
  province: z.string().min(2).max(80),
  postalCode: z.string().min(4).max(10),
  countryCode: z.string().length(2).default('ES'),
})

export type VendorAddressInput = z.infer<typeof vendorAddressSchema>

export async function getMyVendorAddresses() {
  const { vendor } = await requireVendorSession()
  return db.vendorAddress.findMany({
    where: { vendorId: vendor.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

/**
 * Creates (or updates, if one already exists) the vendor's default
 * origin address. Phase 2 keeps this to a single address per vendor
 * to match the MVP constraint of one sender address per producer.
 */
export async function upsertDefaultVendorAddress(input: VendorAddressInput) {
  const { vendor } = await requireVendorSession()
  const data = vendorAddressSchema.parse(input)

  const existing = await db.vendorAddress.findFirst({
    where: { vendorId: vendor.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })

  if (existing) {
    await db.vendorAddress.update({
      where: { id: existing.id },
      data: { ...data, isDefault: true },
    })
  } else {
    await db.vendorAddress.create({
      data: { ...data, vendorId: vendor.id, isDefault: true },
    })
  }

  safeRevalidatePath('/vendor/perfil')
  safeRevalidatePath('/vendor/pedidos')
  return { ok: true as const }
}
