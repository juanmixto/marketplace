import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminWelcomeTour } from '@/components/admin/AdminWelcomeTour'
import { SidebarProvider } from '@/components/layout/SidebarProvider'
import { requireAdmin } from '@/lib/auth-guard'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin()

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-[var(--background)]">
        <AdminSidebar user={session.user} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AdminHeader user={session.user} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
          <AdminWelcomeTour adminId={session.user.id} adminName={session.user.name ?? session.user.email ?? 'admin'} />
        </div>
      </div>
    </SidebarProvider>
  )
}
