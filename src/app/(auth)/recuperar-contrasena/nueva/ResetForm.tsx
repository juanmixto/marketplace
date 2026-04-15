'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useT } from '@/i18n'

const resetSchema = z.object({
  password: z.string().min(8, 'resetPassword.passwordMin8'),
  confirmPassword: z.string().min(8),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'resetPassword.passwordsDoNotMatch',
  path: ['confirmPassword'],
})

type ResetFormData = z.infer<typeof resetSchema>

interface ResetFormProps {
  token: string
}

export function ResetForm({ token }: ResetFormProps) {
  const router = useRouter()
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  })

  const onSubmit = async (data: ResetFormData) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: data.password,
          passwordConfirm: data.confirmPassword,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || t('resetPassword.errorUpdate'))
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetPassword.processingError'))
    } finally {
      setLoading(false)
    }
  }

  // Zod messages are stored as i18n keys so the form can swap language
  // at runtime without re-running the resolver.
  const passwordErrorKey = errors.password?.message
  const confirmErrorKey = errors.confirmPassword?.message
  const passwordErrorText = passwordErrorKey ? t(passwordErrorKey as Parameters<typeof t>[0]) : null
  const confirmErrorText = confirmErrorKey ? t(confirmErrorKey as Parameters<typeof t>[0]) : null

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Success message */}
      {success && (
        <div className="rounded-lg bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <p>✓ {t('resetPassword.successMessage')}</p>
          <p className="text-sm">{t('resetPassword.successRedirectShort')}</p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950/40 dark:text-red-300">
          ✗ {error}
        </div>
      )}

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-900 dark:text-[var(--foreground)]">
          {t('resetPassword.newPasswordLabelStar')}
        </label>
        <input
          {...register('password')}
          type="password"
          id="password"
          autoComplete="new-password"
          placeholder={t('resetPassword.passwordPlaceholder')}
          className="mt-2 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-[var(--border)] dark:bg-[var(--surface-raised)] dark:text-[var(--foreground)] dark:placeholder-[var(--muted-light)] dark:focus:ring-emerald-900/60"
        />
        {passwordErrorText && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{passwordErrorText}</p>}
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-900 dark:text-[var(--foreground)]">
          {t('resetPassword.confirmLabelStar')}
        </label>
        <input
          {...register('confirmPassword')}
          type="password"
          id="confirmPassword"
          autoComplete="new-password"
          placeholder={t('resetPassword.confirmPlaceholderAlt')}
          className="mt-2 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-[var(--border)] dark:bg-[var(--surface-raised)] dark:text-[var(--foreground)] dark:placeholder-[var(--muted-light)] dark:focus:ring-emerald-900/60"
        />
        {confirmErrorText && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{confirmErrorText}</p>}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading || success}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? t('resetPassword.submitting') : success ? t('resetPassword.submitted') : t('resetPassword.submitAlt')}
      </button>
    </form>
  )
}
