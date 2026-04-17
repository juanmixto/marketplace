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

  const vendor = await db.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, displayName: true, status: true, slug: true },
  })

  // Count fulfillments that still need vendor action (same 'active' filter
  // used by `getMyFulfillments`). Feeds the installed-app icon badge so a
  // vendor sees pending work even when the app window is in the background.
  const pendingFulfillments = vendor
    ? await db.vendorFulfillment.count({
        where: {
          vendorId: vendor.id,
          status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
        },
      })
    : 0

  const portals = getAvailablePortals(session.user.role)

  const cookieStore = await cookies()
  const impersonationCookie = cookieStore.get(IMPERSONATION_COOKIE)?.value
  const impersonation = verifyImpersonationToken(impersonationCookie)
  const impersonatingAdminEmail = impersonation
    ? (await db.user.findUnique({ where: { id: impersonation.adminId }, select: { email: true } }))?.email ?? null
    : null

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
