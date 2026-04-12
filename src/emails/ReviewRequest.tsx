import { Button, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface ReviewRequestEmailProps {
  customerName: string
  orderNumber: string
  orderId: string
  products: Array<{ name: string; vendorName: string }>
  locale?: 'es' | 'en'
}

interface Copy {
  preview: (ctx: { order: string }) => string
  heading: (ctx: { name: string }) => string
  intro: (ctx: { order: string }) => string
  listTitle: string
  cta: string
  footer: string
}

const COPY: Record<'es' | 'en', Copy> = {
  es: {
    preview: ctx => `¿Cómo fue tu pedido #${ctx.order}? Deja tu reseña`,
    heading: ctx => `¡Gracias por tu compra, ${ctx.name}!`,
    intro: ctx =>
      `Tu pedido #${ctx.order} ha sido entregado. Nos encantaría saber qué te ha parecido — tu reseña ayuda a otros compradores y a los productores locales.`,
    listTitle: 'Productos de tu pedido:',
    cta: 'Deja tu reseña',
    footer: 'Si tienes cualquier duda, responde a este correo o usa el formulario de contacto.',
  },
  en: {
    preview: ctx => `How was order #${ctx.order}? Leave a review`,
    heading: ctx => `Thanks for your purchase, ${ctx.name}!`,
    intro: ctx =>
      `Your order #${ctx.order} has been delivered. We would love to know what you thought — your review helps other shoppers and local producers.`,
    listTitle: 'Products in your order:',
    cta: 'Leave a review',
    footer: 'If you have any questions, reply to this email or use the contact form.',
  },
}

export function ReviewRequestEmail({
  customerName,
  orderNumber,
  orderId,
  products,
  locale = 'es',
}: ReviewRequestEmailProps) {
  const copy = COPY[locale]

  return (
    <Html>
      <Head />
      <Preview>{copy.preview({ order: orderNumber })}</Preview>
      <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>Marketplace</Text>
        </Section>

        <Section>
          <Text style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
            {copy.heading({ name: customerName })}
          </Text>
          <Text style={{ color: '#666', marginBottom: '20px' }}>
            {copy.intro({ order: orderNumber })}
          </Text>
        </Section>

        <Section style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px' }}>
          <Text style={{ fontWeight: 'bold', marginBottom: '10px' }}>{copy.listTitle}</Text>
          {products.map((product, idx) => (
            <Text key={idx} style={{ margin: '6px 0', color: '#333' }}>
              • {product.name} <span style={{ color: '#888' }}>— {product.vendorName}</span>
            </Text>
          ))}
        </Section>

        <Section style={{ marginTop: '30px', textAlign: 'center' }}>
          <Button
            href={`${appUrl}/cuenta/pedidos/${orderId}#reseñas`}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              padding: '12px 30px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            ⭐ {copy.cta}
          </Button>
        </Section>

        <Hr style={{ margin: '30px 0', borderColor: '#e5e7eb' }} />

        <Section style={{ color: '#999', fontSize: '12px', textAlign: 'center' }}>
          <Text>{copy.footer}</Text>
        </Section>
      </Container>
    </Html>
  )
}
