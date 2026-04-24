import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ClaimVendorForm } from './ClaimVendorForm'

export const metadata: Metadata = { title: 'Reclamar productor' }
export const dynamic = 'force-dynamic'

/**
 * Producer-facing entry point for the ghost-vendor claim flow. A
 * code is handed to the producer out-of-band by the admin
 * (Telegram DM, email, etc.); they paste it here, and if the code
 * is valid the Vendor's ownership transfers to their account.
 *
 * The page short-circuits when the caller already owns a vendor —
 * a User can only have one Vendor by the existing schema unique,
 * so the claim attempt would fail later anyway.
 */
export default async function ClaimVendorPage() {
  const session = await auth()
  if (!session) redirect('/login?callbackUrl=/cuenta/reclamar-productor')

  const vendor = await db.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, slug: true, displayName: true, status: true },
  })

  if (vendor) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/cuenta" className="mb-4 inline-block text-sm text-[var(--muted)] hover:underline">
          ← Volver a mi cuenta
        </Link>
        <h1 className="mb-2 text-3xl font-bold text-[var(--foreground)]">
          Ya tienes un productor
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Tu cuenta ya está vinculada al productor <strong>{vendor.displayName}</strong>.
          Cada cuenta solo puede tener uno. Si el código que recibiste es para otro
          productor, contacta con el admin: el código no se puede usar desde aquí.
        </p>
        <Link
          href={vendor.status === 'ACTIVE' ? '/vendor/dashboard' : '/cuenta/hazte-vendedor'}
          className="mt-6 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {vendor.status === 'ACTIVE' ? 'Ir a mi panel de productor' : 'Ver estado de mi solicitud'}
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/cuenta" className="mb-4 inline-block text-sm text-[var(--muted)] hover:underline">
        ← Volver a mi cuenta
      </Link>
      <h1 className="mb-2 text-3xl font-bold text-[var(--foreground)]">
        Reclamar productor importado
      </h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Si un admin del marketplace te ha compartido un código, introdúcelo aquí
        para tomar posesión de tu productor. Tus productos importados quedarán
        ligados a tu cuenta. Necesitarás completar el alta de Stripe después
        para poder vender.
      </p>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <ClaimVendorForm />
      </div>

      <div className="mt-6 rounded-xl border border-sky-500/30 bg-sky-50/60 p-5 text-sm text-sky-900 dark:border-sky-500/20 dark:bg-sky-950/20 dark:text-sky-200">
        <p className="font-semibold">¿Cómo consigo un código?</p>
        <p className="mt-1">
          Los códigos los generan los admins cuando importan mensajes de productores
          desde Telegram. Si crees que deberías tener uno, escribe al admin por el
          canal habitual — no pidas el código públicamente.
        </p>
      </div>
    </div>
  )
}
