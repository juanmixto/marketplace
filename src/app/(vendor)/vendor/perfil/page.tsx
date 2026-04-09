import { getMyVendorProfile } from '@/domains/vendors/actions'
import { VendorProfileForm } from '@/components/vendor/VendorProfileForm'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mi perfil' }

export default async function VendorPerfilPage() {
  const vendor = await getMyVendorProfile()
  if (!vendor) redirect('/login')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
        <p className="text-sm text-gray-500 mt-0.5">Información visible en tu tienda y datos bancarios</p>
      </div>
      <VendorProfileForm vendor={vendor} />
    </div>
  )
}
