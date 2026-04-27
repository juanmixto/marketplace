import type { Metadata } from 'next'
import Link from 'next/link'
import { buildPageMetadata } from '@/lib/seo'
import { getServerLocale } from '@/i18n/server'

// Plain ES+EN copy resolved server-side. We deliberately skip the typed
// public-page-copy.ts contract here for the same reason as /envios:
// policy text in flux, easier to iterate without the contract overhead.
// Source: docs/business/04-modelo-negocio-comisiones.md § Devoluciones
// + ADR-007 (14 días, comprador paga vuelta).

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return buildPageMetadata({
    title: locale === 'en' ? 'Returns policy' : 'Política de devoluciones',
    description:
      locale === 'en'
        ? '14-day return window, conditions, who pays return shipping and refund timeline.'
        : '14 días para devolver, condiciones, quién paga el envío de vuelta y plazo de reembolso.',
    path: '/devoluciones',
  })
}

export default async function DevolucionesPage() {
  const locale = await getServerLocale()
  const isEn = locale === 'en'
  return (
    <main className="bg-surface">
      <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-3 text-3xl font-bold text-[var(--foreground)]">
          {isEn ? 'Returns' : 'Devoluciones'}
        </h1>
        <p className="mb-8 text-[var(--muted)]">
          {isEn
            ? 'You have 14 days from delivery to return any product. Below is everything else you might want to know before you buy.'
            : 'Tienes 14 días desde la entrega para devolver cualquier producto. Abajo te contamos lo demás que conviene saber antes de comprar.'}
        </p>

        <Section title={isEn ? 'Return window' : 'Plazo de devolución'}>
          <p>
            {isEn
              ? '14 calendar days from the moment the order is delivered. Write to us within that window through the contact page or by reply to your order confirmation email.'
              : '14 días naturales desde el momento de la entrega. Escríbenos dentro de ese plazo a través de la página de contacto o respondiendo al email de confirmación de pedido.'}
          </p>
        </Section>

        <Section title={isEn ? 'Condition of the product' : 'Estado del producto'}>
          <p>
            {isEn
              ? 'Sealed and unopened products: full refund. Opened or partially consumed products: only accepted if there is a defect or quality issue (see below).'
              : 'Producto precintado y sin abrir: reembolso completo. Producto abierto o parcialmente consumido: sólo se acepta si hay un defecto o problema de calidad (ver abajo).'}
          </p>
          <p>
            {isEn
              ? 'Perishable products without defect (cheese, fresh produce) are non-returnable for hygiene reasons — but if there is any quality issue we always make it right.'
              : 'Los productos perecederos sin defecto (queso, fresco) no se pueden devolver por motivos de higiene — pero si hay cualquier problema de calidad siempre lo solucionamos.'}
          </p>
        </Section>

        <Section title={isEn ? 'Who pays return shipping' : 'Quién paga el envío de vuelta'}>
          <p>
            {isEn
              ? 'Defective product, wrong product, damage in transit: we cover the return shipping. You change your mind: you cover the return shipping.'
              : 'Producto defectuoso, producto equivocado, daño en transporte: el envío de vuelta lo pagamos nosotros. Cambias de opinión: el envío de vuelta lo pagas tú.'}
          </p>
        </Section>

        <Section title={isEn ? 'Refund timing' : 'Plazo de reembolso'}>
          <p>
            {isEn
              ? 'We process the refund within 3 working days of receiving the returned product, by the same payment method you used. The bank can take an extra 2–5 days to display it.'
              : 'Procesamos el reembolso en 3 días laborables desde la recepción del producto devuelto, por el mismo método de pago que usaste. El banco puede tardar 2–5 días adicionales en mostrarlo.'}
          </p>
        </Section>

        <Section title={isEn ? 'Quality issues' : 'Problemas de calidad'}>
          <p>
            {isEn
              ? 'If the product does not match the photo, the description, or what you reasonably expected, write to us with a photo and a short note. We refund without arguing inside the return window.'
              : 'Si el producto no coincide con la foto, con la descripción o con lo que esperabas razonablemente, escríbenos con una foto y una nota corta. Dentro del plazo de devolución reembolsamos sin discutir.'}
          </p>
        </Section>

        <p className="mt-8 text-sm text-[var(--muted)]">
          {isEn ? 'Shipping conditions are covered separately: ' : 'Las condiciones de envío tienen su propia página: '}
          <Link href="/envios" className="underline">
            {isEn ? 'Shipping policy' : 'Política de envíos'}
          </Link>
          .
        </p>
      </article>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">{title}</h2>
      <div className="space-y-2 text-[var(--foreground-soft)] leading-relaxed">{children}</div>
    </section>
  )
}
