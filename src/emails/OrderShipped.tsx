import { Button, Container, Head, Hr, Html, Link, Preview, Section, Text } from '@react-email/components'

interface OrderShippedEmailProps {
  customerName: string
  orderNumber: string
  trackingCode?: string
  carrierUrl?: string
}

export function OrderShippedEmail({
  customerName,
  orderNumber,
  trackingCode,
  carrierUrl,
}: OrderShippedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Tu pedido #{orderNumber} está en camino</Preview>
      <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
            Marketplace
          </Text>
        </Section>

        <Section>
          <Text style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
            Tu pedido está en camino, {customerName}!
          </Text>
          <Text style={{ color: '#666', marginBottom: '20px' }}>
            El pedido #{orderNumber} ha sido enviado. Aquí está la información de seguimiento:
          </Text>
        </Section>

        <Section style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px' }}>
          <Text style={{ marginBottom: '15px' }}>
            <strong>Número de pedido:</strong> {orderNumber}
          </Text>
          {trackingCode && (
            <>
              <Text style={{ marginBottom: '15px' }}>
                <strong>Código de seguimiento:</strong> {trackingCode}
              </Text>
              {carrierUrl && (
                <Button
                  href={carrierUrl}
                  style={{
                    backgroundColor: '#10b981',
                    color: '#fff',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                  }}
                >
                  Seguir Envío
                </Button>
              )}
            </>
          )}
        </Section>

        <Section style={{ marginTop: '30px', textAlign: 'center' }}>
          <Button
            href={`https://marketplace.local/cuenta/pedidos/${orderNumber}`}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              padding: '12px 30px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Ver Detalles del Pedido
          </Button>
        </Section>

        <Hr style={{ margin: '30px 0', borderColor: '#e5e7eb' }} />

        <Section style={{ color: '#999', fontSize: '12px', textAlign: 'center' }}>
          <Text>Si tienes preguntas: support@marketplace.local</Text>
        </Section>
      </Container>
    </Html>
  )
}
