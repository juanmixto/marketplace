import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminWelcomeTour } from '@/components/admin/AdminWelcomeTour'
import { SidebarProvider } from '@/components/layout/SidebarProvider'
import { requireAdmin } from '@/lib/auth-guard'
import { getAvailablePortals } from '@/lib/portals'
import { isFeatureEnabled } from '@/lib/flags'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin()
  const portals = getAvailablePortals(session.user.role)
  const adminUsersEnabled = await isFeatureEnabled('feat-admin-user-management', {
    userId: session.user.id,
    email: session.user.email ?? undefined,
    role: session.user.role,
  })

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-[var(--background)]">
        <AdminSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AdminHeader user={session.user} portals={portals} adminUsersEnabled={adminUsersEnabled} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
          <AdminWelcomeTour adminId={session.user.id} adminName={session.user.name ?? session.user.email ?? 'admin'} />
        </div>
      </div>
    </SidebarProvider>
  )
}
