import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { getServerT } from '@/i18n/server'
import { OpenIncidentForm } from './OpenIncidentForm'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return { title: t('incident.openCaseTitle') }
}

interface Props {
  searchParams: Promise<{ orderId?: string }>
}

export default async function NewIncidentPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { orderId } = await searchParams
  if (!orderId) redirect('/cuenta/pedidos')

  // Resolve the order so we can show context AND verify ownership before
  // rendering the form. The action will re-verify on submit (defense in
  // depth), but failing fast here is friendlier to the user.
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, customerId: true, status: true },
  })

  if (!order || order.customerId !== session.user.id) {
    redirect('/cuenta/pedidos')
  }

  const t = await getServerT()

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-[var(--foreground)]">
        {t('incident.openCaseTitle')}
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {t('incident.openCaseSubtitle')}
      </p>
      <p className="mt-4 text-sm text-[var(--foreground-soft)]">
        {t('incident.list.case')}: <span className="font-semibold">{order.orderNumber}</span>
      </p>

      <OpenIncidentForm orderId={order.id} />
    </div>
  )
}
