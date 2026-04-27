import Image from 'next/image'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BuyerProfileForm } from '@/components/buyer/BuyerProfileForm'
import { getServerT } from '@/i18n/server'
import { db } from '@/lib/db'
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return { title: t('account.profileTitle') }
}

export default async function CuentaPerfilPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const t = await getServerT()

  // Prisma User has firstName + lastName as separate columns; session
  // exposes neither directly (Auth.js's default `name` field is unset
  // because our schema has no `name` column). Read them from the DB so
  // social-login users see their Google profile name pre-filled.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true, email: true, image: true },
  })
  if (!user) redirect('/login')

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center gap-4">
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-full border border-[var(--border)] object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--muted-bg)] text-xl font-semibold text-[var(--muted)]"
          >
            {initials}
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">{t('account.profileTitle')}</h1>
          <p className="mt-1 text-[var(--muted)]">
            {t('account.profileSubtitle')}
          </p>
        </div>
      </div>

      <BuyerProfileForm user={{
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      }} />
    </div>
  )
}
