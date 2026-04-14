import { Button, Container, Head, Hr, Html, Preview, Row, Section, Text } from '@react-email/components'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface Props {
  customerName: string
  productName: string
  vendorName: string
  cadenceLabel: string
  amountEur: number
  nextDeliveryDate: string
}

export function SubscriptionRenewalChargedEmail({
  customerName,
  productName,
  vendorName,
  cadenceLabel,
  amountEur,
  nextDeliveryDate,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Tu suscripción a {productName} ha sido renovada</Preview>
      <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
            Marketplace
          </Text>
        </Section>

        <Section>
          <Text style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
            ¡Hola {customerName}!
          </Text>
          <Text style={{ color: '#666', marginBottom: '20px' }}>
            Hemos renovado tu suscripción a <strong>{productName}</strong> de{' '}
            {vendorName}. Se ha cargado el importe de <strong>€{amountEur.toFixed(2)}</strong> y
            estamos preparando tu próxima caja {cadenceLabel.toLowerCase()}.
          </Text>
        </Section>

        <Section style={{ backgroundColor: '#f0fdf4', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <Row style={{ marginBottom: '8px' }}>
            <Text style={{ fontWeight: 'bold' }}>Producto:</Text>
            <Text>{productName}</Text>
          </Row>
          <Row style={{ marginBottom: '8px' }}>
            <Text style={{ fontWeight: 'bold' }}>Productor:</Text>
            <Text>{vendorName}</Text>
          </Row>
          <Row style={{ marginBottom: '8px' }}>
            <Text style={{ fontWeight: 'bold' }}>Importe cobrado:</Text>
            <Text>€{amountEur.toFixed(2)}</Text>
          </Row>
          <Row>
            <Text style={{ fontWeight: 'bold' }}>Próxima entrega estimada:</Text>
            <Text>{nextDeliveryDate}</Text>
          </Row>
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
            Ver mis suscripciones
          </Button>
        </Section>

        <Hr style={{ margin: '30px 0', borderColor: '#e5e7eb' }} />
        <Section style={{ color: '#999', fontSize: '12px', textAlign: 'center' }}>
          <Text>
            Puedes saltarte la próxima entrega, pausar o cancelar cuando quieras desde tu cuenta.
          </Text>
        </Section>
      </Container>
    </Html>
  )
}
