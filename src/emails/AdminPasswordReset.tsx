import { Button, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'

interface AdminPasswordResetEmailProps {
  userName: string
  resetLink: string
}

export function AdminPasswordResetEmail({ userName, resetLink }: AdminPasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Marketplace password</Preview>
      <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <Section style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
            Marketplace
          </Text>
        </Section>

        <Section>
          <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Hello, {userName}
          </Text>
          <Text style={{ color: '#666', marginBottom: '20px' }}>
            We have prepared a secure link so you can set a new password.
            If you were not expecting this message, you can safely ignore it.
          </Text>
        </Section>

        <Section style={{ textAlign: 'center', marginTop: '30px', marginBottom: '30px' }}>
          <Button
            href={resetLink}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              padding: '12px 30px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Set new password
          </Button>
        </Section>

        <Section style={{ backgroundColor: '#f9fafb', padding: '15px', borderRadius: '8px' }}>
          <Text style={{ fontSize: '12px', color: '#666' }}>
            Or copy and paste this link into your browser:
          </Text>
          <Text style={{ fontSize: '11px', color: '#999', wordBreak: 'break-all' }}>
            {resetLink}
          </Text>
        </Section>

        <Section style={{ marginTop: '20px' }}>
          <Text style={{ color: '#999', fontSize: '12px' }}>
            This link expires in 1 hour and can only be used once.
          </Text>
        </Section>

        <Hr style={{ margin: '30px 0', borderColor: '#e5e7eb' }} />

        <Section style={{ color: '#999', fontSize: '12px', textAlign: 'center' }}>
          <Text>Marketplace - Your trusted marketplace</Text>
        </Section>
      </Container>
    </Html>
  )
}
