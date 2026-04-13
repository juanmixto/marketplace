/**
 * Backfill helper for the shipping integration.
 *
 * For every Vendor that does not yet have a VendorAddress, this script
 * creates a placeholder default address using whatever we can infer
 * from existing profile fields (the `location` column) plus the user's
 * default personal address if present.
 *
 * The created address is flagged as "needs review": any field we could
 * not derive is set to 'REVIEW' so the vendor is visibly forced to
 * complete it before the marketplace generates labels.
 *
 * Run with:
 *   npx tsx scripts/backfill-vendor-addresses.ts [--dry-run]
 */
import { db } from '../src/lib/db'

const DRY_RUN = process.argv.includes('--dry-run')
const PLACEHOLDER = 'REVIEW'

async function main() {
  const vendors = await db.vendor.findMany({
    where: { addresses: { none: {} } },
    include: {
      user: {
        include: {
          addresses: {
            where: { isDefault: true },
            take: 1,
          },
        },
      },
    },
  })

  console.log(`[backfill] ${vendors.length} vendors without a VendorAddress.`)
  let created = 0
  let skipped = 0

  for (const vendor of vendors) {
    const userAddress = vendor.user.addresses[0]
    const data = {
      vendorId: vendor.id,
      label: 'Dirección principal',
      contactName: `${vendor.user.firstName} ${vendor.user.lastName}`.trim() || PLACEHOLDER,
      phone: PLACEHOLDER,
      line1: userAddress?.line1 ?? PLACEHOLDER,
      line2: userAddress?.line2 ?? null,
      city: userAddress?.city ?? vendor.location ?? PLACEHOLDER,
      province: userAddress?.province ?? PLACEHOLDER,
      postalCode: userAddress?.postalCode ?? PLACEHOLDER,
      countryCode: 'ES',
      isDefault: true,
    }

    if (DRY_RUN) {
      console.log(`[backfill] would create VendorAddress for ${vendor.slug}`, data)
      skipped += 1
      continue
    }

    await db.vendorAddress.create({ data })
    created += 1
    console.log(`[backfill] created VendorAddress for ${vendor.slug}`)
  }

  console.log(`[backfill] done: created=${created} skipped=${skipped}`)
}

main()
  .catch(err => {
    console.error('[backfill] error', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
