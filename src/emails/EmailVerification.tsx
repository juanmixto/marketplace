import { Button, Container, Head, Hr, Html, Link, Preview, Section, Text } from '@react-email/components'

interface EmailVerificationEmailProps {
  userName: string
  verificationLink: string
}

export function EmailVerificationEmail({ userName, verificationLink }: EmailVerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Verifica tu email en Marketplace</Preview>
      <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
            Marketplace
          </Text>
        </Section>

        <Section>
          <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Bienvenido, {userName}!
          </Text>
          <Text style={{ color: '#666', marginBottom: '20px' }}>
            Para completar tu registro, por favor verifica tu dirección de email haciendo clic en el botón
            abajo:
          </Text>
        </Section>

        <Section style={{ textAlign: 'center', marginTop: '30px', marginBottom: '30px' }}>
          <Button
            href={verificationLink}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              padding: '12px 30px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Verificar Email
          </Button>
        </Section>

        <Section style={{ backgroundColor: '#f9fafb', padding: '15px', borderRadius: '8px' }}>
          <Text style={{ fontSize: '12px', color: '#666' }}>
            O copia y pega este enlace en tu navegador:
          </Text>
          <Text style={{ fontSize: '11px', color: '#999', wordBreak: 'break-all' }}>
            {verificationLink}
          </Text>
        </Section>

        <Section style={{ marginTop: '20px' }}>
          <Text style={{ color: '#999', fontSize: '12px' }}>
            Este enlace expira en 24 horas. Si no solicitaste esta verificación, ignora este email.
          </Text>
        </Section>

        <Hr style={{ margin: '30px 0', borderColor: '#e5e7eb' }} />

        <Section style={{ color: '#999', fontSize: '12px', textAlign: 'center' }}>
          <Text>Marketplace - Tu mercado de confianza</Text>
        </Section>
      </Container>
    </Html>
  )
}
