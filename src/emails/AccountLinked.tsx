import { Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'

interface AccountLinkedEmailProps {
  userName: string
  providerLabel: string
  linkedAt: Date
  ipAddress?: string | null
  securityUrl: string
  supportEmail: string
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  apple: 'Apple',
  microsoft: 'Microsoft',
}

/**
 * Sent after a user adds a social provider to their account via the
 * /login/link password gate. Mirrors the security-notification
 * pattern (gmail/dropbox/etc.) so a user who didn't initiate the
 * link can react quickly. Includes:
 *
 *   - The provider name (Google / Apple / ...).
 *   - When it was linked.
 *   - The IP address of the actor (best-effort — behind tunnels we
 *     get the cf-connecting-ip; in dev we may get nothing).
 *   - A direct link to the security settings page where they can
 *     unlink the provider.
 *   - A support contact for the "this wasn't me" case.
 */
export function AccountLinkedEmail({
  userName,
  providerLabel,
  linkedAt,
  ipAddress,
  securityUrl,
  supportEmail,
}: AccountLinkedEmailProps) {
  const human = PROVIDER_LABELS[providerLabel.toLowerCase()] ?? providerLabel
  const dateStr = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(linkedAt)

  return (
    <Html>
      <Head />
      <Preview>{`Has vinculado ${human} a tu cuenta`}</Preview>
      <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
            Marketplace
          </Text>
        </Section>

        <Section>
          <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Hola {userName},
          </Text>
          <Text style={{ color: '#374151', marginBottom: '20px' }}>
            Acabamos de vincular tu cuenta de {human} con tu cuenta de Marketplace.
            A partir de ahora puedes iniciar sesión con cualquiera de los dos métodos.
          </Text>
        </Section>

        <Section
          style={{
            backgroundColor: '#f9fafb',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <Text style={{ fontSize: '13px', color: '#374151', margin: '4px 0' }}>
            <strong>Proveedor:</strong> {human}
          </Text>
          <Text style={{ fontSize: '13px', color: '#374151', margin: '4px 0' }}>
            <strong>Fecha:</strong> {dateStr}
          </Text>
          {ipAddress ? (
            <Text style={{ fontSize: '13px', color: '#374151', margin: '4px 0' }}>
              <strong>IP:</strong> {ipAddress}
            </Text>
          ) : null}
        </Section>

        <Section
          style={{
            border: '1px solid #fecaca',
            backgroundColor: '#fef2f2',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#991b1b', marginBottom: '6px' }}>
            ¿No fuiste tú?
          </Text>
          <Text style={{ fontSize: '13px', color: '#991b1b', margin: '4px 0' }}>
            Si no reconoces esta acción, alguien podría tener acceso a tu cuenta.
            Cambia tu contraseña ahora y desvincula el proveedor desde tu{' '}
            <a href={securityUrl} style={{ color: '#991b1b', textDecoration: 'underline' }}>
              configuración de seguridad
            </a>
            , o contacta con nosotros en{' '}
            <a href={`mailto:${supportEmail}`} style={{ color: '#991b1b', textDecoration: 'underline' }}>
              {supportEmail}
            </a>
            .
          </Text>
        </Section>

        <Hr style={{ margin: '30px 0', borderColor: '#e5e7eb' }} />

        <Section style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center' }}>
          <Text>Marketplace · Notificación de seguridad</Text>
        </Section>
      </Container>
    </Html>
  )
}
