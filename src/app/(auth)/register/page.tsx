'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { trackAnalyticsEvent } from '@/lib/analytics'
import { useT } from '@/i18n'

export default function RegisterPage() {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setLoading(true)

    const data = new FormData(e.currentTarget)
    const body = {
      firstName: data.get('firstName'),
      lastName: data.get('lastName'),
      email: data.get('email'),
      password: data.get('password'),
    }

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json()
      setError(err.message || t('register.errorFallback'))
      setLoading(false)
      return
    }

    const result = await res.json()
    trackAnalyticsEvent('sign_up', {
    setSuccessMessage(result.message || t('register.successMessage'))
    trackAnalyticsEvent('sign_up', {
      method: 'credentials',
      user_role: 'CUSTOMER',
    })
    setSuccessMessage(result.message || t('register.successMessage'))
    setLoading(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('register.title')}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">{t('register.tagline')}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            name="firstName"
            autoComplete="given-name"
            label={t('register.firstName')}
            placeholder={t('register.firstNamePlaceholder')}
            required
          />
          <Input
            name="lastName"
            autoComplete="family-name"
            label={t('register.lastName')}
            placeholder={t('register.lastNamePlaceholder')}
            required
          />
        </div>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          label={t('register.email')}
          placeholder={t('register.emailPlaceholder')}
          required
        />
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          label={t('register.password')}
          placeholder={t('register.passwordPlaceholder')}
          minLength={8}
          required
        />

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
            {error}
          </p>
        )}

        {successMessage && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">
            {successMessage}{' '}
            <Link href="/login" className="font-semibold underline underline-offset-2">
              {t('register.goToLogin')}
            </Link>
          </p>
        )}

        <Button type="submit" className="w-full" isLoading={loading} size="lg">
          {t('register.submit')}
        </Button>

        <p className="text-center text-xs text-[var(--muted)]">
          {t('register.termsPrefix')}{' '}
          <Link href="/terminos" className="rounded-sm text-emerald-600 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">
            {t('register.termsLink')}
          </Link>
          {' '}{t('register.termsAnd')}{' '}
          <Link href="/privacidad" className="rounded-sm text-emerald-600 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">
            {t('register.privacyLink')}
          </Link>
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        {t('register.haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
          {t('register.signIn')}
        </Link>
      </p>
    </div>
  )
}
