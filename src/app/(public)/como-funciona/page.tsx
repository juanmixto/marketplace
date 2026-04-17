import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRightIcon,
  ShoppingBagIcon,
  TruckIcon,
  CheckCircleIcon,
  CreditCardIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { buildPageMetadata } from '@/lib/seo'
import { getPublicPageCopy } from '@/i18n/public-page-copy'
import { getServerLocale } from '@/i18n/server'

const stepIcons = [SparklesIcon, ShoppingBagIcon, CreditCardIcon, TruckIcon, CheckCircleIcon] as const

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).howItWorks

  return buildPageMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: '/como-funciona',
  })
}

export default async function ComoFunciona() {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).howItWorks

  return (
    <main className="bg-surface">
      <section className="relative overflow-hidden bg-gradient-to-b from-accent-soft to-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-5xl font-bold text-foreground">{copy.heroTitle}</h1>
          <p className="mb-8 text-xl text-foreground-soft">{copy.heroBody}</p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="space-y-12">
            {copy.steps.map((step, idx) => {
              const Icon = stepIcons[idx] ?? stepIcons[0]
              const isLast = idx === copy.steps.length - 1

              return (
                <div key={`${idx + 1}-${step.title}`}>
                  <div className="flex gap-6">
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-bold text-white">
                      {idx + 1}
                    </div>

                    <div className="flex-1 pt-1">
                      <div className="mb-2 flex items-start gap-3">
                        <Icon className="mt-1 h-6 w-6 flex-shrink-0 text-accent" />
                        <h3 className="text-2xl font-bold text-foreground">{step.title}</h3>
                      </div>
                      <p className="text-lg text-foreground-soft">{step.description}</p>
                    </div>
                  </div>

                  {!isLast && (
                    <div className="ml-8 mt-6 flex justify-center">
                      <ArrowRightIcon className="h-6 w-6 rotate-90 text-accent-soft" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-surface-raised px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">{copy.advantagesTitle}</h2>

          <div className="grid gap-8 md:grid-cols-2">
            {copy.advantages.map((item, idx) => (
              <div key={`${item.title}-${idx}`} className="rounded-lg border border-border bg-surface p-6">
                <p className="mb-3 text-4xl">{item.icon}</p>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="text-foreground-soft">{item.description}</p>
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
              href="/productores"
              className="inline-block rounded-lg border-2 border-accent px-8 py-4 font-semibold text-accent hover:bg-accent-soft"
            >
              {copy.ctaProducers}
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
