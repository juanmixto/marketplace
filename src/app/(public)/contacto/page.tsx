import type { Metadata } from 'next'
import { ContactForm } from './ContactForm'
import { buildPageMetadata } from '@/lib/seo'
import { BRAND_CLAIMS } from '@/domains/vendors/brand-claims'
import { getPublicPageCopy } from '@/i18n/public-page-copy'
import { getServerLocale } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).contact

  return buildPageMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: '/contacto',
  })
}

export default async function Contacto() {
  const locale = await getServerLocale()
  const copy = getPublicPageCopy(locale).contact

  return (
    <main className="min-h-screen bg-surface px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-foreground">{copy.heroTitle}</h1>
          <p className="text-lg text-foreground-soft">{copy.heroBody}</p>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          <div className="space-y-8">
            <div>
              <h2 className="mb-6 text-2xl font-bold text-foreground">{copy.infoTitle}</h2>

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground">{copy.generalSupport}</h3>
                  <p className="mt-1 text-foreground-soft">
                    <a href="mailto:hola@mercadoproductor.es" className="text-accent hover:underline">
                      hola@mercadoproductor.es
                    </a>
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">{copy.orderSupport}</h3>
                  <p className="mt-1 text-foreground-soft">
                    <a href="mailto:soporte@mercadoproductor.es" className="text-accent hover:underline">
                      soporte@mercadoproductor.es
                    </a>
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">{copy.producers}</h3>
                  <p className="mt-1 text-foreground-soft">
                    <a href="mailto:productores@mercadoproductor.es" className="text-accent hover:underline">
                      productores@mercadoproductor.es
                    </a>
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">{copy.legal}</h3>
                  <p className="mt-1 text-foreground-soft">
                    <a href="mailto:legal@mercadoproductor.es" className="text-accent hover:underline">
                      legal@mercadoproductor.es
                    </a>
                  </p>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold text-foreground">{copy.hoursTitle}</h3>
                  <p className="mt-1 text-foreground-soft">{copy.hoursBody}</p>
                  <p className="mt-1 text-sm text-muted">{BRAND_CLAIMS.supportHours.text}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-raised p-8">
            <h2 className="mb-6 text-2xl font-bold text-foreground">{copy.formTitle}</h2>
            <ContactForm />
          </div>
        </div>
      </div>
    </main>
  )
}
