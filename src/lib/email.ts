/**
 * Email service client
 * Handles transactional email sending via Resend
 */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string
  subject: string
  react: React.ReactElement
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not configured, skipping email to:', to)
    return
  }

  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'no-reply@example.com',
      to,
      subject,
      react,
    })

    if (result.error) {
      throw new Error(`Email send failed: ${result.error.message}`)
    }

    console.log(`[Email] Sent to ${to}: ${subject}`)
    return result
  } catch (error) {
    console.error(`[Email] Error sending to ${to}:`, error)
    throw error
  }
}
