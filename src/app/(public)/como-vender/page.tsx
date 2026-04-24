import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CheckCircleIcon,
  SparklesIcon,
  BanknotesIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  ClockIcon,
  BellAlertIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline'
import { buildPageMetadata } from '@/lib/seo'
import { getPublicPageCopy } from '@/i18n/public-page-copy'
import { getServerLocale } from '@/i18n/server'

const benefitIcons = [BanknotesIcon, SparklesIcon, ClockIcon, UserGroupIcon, ShieldCheckIcon, CheckCircleIcon] as const
const toolIcons = [BellAlertIcon, DevicePhoneMobileIcon] as const

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).sell

  return buildPageMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: '/como-vender',
  })
}

export default async function ComoVender() {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).sell

  return (
    <main className="bg-surface">
      <section className="relative overflow-hidden bg-gradient-to-b from-accent-soft to-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-5xl font-bold text-foreground">{copy.heroTitle}</h1>
          <p className="mb-8 text-xl text-foreground-soft">{copy.heroBody}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/cuenta/hazte-vendedor"
              className="rounded-lg bg-accent px-8 py-4 font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {copy.heroPrimaryCta}
            </Link>
            <Link
              href="/como-funciona"
              className="rounded-lg border-2 border-accent px-8 py-4 font-semibold text-accent transition-colors hover:bg-accent-soft"
            >
              {copy.heroSecondaryCta}
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">{copy.whyTitle}</h2>
          <p className="mb-12 text-center text-lg text-foreground-soft">{copy.whyBody}</p>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {copy.benefits.map((benefit, idx) => {
              const Icon = benefitIcons[idx] ?? benefitIcons[0]
              return (
                <div key={`${benefit.title}-${idx}`} className="rounded-lg border border-accent-soft bg-accent-soft p-6">
                  <Icon className="mb-4 h-8 w-8 text-accent" />
                  <h3 className="mb-2 font-semibold text-foreground">{benefit.title}</h3>
                  <p className="text-sm text-foreground-soft">{benefit.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-accent-soft px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">{copy.toolsTitle}</h2>
          <p className="mb-12 text-center text-lg text-foreground-soft">{copy.toolsBody}</p>

          <div className="grid gap-8 md:grid-cols-2">
            {copy.tools.map((tool, idx) => {
              const Icon = toolIcons[idx] ?? toolIcons[0]
              return (
                <div
                  key={`${tool.title}-${idx}`}
                  className="rounded-lg border-2 border-accent bg-surface p-8"
                >
                  <Icon className="mb-4 h-10 w-10 text-accent" />
                  <h3 className="mb-2 text-xl font-semibold text-foreground">{tool.title}</h3>
                  <p className="mb-4 text-foreground-soft">{tool.description}</p>
                  <ul className="space-y-2">
                    {tool.bullets.map(bullet => (
                      <li key={bullet} className="flex gap-2 text-sm text-foreground-soft">
                        <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-accent" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-surface-raised px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">{copy.pricingTitle}</h2>
          <p className="mb-8 text-center text-foreground-soft">{copy.pricingBody}</p>

          <div className="rounded-lg border-2 border-accent bg-surface p-8 text-center">
            <p className="mb-4 text-foreground-soft">{copy.pricingLabel}</p>
            <p className="mb-8 text-5xl font-bold text-accent">12%</p>
            <h3 className="mb-6 text-lg font-semibold text-foreground">{copy.pricingExample}</h3>
            <div className="space-y-2 text-left">
              <div className="flex justify-between">
                <span>{copy.pricingSellFor}</span>
                <strong className="text-accent">€10,00</strong>
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex justify-between text-foreground-soft">
                  <span>{copy.pricingCommission}</span>
                  <span>-€1,20</span>
                </div>
              </div>
              <div className="border-t-2 border-border-strong pt-2">
                <div className="flex justify-between">
                  <strong>{copy.pricingYouReceive}</strong>
                  <strong className="text-accent">€8,80</strong>
                </div>
              </div>
            </div>
            <p className="mt-6 text-sm text-foreground-soft">{copy.pricingFootnote}</p>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">{copy.stepsTitle}</h2>

          <div className="space-y-6">
            {copy.steps.map((step, idx) => (
              <div key={`${idx + 1}-${step.title}`} className="flex gap-6">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-accent font-bold text-white">
                  {idx + 1}
                </div>
                <div className="flex flex-col justify-center">
                  <h3 className="font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm text-foreground-soft">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-surface-raised px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-3xl font-bold text-foreground">{copy.requirementsTitle}</h2>

          <div className="space-y-4">
            {copy.requirements.map(requirement => (
              <div key={requirement} className="flex gap-4">
                <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-accent" />
                <p className="text-foreground-soft">{requirement}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-6 text-4xl font-bold text-foreground">{copy.ctaTitle}</h2>
          <p className="mb-8 text-xl text-foreground-soft">{copy.ctaBody}</p>
          <Link
            href="/cuenta/hazte-vendedor"
            className="rounded-lg bg-accent px-10 py-4 text-lg font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {copy.ctaPrimary}
          </Link>
          <p className="mt-6 text-sm text-foreground-soft">
            {copy.ctaFootnotePrefix}{' '}
            <Link href="/faq" className="font-semibold text-accent hover:underline">
              {copy.ctaFootnoteFaq}
            </Link>{' '}
            {copy.ctaFootnoteJoiner}{' '}
            <Link href="/contacto" className="font-semibold text-accent hover:underline">
              {copy.ctaFootnoteContact}
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
