import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/legal/LegalPage'
import { getLegalPageCopy } from '@/i18n/legal-page-copy'
import { getServerLocale } from '@/i18n/server'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getLegalPageCopy(locale).privacy

  return buildPageMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: '/privacidad',
  })
}

export default async function PrivacyPage() {
  const locale = await getServerLocale()
  const copy = getLegalPageCopy(locale).privacy

  return (
    <main className="bg-surface text-foreground">
      <LegalPage
        title={copy.title}
        updatedAt={copy.updatedAt}
        intro={copy.intro}
        eyebrow={copy.eyebrow}
        updatedAtLabel={copy.updatedAtLabel}
      >
      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {copy.sections.introduction.title}
        </h2>
        <p className="mt-3">{copy.sections.introduction.body}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {copy.sections.dataCollected.title}
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">
              {copy.sections.dataCollected.providedTitle}
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {copy.sections.dataCollected.providedItems.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">
              {copy.sections.dataCollected.automaticTitle}
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {copy.sections.dataCollected.automaticItems.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {copy.sections.legalBasis.title}
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {copy.sections.legalBasis.items.map(item => (
            <li key={item.label}>
              <strong>{item.label}:</strong> {item.text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.rights.title}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {copy.sections.rights.items.map(item => (
            <li key={item.label}>
              <strong>{item.label}:</strong> {item.text}
            </li>
          ))}
        </ul>
        <p className="mt-4">{copy.sections.rights.footnote}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {copy.sections.retention.title}
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {copy.sections.retention.items.map(item => (
            <li key={item.label}>
              <strong>{item.label}:</strong> {item.text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.security.title}</h2>
        <p className="mt-3">{copy.sections.security.lead}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {copy.sections.security.items.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.sharing.title}</h2>
        <p className="mt-3">{copy.sections.sharing.lead}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {copy.sections.sharing.items.map(item => (
            <li key={item.label}>
              <strong>{item.label}:</strong> {item.text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.changes.title}</h2>
        <p className="mt-3">{copy.sections.changes.body}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.sections.contact.title}</h2>
        <p className="mt-3">{copy.sections.contact.lead}</p>
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4">
          <p className="font-semibold text-[var(--foreground)]">{copy.sections.contact.cardTitle}</p>
          <p className="mt-2 text-[var(--foreground-soft)]">
            {copy.sections.contact.contactPrefix}{' '}
            <Link href="/contacto" className="text-[var(--accent)] underline-offset-2 hover:underline">
              {copy.sections.contact.contactLink}
            </Link>{' '}
            {copy.sections.contact.contactSuffix}
          </p>
          <p className="mt-2 text-[var(--foreground-soft)]">{copy.sections.contact.accountNote}</p>
        </div>
      </section>

        <section>
          <p className="mt-8 border-t pt-6 text-sm text-[var(--foreground-soft)]">
            {copy.sections.legalNote} {copy.updatedAtLabel}: {copy.updatedAt}
          </p>
        </section>
      </LegalPage>
    </main>
  )
}
