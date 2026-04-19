'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { redirect } from 'next/navigation'
import { isVendor } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'
import type { VendorAddressInput } from '@/domains/shipping/action-types'
import {
  SPAIN_PROVINCE_BY_PREFIX,
  getPrefixForProvince,
  isPlausiblePhone,
  normalizePhone,
  postalCodeMatchesProvince,
} from '@/domains/shipping/spain-provinces'

async function requireVendorSession() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) redirect('/login')
  return { session, vendor }
}

const VALID_PROVINCE_NAMES = new Set(Object.values(SPAIN_PROVINCE_BY_PREFIX))

const vendorAddressSchema = z
  .object({
    label: z.string().max(60).optional().nullable(),
    contactName: z.string().trim().min(2, 'Escribe el nombre de contacto').max(100),
    phone: z
      .string()
      .trim()
      .refine(isPlausiblePhone, 'Escribe un teléfono de contacto válido')
      .transform(normalizePhone),
    line1: z.string().trim().min(1, 'Escribe la dirección').max(150),
    line2: z.string().max(150).optional().nullable(),
    city: z.string().trim().min(1, 'Escribe la localidad').max(80),
    province: z
      .string()
      .trim()
      .refine(v => VALID_PROVINCE_NAMES.has(v), 'Selecciona una provincia válida'),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, 'El código postal debe tener 5 dígitos'),
    countryCode: z.string().length(2).default('ES'),
  })
  .superRefine((value, ctx) => {
    if (!postalCodeMatchesProvince(value.postalCode, value.province)) {
      const prefix = getPrefixForProvince(value.province)
      ctx.addIssue({
        code: 'custom',
        path: ['postalCode'],
        message: prefix
          ? `El código postal de ${value.province} debe empezar por ${prefix}`
          : 'El código postal no coincide con la provincia',
      })
    }
  })


export async function getMyVendorAddresses() {
  const { vendor } = await requireVendorSession()
  return db.vendorAddress.findMany({
    where: { vendorId: vendor.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

export interface VendorAddressPrefill {
  label: string
  contactName: string
  phone: string
  line1: string
  line2: string
  city: string
  province: string
  postalCode: string
  countryCode: string
}

/**
 * Builds a prefill payload for the vendor address form. Uses the saved
 * VendorAddress if present, otherwise falls back to the user's default
 * shipping Address and profile fields so producers don't have to
 * retype what we already know.
 */
export async function getVendorAddressPrefill(): Promise<VendorAddressPrefill> {
  const { session, vendor } = await requireVendorSession()

  const [existing, user] = await Promise.all([
    db.vendorAddress.findFirst({
      where: { vendorId: vendor.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      include: {
        addresses: {
          where: { isDefault: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
  ])

  const userAddress = user?.addresses[0]
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()

  return {
    label: existing?.label ?? '',
    contactName: existing?.contactName ?? fullName ?? '',
    phone: existing?.phone ?? userAddress?.phone ?? '',
    line1: existing?.line1 ?? userAddress?.line1 ?? '',
    line2: existing?.line2 ?? userAddress?.line2 ?? '',
    city: existing?.city ?? userAddress?.city ?? '',
    province: existing?.province ?? userAddress?.province ?? '',
    postalCode: existing?.postalCode ?? userAddress?.postalCode ?? '',
    countryCode: existing?.countryCode ?? 'ES',
  }
}

/**
 * Creates (or updates, if one already exists) the vendor's default
 * origin address. Phase 2 keeps this to a single address per vendor
 * to match the MVP constraint of one sender address per producer.
 *
 * Returns a discriminated result instead of throwing Zod errors so the
 * client form can render friendly per-field messages.
 */
export async function upsertDefaultVendorAddress(
  input: VendorAddressInput,
): Promise<
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string>; message?: string }
> {
  const { vendor } = await requireVendorSession()

  const parsed = vendorAddressSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form'
      if (!fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, fieldErrors }
  }
  const data = parsed.data

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
