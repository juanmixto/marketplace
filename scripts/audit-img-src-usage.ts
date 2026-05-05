/**
 * audit-img-src-usage.ts
 *
 * Closes the analysis half of #1249 (HU8). Walks every column that
 * stores an image URL and groups the values by their hostname so the
 * operator can decide which entries in `img-src` (and the matching
 * `next.config.ts → images.remotePatterns`) are actually load-bearing
 * versus historical defaults.
 *
 * Why an audit and not a reflexive trim: each external host in
 * `img-src` is a potential exfil sink under XSS. Cutting one we still
 * use silently breaks vendor heroes / product galleries on prod;
 * keeping one we don't widens the policy for nothing.
 *
 * Columns walked:
 *   - User.image                        (Google OAuth avatar)
 *   - Vendor.logo, Vendor.coverImage    (vendor branding)
 *   - Category.icon, Category.image     (catalog UI)
 *   - Product.images                    (per-product gallery, String[])
 *
 * Order snapshots (`OrderLine.productSnapshot`) intentionally NOT
 * walked: they're write-once historical copies of `Product.images`,
 * so a host that appears only in snapshots is by definition orphaned
 * — driving CSP off historical data would lock us into legacy hosts
 * forever. The operator decides about snapshot images by querying
 * directly during incident response.
 *
 * Output: a Markdown table sorted by hostname, plus a short verdict
 * (in CSP? in remotePatterns? safe to drop?).
 *
 * Usage:
 *   npm run audit:img-src                  # human-readable
 *   npm run audit:img-src -- --json        # machine
 *
 * Run pre-merge against the production replica (or a recent snapshot).
 * The script does NOT mutate anything; it only reads.
 *
 * Out of scope: this script does not edit security-headers.ts or
 * next.config.ts. Removing a host is a deliberate decision; the
 * follow-up PR cites the audit output in its description.
 */
import { argv } from 'node:process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { getServerEnv } from '@/lib/env'

const JSON_OUTPUT = argv.includes('--json')

// CSP img-src hosts as of HEAD. Keep in lockstep with
// `src/lib/security-headers.ts` — when removing a host, update both.
// HU8 (#1249): cloudinary + uploadthing dropped after this script's
// own audit reported 0 references on dev.
const CSP_HOSTS = [
  'images.unsplash.com',
  '*.public.blob.vercel-storage.com',
] as const

// `next.config.ts → remotePatterns` hostnames. Same lockstep rule.
// lh3.googleusercontent.com is in remotePatterns (Google avatar via
// next/image) but not in img-src — `<Image>` requests proxy through
// /_next/image which resolves under `'self'`.
const REMOTE_PATTERNS = [
  'images.unsplash.com',
  '**.public.blob.vercel-storage.com',
  'lh3.googleusercontent.com',
] as const

interface Breakdown {
  user: number
  vendorLogo: number
  vendorCover: number
  categoryIcon: number
  categoryImage: number
  productImage: number
}

type BreakdownKey = keyof Breakdown

interface Row {
  hostname: string
  total: number
  breakdown: Breakdown
  cspMatch: string | null
  remotePatternsMatch: string | null
}

function extractHost(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function matchesPattern(hostname: string, pattern: string): boolean {
  // Pattern shapes: "host.example.com", "*.example.com", "**.example.com".
  // CSP and next.config use slightly different wildcards; both match
  // any single subdomain depth here, which is good enough for an
  // audit (we're not enforcing the pattern, just labelling it).
  if (pattern.startsWith('**.')) {
    const suffix = pattern.slice(2)
    return hostname.endsWith(suffix)
  }
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1)
    if (!hostname.endsWith(suffix)) return false
    const prefix = hostname.slice(0, -suffix.length)
    return prefix.length > 0 && !prefix.includes('.')
  }
  return hostname === pattern
}

