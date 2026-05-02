import type { Metadata } from 'next'
import Link from 'next/link'
import { buildPageMetadata } from '@/lib/seo'
import { getServerLocale } from '@/i18n/server'

// Plain ES+EN copy resolved server-side. Skips the typed
// public-page-copy.ts contract on purpose — policy-adjacent text in
// flux. Migrate when wording stabilises.
//
// Policy: alimentación está exenta del derecho de desistimiento de 14
// días por ser perecedero / sellado por motivos de higiene
// (Art. 103.d/e RDL 1/2007 — Ley General para la Defensa de los
// Consumidores y Usuarios). Lo NO renunciable es la garantía de
// conformidad: defectos, equivocaciones, daño en transporte, calidad
// inferior a la descrita. Esto último siempre se acepta.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return buildPageMetadata({
    title: locale === 'en' ? 'Returns and refunds' : 'Devoluciones y reembolsos',
    description:
      locale === 'en'
        ? "Food products can't be returned for change of mind. Defects, wrong items, transit damage and quality issues are always covered."
        : 'Los productos alimentarios no se devuelven por cambio de opinión. Defectos, errores de envío, daños en transporte y problemas de calidad sí los cubrimos siempre.',
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
          {isEn ? 'Returns and refunds' : 'Devoluciones y reembolsos'}
        </h1>
        <p className="mb-8 text-[var(--muted)]">
          {isEn
            ? "All our products are food. We don't accept returns for change of mind, but we always solve any quality problem with the product or its delivery — no questions asked."
            : 'Todos nuestros productos son alimentación. No aceptamos devoluciones por cambio de opinión, pero sí resolvemos siempre cualquier problema de calidad del producto o de la entrega — sin preguntar.'}
        </p>

        <Section title={isEn ? 'No returns for change of mind' : 'No hay devolución por cambio de opinión'}>
          <p>
            {isEn
              ? 'By Spanish consumer law (Art. 103 of Royal Legislative Decree 1/2007), food products are exempt from the 14-day right of withdrawal: they are perishable and, once unsealed, cannot be returned for hygiene reasons.'
              : 'Por la ley española (Art. 103 del Real Decreto Legislativo 1/2007 General de Consumidores y Usuarios), los productos alimentarios están exentos del derecho de desistimiento de 14 días: son perecederos y, una vez abiertos, no pueden devolverse por motivos de higiene.'}
          </p>
          <p>
            {isEn
              ? "Concretely: if you order a product, receive it correctly, and then realise you'd rather not have it, we cannot take it back. Please order with that in mind, especially with bigger formats."
              : 'En concreto: si pides un producto, llega correctamente, y luego decides que no lo quieres, no podemos recogerlo. Pídelo con eso en mente, especialmente en formatos grandes.'}
          </p>
        </Section>

        <Section title={isEn ? 'What we do cover, always' : 'Qué sí cubrimos siempre'}>
          <p>
            {isEn
              ? 'These are non-negotiable consumer protections that apply regardless of the food exemption above. Write to us within 7 days of delivery (or expected delivery) and we replace the product or refund — no friction.'
              : 'Esto es protección al consumidor que no se renuncia nunca, independientemente de la exención de alimentación. Escríbenos en los 7 días siguientes a la entrega (o a la fecha estimada) y reponemos o devolvemos el dinero, sin fricción.'}
          </p>
          <ul className="ml-6 list-disc space-y-1 text-[var(--foreground-soft)]">
            <li>
              {isEn
                ? 'The product arrives damaged or broken in transit.'
                : 'El producto llega dañado o roto por el transporte.'}
            </li>
            <li>
              {isEn
                ? 'We sent the wrong product or quantity.'
                : 'Te enviamos un producto o cantidad equivocados.'}
            </li>
            <li>
              {isEn
                ? 'The product is defective or has a quality problem (e.g., the cheese is spoiled, the oil tastes off, the jar is half-empty).'
                : 'El producto está defectuoso o tiene un problema de calidad (p. ej. el queso ha cuajado mal, el aceite tiene un sabor raro, el bote viene a medio llenar).'}
            </li>
            <li>
              {isEn
                ? "What you receive doesn't match what was photographed or described in the listing."
                : 'Lo que recibes no se corresponde con lo que aparece en la foto o en la descripción de la ficha.'}
            </li>
            <li>
              {isEn
                ? 'The order never arrives or is lost by the carrier.'
                : 'El pedido no llega o se pierde durante el transporte.'}
            </li>
          </ul>
        </Section>

        <Section title={isEn ? 'How we resolve it' : 'Cómo lo resolvemos'}>
          <p>
            {isEn
              ? 'Send us a quick email with a photo and the order number. We answer within 24 working hours. Depending on the case we replace the product, refund the affected lines, or refund the whole order — whichever fits your case.'
              : 'Mándanos un email corto con una foto y el número de pedido. Respondemos en las 24 horas hábiles siguientes. Según el caso, reponemos el producto, reembolsamos las líneas afectadas, o reembolsamos el pedido entero — lo que tenga sentido para tu caso.'}
          </p>
          <p>
            {isEn
              ? 'When we owe you a refund: same payment method, processed within 3 working days; the bank can take 2–5 extra days to display it.'
              : 'Cuando te toca reembolso: por el mismo método de pago, procesado en 3 días laborables; el banco puede tardar 2–5 días extra en mostrarlo.'}
          </p>
          <p>
            {isEn
              ? "When the issue was caused by the carrier or the producer, you don't deal with anyone — we handle that for you."
              : 'Si el problema fue del transporte o del productor, tú no negocias con nadie — lo gestionamos nosotros.'}
          </p>
        </Section>

        <Section title={isEn ? 'What does NOT count as a quality issue' : 'Qué NO cuenta como problema de calidad'}>
          <p>
            {isEn
              ? "Artisan products vary slightly batch by batch — that's the point. Subtle differences in colour, size, texture or flavour between two units of the same SKU are normal and not grounds for refund."
              : 'Los productos artesanos varían ligeramente entre lotes — esa es la gracia. Pequeñas diferencias de color, tamaño, textura o sabor entre dos unidades del mismo SKU son normales y no son motivo de reembolso.'}
          </p>
          <p>
            {isEn
              ? 'If you have any doubt, write to us anyway. We always read every email and we always respond.'
              : 'Si tienes cualquier duda, escríbenos igual. Siempre leemos todos los emails y siempre respondemos.'}
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
