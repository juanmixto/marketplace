import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { getLegalPageCopy } from '@/i18n/legal-page-copy'
import { getServerLocale } from '@/i18n/server'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getLegalPageCopy(locale).terms

  return buildPageMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: '/terminos',
  })
}

export default async function TerminosPage() {
  const locale = await getServerLocale()
  const copy = getLegalPageCopy(locale).terms

  return (
    <LegalPage
      title={copy.title}
      updatedAt={copy.updatedAt}
      intro={copy.intro}
      eyebrow={copy.eyebrow}
      updatedAtLabel={copy.updatedAtLabel}
    >
      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.accounts.title}</h2>
        <p className="mt-3">{copy.sections.accounts.body}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.purchases.title}</h2>
        <p className="mt-3">{copy.sections.purchases.body}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.shipping.title}</h2>
        <p className="mt-3">{copy.sections.shipping.body}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.acceptable.title}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {copy.sections.acceptable.items.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.changes.title}</h2>
        <p className="mt-3">{copy.sections.changes.body}</p>
      </section>
    </LegalPage>
  )
}
