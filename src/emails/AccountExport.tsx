import { Button, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'

interface AccountExportEmailProps {
  userName: string
  claimLink: string
}

export function AccountExportEmail({ userName, claimLink }: AccountExportEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Tu descarga de datos está lista</Preview>
      <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
            Marketplace
          </Text>
        </Section>

        <Section>
          <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Hola, {userName}
          </Text>
          <Text style={{ color: '#666', marginBottom: '20px' }}>
            Has solicitado una copia de tus datos personales (derecho de acceso GDPR, artículo 15).
            Pulsa el botón para descargar el archivo. El enlace es de un solo uso y caduca en 1 hora.
          </Text>
        </Section>

        <Section style={{ textAlign: 'center', marginTop: '30px', marginBottom: '30px' }}>
          <Button
            href={claimLink}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              padding: '12px 30px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Descargar mis datos
          </Button>
        </Section>

        <Section style={{ backgroundColor: '#f9fafb', padding: '15px', borderRadius: '8px' }}>
          <Text style={{ fontSize: '12px', color: '#666' }}>
            O copia y pega este enlace en tu navegador:
          </Text>
          <Text style={{ fontSize: '11px', color: '#999', wordBreak: 'break-all' }}>
            {claimLink}
          </Text>
        </Section>

        <Section style={{ marginTop: '20px' }}>
          <Text style={{ color: '#999', fontSize: '12px' }}>
            Si no solicitaste esta descarga, ignora este email. Nadie podrá acceder a tus datos sin
            este enlace aunque tenga tu sesión abierta.
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
