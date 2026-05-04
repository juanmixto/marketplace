import bcrypt from 'bcryptjs'
import { createElement } from 'react'
import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  apiError,
  apiInternalError,
  apiUnauthorized,
  apiValidationFromZod,
} from '@/lib/api-response'
import { PROFILE_FIELD_LIMITS } from '@/shared/types/profile'
import { bumpTokenVersion } from '@/lib/auth-token-version'
import { createEmailVerificationToken } from '@/domains/auth/email-verification'
import { sendEmail } from '@/lib/email'
import { getServerEnv } from '@/lib/env'
import { EmailVerificationEmail } from '@/emails/EmailVerification'

// Shape mirrors @/shared/types/profile (single source of truth for field
// limits via PROFILE_FIELD_LIMITS); messages stay localized to ES here
// because the API surface speaks Spanish to the buyer client.
//
// #1143: when the email field changes we additionally require
// `currentPassword`. Schema validates either case but the runtime
// branch decides whether to demand re-auth based on the actual diff.
const profileSchema = z.object({
  firstName: z
    .string()
    .min(PROFILE_FIELD_LIMITS.firstName.min, 'El nombre es obligatorio')
    .max(PROFILE_FIELD_LIMITS.firstName.max, `Máximo ${PROFILE_FIELD_LIMITS.firstName.max} caracteres`),
  lastName: z
    .string()
    .min(PROFILE_FIELD_LIMITS.lastName.min, 'El apellido es obligatorio')
    .max(PROFILE_FIELD_LIMITS.lastName.max, `Máximo ${PROFILE_FIELD_LIMITS.lastName.max} caracteres`),
  email: z.string().email('Email inválido'),
  currentPassword: z.string().min(1).max(200).optional(),
})

export async function PUT(request: Request) {
  try {
    const session = await getActionSession()
    if (!session) {
      return apiUnauthorized()
    }

    const body = await request.json()
    const parsed = profileSchema.safeParse(body)
    if (!parsed.success) {
      return apiValidationFromZod(parsed.error)
    }
    const { firstName, lastName, email, currentPassword } = parsed.data

    const current = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
      },
    })
    if (!current) {
      return apiUnauthorized()
    }

    const normalizedEmail = email.trim().toLowerCase()
    const isEmailChange = normalizedEmail !== (current.email ?? '').trim().toLowerCase()

    // ── #1143: re-auth gate for email changes ──
    //
    // Without this, a stolen session is a 1-step ATO: change email →
    // forgot-password → reset → permanent takeover. Mirrors the
    // current-password gate in /api/account/delete.
    //
    // OAuth-only accounts (passwordHash null) cannot satisfy a
    // password challenge — for them the email change must be
    // bounced. The followup is a confirm-from-old-email flow tracked
    // separately.
    if (isEmailChange) {
      if (!current.passwordHash) {
        return apiError(
          'Para cambiar el email de una cuenta vinculada con Google necesitas confirmarlo desde el email actual.',
          409,
          'CONFLICT',
          { fieldErrors: { email: 'Confirma el cambio desde el email actual.' } },
        )
      }
      if (!currentPassword) {
        return apiError(
          'Confirma tu contraseña actual para cambiar el email.',
          400,
          'BAD_REQUEST',
          { fieldErrors: { currentPassword: 'Introduce tu contraseña actual.' } },
        )
      }
      const valid = await bcrypt.compare(currentPassword, current.passwordHash)
      if (!valid) {
        return apiError(
          'La contraseña actual es incorrecta.',
          401,
          'UNAUTHORIZED',
          { fieldErrors: { currentPassword: 'La contraseña actual es incorrecta.' } },
        )
      }

      // ── #1157: email enumeration ──
      //
      // The previous code returned 409 when the target email belonged
      // to another user, turning this endpoint into an oracle for
      // "is X registered?". Collapse the conflict into the success
      // path: don't perform the change, but respond exactly the same
      // as a successful one. The legitimate user with a clean change
      // gets the verification email; the attacker probing addresses
      // gets nothing actionable. We log internally so SOC can see
      // the pattern.
      const collision = await db.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      })
      if (collision && collision.id !== current.id) {
        logger.warn('api.buyers.profile.email_change_collision', {
          actorUserId: current.id,
          attemptedEmail: normalizedEmail,
        })
        return NextResponse.json({
          id: current.id,
          firstName,
          lastName,
          email: current.email,
          emailChangePending: true,
        })
      }
    }

    // Apply the update inside a transaction so the (potential) email
    // reset of `emailVerified` and the tokenVersion bump are atomic
    // with the user.update.
    const updated = await db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: current.id },
        data: {
          firstName,
          lastName,
          email: isEmailChange ? normalizedEmail : current.email,
          // #1143: a fresh email is unverified. Block login (the
          // credentials authorize() path already requires
          // emailVerified ≠ null) until the user clicks the link.
          ...(isEmailChange && { emailVerified: null }),
        },
      })
      if (isEmailChange) {
        // Tokens issued on the previous email must die; the upcoming
        // /verify-email link is the only valid way to confirm.
        await tx.emailVerificationToken.deleteMany({ where: { userId: current.id } })
        // #1142: bump tokenVersion so the active session is forced
        // to re-authenticate after an email change. Combined with
        // the emailVerified reset, the JWT will refresh, see the
        // updated user, and (in current credentials flow) the next
        // login will require verification.
        await bumpTokenVersion(current.id, tx)
      }
      return user
    })

    if (isEmailChange) {
      try {
        const verifyToken = await createEmailVerificationToken(current.id)
        const link = new URL('/api/auth/verify-email', getServerEnv().appUrl)
        link.searchParams.set('token', verifyToken)
        await sendEmail({
          to: updated.email,
          subject: 'Confirma tu nuevo email en Marketplace',
          react: createElement(EmailVerificationEmail, {
            userName: updated.firstName,
            verificationLink: link.toString(),
          }),
        })
      } catch (mailErr) {
        // Email infra is best-effort here — the email change committed,
        // and the user can re-trigger via the standard flow.
        logger.error('api.buyers.profile.email_change_mail_failed', {
          userId: current.id,
          error: mailErr,
        })
      }
    }

    return NextResponse.json({
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      ...(isEmailChange && { emailChangePending: true }),
    })
  } catch (error) {
    logger.error('api.buyers.profile.update_failed', { error })
    return apiInternalError('Error al actualizar perfil')
  }
}
