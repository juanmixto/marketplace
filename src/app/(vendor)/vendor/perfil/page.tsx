import { getMyVendorProfile } from '@/domains/vendors/actions'
import { VendorProfileForm } from '@/components/vendor/VendorProfileForm'
import { StripeConnectUI } from './StripeConnectUI'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mi perfil' }

export default async function VendorPerfilPage() {
  const vendor = await getMyVendorProfile()
  if (!vendor) redirect('/login')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Mi perfil</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">Información visible en tu tienda y datos bancarios</p>
      </div>

      {/* Stripe Connect Section */}
      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="font-semibold text-[var(--foreground)]">Configuración de pagos</h2>
        <StripeConnectUI onboarded={vendor.stripeOnboarded ?? false} />
      </section>

      <VendorProfileForm vendor={vendor} />
    </div>
  )
}