function hostInList(hostname: string, list: readonly string[]): string | null {
  return list.find((entry) => matchesPattern(hostname, entry)) ?? null
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: getServerEnv().databaseUrl })
  const prisma = new PrismaClient({ adapter })
  const counts = new Map<string, Breakdown>()

  function bump(hostname: string | null, key: BreakdownKey): void {
    if (!hostname) return
    const cur = counts.get(hostname) ?? {
      user: 0,
      vendorLogo: 0,
      vendorCover: 0,
      categoryIcon: 0,
      categoryImage: 0,
      productImage: 0,
    }
    cur[key] += 1
    counts.set(hostname, cur)
  }

  // User.image — Google OAuth avatars (lh3.googleusercontent.com expected).
  const users = await prisma.user.findMany({
    where: { image: { not: null } },
    select: { image: true },
  })
  for (const u of users) bump(extractHost(u.image), 'user')

  // Vendor.logo + coverImage.
  const vendors = await prisma.vendor.findMany({
    where: { OR: [{ logo: { not: null } }, { coverImage: { not: null } }] },
    select: { logo: true, coverImage: true },
  })
  for (const v of vendors) {
    bump(extractHost(v.logo), 'vendorLogo')
    bump(extractHost(v.coverImage), 'vendorCover')
  }

  // Category.icon + image.
  const categories = await prisma.category.findMany({
    where: { OR: [{ icon: { not: null } }, { image: { not: null } }] },
    select: { icon: true, image: true },
  })
  for (const c of categories) {
    bump(extractHost(c.icon), 'categoryIcon')
    bump(extractHost(c.image), 'categoryImage')
  }

  // Product.images (String[]). Paginated to keep memory bounded on
  // big catalogs — small now, but the audit runs on prod data.
  let cursor: string | undefined = undefined
  while (true) {
    const page = await prisma.product.findMany({
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, images: true },
    })
    if (page.length === 0) break
    for (const p of page) {
      for (const url of p.images) bump(extractHost(url), 'productImage')
    }
    cursor = page[page.length - 1]!.id
    if (page.length < 500) break
  }

  await prisma.$disconnect()

  const rows: Row[] = [...counts.entries()]
    .map(([hostname, breakdown]) => {
      const total =
        breakdown.user +
        breakdown.vendorLogo +
        breakdown.vendorCover +
        breakdown.categoryIcon +
        breakdown.categoryImage +
        breakdown.productImage
      return {
        hostname,
        total,
        breakdown,
        cspMatch: hostInList(hostname, CSP_HOSTS),
        remotePatternsMatch: hostInList(hostname, REMOTE_PATTERNS),
      }
    })
    .sort((a, b) => a.hostname.localeCompare(b.hostname))

  if (JSON_OUTPUT) {
    process.stdout.write(
      JSON.stringify({ rows, cspHosts: CSP_HOSTS, remotePatterns: REMOTE_PATTERNS }, null, 2),
    )
    process.stdout.write('\n')
    return
  }

  console.log('# img-src usage audit (HU8 / #1249)')
  console.log('')
  console.log(
    'Counts of image URLs grouped by hostname, across User.image, Vendor.{logo,coverImage}, Category.{icon,image}, and Product.images.',
  )
  console.log('')
  console.log(
    '| hostname | total | user | vendorLogo | vendorCover | categoryIcon | categoryImage | productImage | in CSP img-src? | in remotePatterns? |',
  )
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|:---:|:---:|')
  for (const r of rows) {
    console.log(
      `| \`${r.hostname}\` | ${r.total} | ${r.breakdown.user} | ${r.breakdown.vendorLogo} | ${r.breakdown.vendorCover} | ${r.breakdown.categoryIcon} | ${r.breakdown.categoryImage} | ${r.breakdown.productImage} | ${r.cspMatch ?? '—'} | ${r.remotePatternsMatch ?? '—'} |`,
    )
  }

  console.log('')
  console.log('## Verdict per CSP host')
  console.log('')
  for (const cspEntry of CSP_HOSTS) {
    const used = rows.some((r) => matchesPattern(r.hostname, cspEntry))
    const verdict = used ? 'in use — KEEP' : 'no usage found — candidate for removal'
    console.log(`- \`${cspEntry}\` — ${verdict}`)
  }

  console.log('')
  console.log('## Hosts in DB but NOT in CSP img-src')
  console.log('')
  console.log('Hosts that appear in remotePatterns are served through /_next/image,')
  console.log("which resolves under `'self'` in CSP — they do NOT need img-src entries.")
  console.log('Anything below that is in remotePatterns is fine; anything that is NOT')
  console.log('in either is a real orphan and will fail to render in production.')
  console.log('')
  const orphans = rows.filter((r) => r.cspMatch === null)
  if (orphans.length === 0) {
    console.log('(none)')
  } else {
    for (const r of orphans) {
      const status = r.remotePatternsMatch
        ? `OK — covered by remotePatterns (${r.remotePatternsMatch}) + /_next/image`
        : 'ORPHAN — not in CSP and not in remotePatterns; data will fail to render'
      console.log(`- \`${r.hostname}\` — ${r.total} reference(s). ${status}.`)
    }
  }
}

main().catch((err) => {
  console.error('audit-img-src-usage failed:', err)
  process.exit(1)
})
