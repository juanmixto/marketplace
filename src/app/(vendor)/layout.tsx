import { VendorSidebar } from '@/components/vendor/VendorSidebar'
import { VendorHeader } from '@/components/vendor/VendorHeader'
import { db } from '@/lib/db'
import { requireVendor } from '@/lib/auth-guard'

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireVendor()

  const vendor = await db.vendor.findUnique({
    where: { userId: session.user.id },
    select: { displayName: true, status: true, slug: true },
  })

  return (
    <div className="flex h-screen bg-[var(--background)]">
      <VendorSidebar vendor={vendor} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <VendorHeader user={session.user} vendor={vendor} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
