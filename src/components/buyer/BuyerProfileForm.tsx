'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'

interface Props {
  user: {
    firstName: string
    lastName: string
    email: string
  }
}

export function BuyerProfileForm({ user }: Props) {
  const t = useT()
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const profileSchema = useMemo(
    () =>
      z.object({
        firstName: z.string().min(1, t('account.profile.errFirstNameRequired')).max(50),
        lastName: z.string().min(1, t('account.profile.errLastNameRequired')).max(50),
        email: z.string().email(t('account.profile.errEmailInvalid')),
      }),
    [t]
  )

  const passwordSchema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t('account.profile.errCurrentPasswordRequired')),
          newPassword: z.string().min(8, t('account.profile.errPasswordMin')),
          confirmPassword: z.string(),
        })
        .refine(data => data.newPassword === data.confirmPassword, {
          message: t('account.profile.errPasswordsDontMatch'),
          path: ['confirmPassword'],
        }),
    [t]
  )

  type ProfileFormInput = z.infer<typeof profileSchema>
  type PasswordFormInput = z.infer<typeof passwordSchema>

  const profileForm = useForm<ProfileFormInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
  })

  const passwordForm = useForm<PasswordFormInput>({
    resolver: zodResolver(passwordSchema),
  })

  const profileErrorMessage = (code: unknown, fallback: string): string => {
    switch (code) {
      case 'email_in_use':
        return t('account.profile.errEmailInUse')
      case 'invalid_data':
        return t('account.profile.errInvalidData')
      case 'unauthorized':
        return t('account.profile.errUnauthorized')
      default:
        return fallback
    }
  }

  const passwordErrorMessage = (code: unknown, fallback: string): string => {
    switch (code) {
      case 'current_password_incorrect':
        return t('account.profile.errCurrentPasswordIncorrect')
      case 'invalid_data':
        return t('account.profile.errInvalidData')
      case 'unauthorized':
        return t('account.profile.errUnauthorized')
      default:
        return fallback
    }
  }

  const onProfileSubmit = async (data: ProfileFormInput) => {
    setProfileError(null)
    setProfileSuccess(false)
    try {
      const res = await fetch('/api/buyers/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setProfileError(profileErrorMessage(err?.code, t('account.profile.errUpdateFailed')))
        return
      }

      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch {
      setProfileError(t('account.profile.errUpdateFailed'))
    }
  }

  const onPasswordSubmit = async (data: PasswordFormInput) => {
    setPasswordError(null)
    setPasswordSuccess(false)
    try {
      const res = await fetch('/api/buyers/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setPasswordError(passwordErrorMessage(err?.code, t('account.profile.errPasswordChangeFailed')))
        return
      }

      setPasswordSuccess(true)
      passwordForm.reset()
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch {
      setPasswordError(t('account.profile.errPasswordChangeFailed'))
    }
  }

  return (
    <div className="space-y-8">
      {/* Profile Section */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">{t('account.profile.personalInfo')}</h2>

        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.profile.firstName')}</label>
              <input
                {...profileForm.register('firstName')}
                className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {profileForm.formState.errors.firstName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{profileForm.formState.errors.firstName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.profile.lastName')}</label>
              <input
                {...profileForm.register('lastName')}
                className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {profileForm.formState.errors.lastName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{profileForm.formState.errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.profile.email')}</label>
            <input
              type="email"
              {...profileForm.register('email')}
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {profileForm.formState.errors.email && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{profileForm.formState.errors.email.message}</p>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={profileForm.formState.isSubmitting}>
              {profileForm.formState.isSubmitting ? t('account.profile.saving') : t('account.profile.save')}
            </Button>
            {profileSuccess && (
              <span className="inline-flex items-center text-sm text-emerald-600 dark:text-emerald-400">
                ✓ {t('account.profile.saved')}
              </span>
            )}
          </div>

          {profileError && (
            <div className="mt-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
              ✗ {profileError}
            </div>
          )}
        </form>
      </div>

      {/* Password Section */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">{t('account.profile.changePassword')}</h2>

        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.profile.currentPassword')}</label>
            <input
              type="password"
              {...passwordForm.register('currentPassword')}
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {passwordForm.formState.errors.currentPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordForm.formState.errors.currentPassword.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.profile.newPassword')}</label>
            <input
              type="password"
              {...passwordForm.register('newPassword')}
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {passwordForm.formState.errors.newPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordForm.formState.errors.newPassword.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.profile.confirmPassword')}</label>
            <input
              type="password"
              {...passwordForm.register('confirmPassword')}
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {passwordForm.formState.errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordForm.formState.errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
              {passwordForm.formState.isSubmitting ? t('account.profile.changingPassword') : t('account.profile.changePassword')}
            </Button>
            {passwordSuccess && (
              <span className="inline-flex items-center text-sm text-emerald-600 dark:text-emerald-400">
                ✓ {t('account.profile.passwordUpdated')}
              </span>
            )}
          </div>

          {passwordError && (
            <div className="mt-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
              ✗ {passwordError}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
