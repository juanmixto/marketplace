import { cookies } from 'next/headers'
import { VendorSidebar } from '@/components/vendor/VendorSidebar'
import { VendorHeader } from '@/components/vendor/VendorHeader'
import { SidebarProvider } from '@/components/layout/SidebarProvider'
import { ImpersonationBanner } from '@/components/vendor/ImpersonationBanner'
import AppBadgeSync from '@/components/pwa/AppBadgeSync'
import { db } from '@/lib/db'
import { requireVendor } from '@/lib/auth-guard'
import { getAvailablePortals } from '@/lib/portals'
import { IMPERSONATION_COOKIE, verifyImpersonationToken } from '@/lib/impersonation'

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireVendor()

  // Two independent lookups once the session is known: the vendor record
  // (needed for sidebar + fulfillment badge) and the impersonation cookie
  // (needed for the banner). Kicked off in parallel so the layout's
  // critical path is dominated by a single round-trip rather than the
  // old sequential chain of ~4 queries.
  const [vendor, cookieStore] = await Promise.all([
    db.vendor.findUnique({
      where: { userId: session.user.id },
      select: { id: true, displayName: true, status: true, slug: true },
    }),
    cookies(),
  ])

  const impersonationCookie = cookieStore.get(IMPERSONATION_COOKIE)?.value
  const impersonation = verifyImpersonationToken(impersonationCookie)
  const portals = getAvailablePortals(session.user.role)

  // Second parallel wave: fulfillment count depends on the vendor id, and
  // the impersonating admin's email depends on the verified impersonation
  // token. Both are cheap point lookups — run them together so the layout
  // doesn't wait on each sequentially.
  const [pendingFulfillments, impersonatingAdminEmail] = await Promise.all([
    vendor
      ? db.vendorFulfillment.count({
          where: {
            vendorId: vendor.id,
            status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
          },
        })
      : Promise.resolve(0),
    impersonation
      ? db.user
          .findUnique({ where: { id: impersonation.adminId }, select: { email: true } })
          .then(u => u?.email ?? null)
      : Promise.resolve(null),
  ])

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-[var(--background)]">
        <VendorSidebar vendor={vendor} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {impersonation && (
            <ImpersonationBanner
              adminEmail={impersonatingAdminEmail}
              vendorLabel={vendor?.displayName ?? impersonation.vendorId}
              remainingSeconds={impersonation.remainingSeconds}
              readOnly={impersonation.readOnly}
            />
          )}
          <VendorHeader user={session.user} vendor={vendor} portals={portals} />
          <AppBadgeSync count={pendingFulfillments} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}
