import type { Metadata } from 'next'
import Link from 'next/link'
import { buildPageMetadata } from '@/lib/seo'
import { getServerLocale } from '@/i18n/server'

// Plain ES+EN copy resolved server-side. We deliberately skip the typed
// public-page-copy.ts contract here: this is policy-adjacent text that
// will likely need legal review and tweaks soon, and the typed contract
// adds friction without value while the wording is in flux. Migrate to
// public-page-copy.ts once the copy stabilises.
// Source: docs/business/05-logistica-operaciones.md (SLA + packaging) and
// docs/business/04-modelo-negocio-comisiones.md § Envío.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return buildPageMetadata({
    title: locale === 'en' ? 'Shipping policy' : 'Política de envíos',
    description:
      locale === 'en'
        ? 'Delivery times, shipping costs, carriers and what happens if no one is at home.'
        : 'Plazos de entrega, costes de envío, transportistas y qué pasa si no hay nadie para recibir.',
    path: '/envios',
  })
}

export default async function EnviosPage() {
  const locale = await getServerLocale()
  const isEn = locale === 'en'
  return (
    <main className="bg-surface">
      <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-3 text-3xl font-bold text-[var(--foreground)]">
          {isEn ? 'Shipping' : 'Envíos'}
        </h1>
        <p className="mb-8 text-[var(--muted)]">
          {isEn
            ? 'Each producer ships their own orders directly to you. We coordinate, track and step in if anything goes wrong.'
            : 'Cada productor envía sus pedidos directamente a tu casa. Nosotros coordinamos, hacemos seguimiento y entramos si algo va mal.'}
        </p>

        <Section title={isEn ? 'Delivery times' : 'Plazos de entrega'}>
          <p>
            {isEn
              ? 'Mainland Spain: 3–5 working days from order confirmation. Up to 7 working days in peak periods. Balearics, Canary Islands, Ceuta and Melilla are not covered at launch.'
              : 'Península: 3–5 días laborables desde la confirmación del pedido. Hasta 7 días laborables en picos. Baleares, Canarias, Ceuta y Melilla no se cubren en el lanzamiento.'}
          </p>
          <p>
            {isEn
              ? "Each producer's preparation time is at most 2 working days. The carrier handles the remaining 1–3 days."
              : 'Cada productor prepara el pedido en máximo 2 días laborables. El transportista cubre los 1–3 días restantes.'}
          </p>
        </Section>

        <Section title={isEn ? 'Shipping cost' : 'Coste de envío'}>
          <p>
            {isEn
              ? 'The exact cost is shown on the product page (estimate) and recomputed at checkout once you enter your postal code. The price you see at the last checkout step is the price you pay — there are no surprise fees.'
              : 'El coste exacto se muestra en la ficha de producto (estimado) y se recalcula en el checkout cuando introduces tu código postal. El precio que ves en el último paso es el que pagas — sin sorpresas.'}
          </p>
          <p>
            {isEn
              ? 'Cross-producer orders are charged shipping per producer at launch — we do not consolidate yet.'
              : 'Los pedidos con productos de varios productores tienen envío independiente por productor en el lanzamiento — todavía no consolidamos envíos.'}
          </p>
        </Section>

        <Section title={isEn ? 'Carriers' : 'Transportistas'}>
          <p>
            {isEn
              ? 'We use established Spanish carriers (Correos Express, SEUR, GLS) depending on the producer and the destination. The exact carrier and tracking link arrive in the shipping confirmation email.'
              : 'Usamos transportistas españoles establecidos (Correos Express, SEUR, GLS) según el productor y el destino. El transportista concreto y el enlace de seguimiento llegan en el email de confirmación de envío.'}
          </p>
        </Section>

        <Section title={isEn ? 'No one at home?' : '¿No hay nadie para recibir?'}>
          <p>
            {isEn
              ? 'The carrier will leave a note and attempt redelivery. If you miss two attempts, the parcel is returned and we contact you to arrange a new shipment (you cover the new shipping cost) or refund minus the original shipping.'
              : 'El transportista deja aviso e intenta una segunda entrega. Si fallan dos intentos, el paquete vuelve y te contactamos para acordar un nuevo envío (con el coste a tu cargo) o devolverte el dinero menos el envío original.'}
          </p>
        </Section>

        <Section title={isEn ? 'Damaged on arrival or lost' : 'Producto dañado o pedido perdido'}>
          <p>
            {isEn
              ? 'If your order arrives damaged or never arrives, write to us within 7 days of delivery (or expected delivery). We replace it or refund — you do not chase the carrier yourself.'
              : 'Si el pedido llega dañado o no llega, escríbenos en los 7 días siguientes a la entrega (o a la fecha estimada). Reponemos o devolvemos — el seguimiento con el transportista lo hacemos nosotros.'}
          </p>
        </Section>

        <p className="mt-8 text-sm text-[var(--muted)]">
          {isEn ? 'Returns are covered separately: ' : 'Las devoluciones tienen su propia página: '}
          <Link href="/devoluciones" className="underline">
            {isEn ? 'Returns policy' : 'Política de devoluciones'}
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
