import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { resolveShareTarget } from '@/lib/pwa/share-target'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface ShareTargetPageProps {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>
}

export default async function ShareTargetPage({ searchParams }: ShareTargetPageProps) {
  const params = await searchParams
  const resolution = resolveShareTarget({
    title: params.title ?? null,
    text: params.text ?? null,
    url: params.url ?? null,
  })
  redirect(resolution.redirect)
}
