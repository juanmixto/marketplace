/**
 * Email service client
 * Handles transactional email sending via Resend
 */

import { Resend } from 'resend'

let resend: Resend | null = null

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) return null

  resend ??= new Resend(apiKey)
  return resend
}

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string
  subject: string
  react: React.ReactElement
}) {
  const resendClient = getResendClient()

  if (!resendClient) {
    console.warn('[Email] RESEND_API_KEY not configured, skipping email to:', to)
    return
  }

  try {
    const result = await resendClient.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@marketplace.local',
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
