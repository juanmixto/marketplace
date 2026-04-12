import { Button, Container, Head, Hr, Html, Link, Preview, Row, Section, Text } from '@react-email/components'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface OrderConfirmationEmailProps {
  orderNumber: string
  customerName: string
  orderDate: string
  items: Array<{ name: string; quantity: number; price: number }>
  subtotal: number
  shipping: number
  tax: number
  total: number
}

export function OrderConfirmationEmail({
  orderNumber,
  customerName,
  orderDate,
  items,
  subtotal,
  shipping,
  tax,
  total,
}: OrderConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirmación de tu pedido #{orderNumber}</Preview>
      <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
            Marketplace
          </Text>
        </Section>

        <Section>
          <Text style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
            ¡Gracias por tu compra, {customerName}!
          </Text>
          <Text style={{ color: '#666', marginBottom: '20px' }}>
            Tu pedido #{orderNumber} ha sido confirmado. Aquí está el resumen:
          </Text>
        </Section>

        <Section style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px' }}>
          <Row>
            <Text style={{ fontWeight: 'bold', marginBottom: '10px' }}>Fecha de pedido: {orderDate}</Text>
          </Row>
          <Text style={{ fontSize: '12px', color: '#999', marginBottom: '15px' }}>
            Número de pedido: {orderNumber}
          </Text>

          {items.map((item, idx) => (
            <Row key={idx} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #e5e7eb' }}>
              <Text style={{ flex: 1 }}>
                {item.name} x {item.quantity}
              </Text>
              <Text style={{ textAlign: 'right' }}>€{(item.price * item.quantity).toFixed(2)}</Text>
            </Row>
          ))}

          <Hr style={{ margin: '15px 0', borderColor: '#e5e7eb' }} />

          <Row style={{ marginBottom: '10px' }}>
            <Text style={{ flex: 1 }}>Subtotal:</Text>
            <Text style={{ textAlign: 'right' }}>€{subtotal.toFixed(2)}</Text>
          </Row>
          <Row style={{ marginBottom: '10px' }}>
            <Text style={{ flex: 1 }}>Envío:</Text>
            <Text style={{ textAlign: 'right' }}>€{shipping.toFixed(2)}</Text>
          </Row>
          <Row style={{ marginBottom: '15px' }}>
            <Text style={{ flex: 1 }}>Impuestos:</Text>
            <Text style={{ textAlign: 'right' }}>€{tax.toFixed(2)}</Text>
          </Row>

          <Row style={{ backgroundColor: '#f0fdf4', padding: '10px', borderRadius: '6px' }}>
            <Text style={{ flex: 1, fontWeight: 'bold', color: '#10b981' }}>Total:</Text>
            <Text style={{ textAlign: 'right', fontWeight: 'bold', color: '#10b981', fontSize: '18px' }}>
              €{total.toFixed(2)}
            </Text>
          </Row>
        </Section>

        <Section style={{ marginTop: '30px', textAlign: 'center' }}>
          <Button
            href={`${appUrl}/cuenta/pedidos`}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              padding: '12px 30px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Ver Pedido
          </Button>
        </Section>

        <Hr style={{ margin: '30px 0', borderColor: '#e5e7eb' }} />

        <Section style={{ color: '#999', fontSize: '12px', textAlign: 'center' }}>
          <Text>Si tienes preguntas, responde a este correo o usa el formulario de contacto del sitio.</Text>
          <Text>
            <Link href={appUrl} style={{ color: '#10b981', textDecoration: 'none' }}>
              Visita nuestro sitio
            </Link>
          </Text>
        </Section>
      </Container>
    </Html>
  )
}
