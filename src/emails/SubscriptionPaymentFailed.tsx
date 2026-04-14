import { Button, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface Props {
  customerName: string
  productName: string
  vendorName: string
}

export function SubscriptionPaymentFailedEmail({
  customerName,
  productName,
  vendorName,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>No hemos podido cobrar tu suscripción a {productName}</Preview>
      <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
            Marketplace
          </Text>
        </Section>

        <Section>
          <Text style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px', color: '#b45309' }}>
            Hola {customerName}, hay un problema con tu pago
          </Text>
          <Text style={{ color: '#666', marginBottom: '20px' }}>
            No hemos podido cobrar la última renovación de tu suscripción a{' '}
            <strong>{productName}</strong> de {vendorName}. Esto suele pasar cuando
            la tarjeta ha caducado o el banco ha rechazado el cargo.
          </Text>
          <Text style={{ color: '#666', marginBottom: '20px' }}>
            No te preocupes — tu próxima entrega está en pausa hasta que
            confirmes un método de pago válido. Entra en tu cuenta para
            actualizarlo y reanudar la suscripción.
          </Text>
        </Section>

        <Section style={{ marginTop: '20px', textAlign: 'center' }}>
          <Button
            href={`${appUrl}/cuenta/suscripciones`}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              padding: '12px 30px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Actualizar método de pago
          </Button>
        </Section>

        <Hr style={{ margin: '30px 0', borderColor: '#e5e7eb' }} />
        <Section style={{ color: '#999', fontSize: '12px', textAlign: 'center' }}>
          <Text>
            Si crees que esto es un error, responde a este correo y te ayudaremos.
          </Text>
        </Section>
      </Container>
    </Html>
  )
}
