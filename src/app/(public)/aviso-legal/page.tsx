import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/legal/LegalPage'
import { getLegalPageCopy } from '@/i18n/legal-page-copy'
import { getServerLocale } from '@/i18n/server'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getLegalPageCopy(locale).legalNotice

  return buildPageMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: '/aviso-legal',
  })
}

export default async function AvisoLegalPage() {
  const locale = await getServerLocale()
  const copy = getLegalPageCopy(locale).legalNotice

  return (
    <LegalPage
      title={copy.title}
      updatedAt={copy.updatedAt}
      intro={copy.intro}
      eyebrow={copy.eyebrow}
      updatedAtLabel={copy.updatedAtLabel}
    >
      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.ownership.title}</h2>
        <p className="mt-3">
          {copy.sections.ownership.bodyPrefix}{' '}
          <Link href="/contacto" className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
            {copy.sections.ownership.contactLink}
          </Link>
          {copy.sections.ownership.bodySuffix}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.usage.title}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {copy.sections.usage.items.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.ip.title}</h2>
        <p className="mt-3">{copy.sections.ip.body}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.liability.title}</h2>
        <p className="mt-3">{copy.sections.liability.body}</p>
      </section>
    </LegalPage>
  )
}
