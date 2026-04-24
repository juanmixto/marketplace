/**
 * Email service client
 * Handles transactional email sending via Resend
 */

import { Resend } from 'resend'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

let resend: Resend | null = null

function getResendClient() {
  const apiKey = getServerEnv().resendApiKey

  if (!apiKey) {
    return null
  }

  if (!resend) {
    resend = new Resend(apiKey)
  }

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
  const client = getResendClient()

  if (!client) {
    console.warn('[Email] RESEND_API_KEY not configured, skipping email to:', to)
    return
  }

  try {
    const result = await client.emails.send({
      from: getServerEnv().emailFrom,
      to,
      subject,
      react,
    })

    if (result.error) {
      throw new Error(`Email send failed: ${result.error.message}`)
    }

    // info-level: a successful send is operationally interesting
    // but not an error. console.info is consistent with the
    // structured-log scope used elsewhere ([Email] prefix).
    console.info(`[Email] Sent to ${to}: ${subject}`)
    return result
  } catch (error) {
    logger.error('email.send_failed', { to, subject, error })
    throw error
  }
}
