import { Button, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'

interface Props {
  userName: string
  loginUrl: string
  forgotPasswordUrl: string
}

/**
 * Sent when someone submits the registration form with an email that
 * already has an account (#1283).
 *
 * The previous response — HTTP 409 — let an enumeration script learn
 * which emails are registered without ever seeing the inbox. Now the
 * server always returns 200 with the same copy as a fresh registration,
 * and the existing-account branch differentiates ONLY in the mailbox.
 *
 * The email is intentionally low-friction: no scary "incident" framing.
 * Most of the time it's the legitimate user who forgot they signed up,
 * not an attacker. So we point them to login + forgot-password and
 * leave the security wording out.
 */
export function RegisterAttemptOnExistingAccountEmail({ userName, loginUrl, forgotPasswordUrl }: Props) {
  return (
    <Html>
      <Head />
      <Preview>Ya tienes una cuenta en Marketplace</Preview>
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
            Hemos recibido un intento de registro con tu email. Como ya tienes una cuenta
            con nosotros, no hace falta crear otra: inicia sesión con tu contraseña habitual.
          </Text>
          <Text style={{ color: '#374151', marginBottom: '20px' }}>
            Si no recuerdas la contraseña, puedes restablecerla en un par de clics.
          </Text>
        </Section>

        <Section style={{ textAlign: 'center', marginTop: '30px', marginBottom: '20px' }}>
          <Button
            href={loginUrl}
            style={{
              backgroundColor: '#10b981',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '6px',
              fontWeight: 'bold',
              textDecoration: 'none',
            }}
          >
            Iniciar sesión
          </Button>
        </Section>

        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '13px', color: '#6b7280' }}>
            ¿Olvidaste la contraseña?{' '}
            <a href={forgotPasswordUrl} style={{ color: '#10b981', textDecoration: 'underline' }}>
              Restablécela aquí
            </a>
            .
          </Text>
        </Section>

        <Hr style={{ margin: '30px 0', borderColor: '#e5e7eb' }} />

        <Section style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center' }}>
          <Text>
            Si no fuiste tú quien intentó registrarse, ignora este email — nadie ha tenido acceso a tu
            cuenta y no se ha modificado nada.
          </Text>
          <Text>Marketplace · Notificación automática</Text>
        </Section>
      </Container>
    </Html>
  )
}
