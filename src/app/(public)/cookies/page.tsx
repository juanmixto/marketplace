import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { getLegalPageCopy } from '@/i18n/legal-page-copy'
import { getServerLocale } from '@/i18n/server'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getLegalPageCopy(locale).cookies

  return buildPageMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: '/cookies',
  })
}

export default async function CookiesPage() {
  const locale = await getServerLocale()
  const copy = getLegalPageCopy(locale).cookies

  return (
    <LegalPage
      title={copy.title}
      updatedAt={copy.updatedAt}
      intro={copy.intro}
      eyebrow={copy.eyebrow}
      updatedAtLabel={copy.updatedAtLabel}
    >
      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.what.title}</h2>
        <p className="mt-3">{copy.sections.what.body}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.types.title}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {copy.sections.types.items.map(item => (
            <li key={item.label}>
              <strong>{item.label}:</strong> {item.text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.consent.title}</h2>
        <p className="mt-3">{copy.sections.consent.body}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.disable.title}</h2>
        <p className="mt-3">{copy.sections.disable.body}</p>
      </section>
    </LegalPage>
  )
}
