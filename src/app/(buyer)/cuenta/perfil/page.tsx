import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BuyerProfileForm } from '@/components/buyer/BuyerProfileForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mi perfil' }

export default async function CuentaPerfilPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Mi perfil</h1>
        <p className="mt-2 text-[var(--muted)]">
          Gestiona tu información personal y contraseña
        </p>
      </div>

      <BuyerProfileForm user={{
        firstName: session.user.name?.split(' ')[0] || '',
        lastName: session.user.name?.split(' ').slice(1).join(' ') || '',
        email: session.user.email || '',
      }} />
    </div>
  )
}
