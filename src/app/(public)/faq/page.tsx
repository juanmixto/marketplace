import type { Metadata } from 'next'
import Link from 'next/link'
import { buildPageMetadata } from '@/lib/seo'
import { getPublicPageCopy } from '@/i18n/public-page-copy'
import { getServerLocale } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).faq

  return buildPageMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: '/faq',
  })
}

export default async function FAQ() {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).faq

  return (
    <main className="bg-surface">
      <section className="relative overflow-hidden bg-gradient-to-b from-accent-soft to-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-5xl font-bold text-foreground">{copy.heroTitle}</h1>
          <p className="mb-8 text-xl text-foreground-soft">{copy.heroBody}</p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="space-y-12">
            {copy.sections.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                <h2 className="mb-6 text-2xl font-bold text-foreground">{section.category}</h2>

                <div className="space-y-4">
                  {section.questions.map((faq, qIdx) => (
                    <details
                      key={qIdx}
                      className="group rounded-lg border border-border bg-surface p-6 transition-shadow hover:shadow-md"
                    >
                      <summary className="flex cursor-pointer items-center justify-between font-semibold text-foreground hover:text-accent">
                        <span>{faq.q}</span>
                        <span className="text-accent transition-transform group-open:rotate-180">▼</span>
                      </summary>
                      <p className="mt-4 text-foreground-soft">{faq.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-accent-soft px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground">{copy.ctaTitle}</h2>
          <p className="mb-6 text-lg text-foreground-soft">{copy.ctaBody}</p>
          <Link
            href="/contacto"
            className="inline-block rounded-lg bg-accent px-8 py-4 font-semibold text-white hover:bg-accent-hover"
          >
            {copy.ctaButton}
          </Link>
        </div>
      </section>
    </main>
  )
}
