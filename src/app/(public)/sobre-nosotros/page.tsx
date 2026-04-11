import type { Metadata } from 'next'
import Link from 'next/link'
import { buildPageMetadata } from '@/lib/seo'
import { getPublicPageCopy } from '@/i18n/public-page-copy'
import { getServerLocale } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).aboutUs

  return buildPageMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: '/sobre-nosotros',
  })
}

export default async function SobreNosotros() {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).aboutUs

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
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="mb-4 text-3xl font-bold text-foreground">{copy.missionTitle}</h2>
              <p className="mb-4 text-lg text-foreground-soft">{copy.missionBody1}</p>
              <p className="text-lg text-foreground-soft">{copy.missionBody2}</p>
            </div>
            <div className="rounded-lg bg-surface-raised p-8">
              <p className="mb-6 text-5xl">🌍</p>
              <p className="font-semibold text-foreground">{copy.missionQuote}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface-raised px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">{copy.valuesTitle}</h2>

          <div className="grid gap-8 md:grid-cols-3">
            {copy.values.map((value, idx) => (
              <div key={`${value.title}-${idx}`} className="rounded-lg border border-border bg-surface p-6 text-center">
                <p className="mb-3 text-4xl">{value.icon}</p>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{value.title}</h3>
                <p className="text-sm text-foreground-soft">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-3xl font-bold text-foreground">{copy.storyTitle}</h2>

          <div className="space-y-6 text-lg text-foreground-soft">
            {copy.storyParagraphs.map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-accent px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-6 md:grid-cols-3">
            {copy.principles.map(item => (
              <div key={item.title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)] shadow-sm">
                <p className="mb-2 text-lg font-semibold text-[var(--foreground)]">{item.title}</p>
                <p className="text-sm leading-6 text-[var(--foreground-soft)]">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-6 text-4xl font-bold text-foreground">{copy.ctaTitle}</h2>
          <p className="mb-8 text-xl text-foreground-soft">{copy.ctaBody}</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/productos"
              className="inline-block rounded-lg bg-accent px-8 py-4 font-semibold text-white hover:bg-accent-hover"
            >
              {copy.ctaProducts}
            </Link>
            <Link
              href="/como-vender"
              className="inline-block rounded-lg border-2 border-accent px-8 py-4 font-semibold text-accent hover:bg-accent-soft"
            >
              {copy.ctaSell}
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
