'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import { submitLinkForm, type LinkActionResult } from '@/app/(auth)/login/link/actions'

interface Props {
  token: string
  email: string
  provider: string
}

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  apple: 'Apple',
}

function reasonToKey(reason: Exclude<LinkActionResult, { ok: true }>['reason']) {
  switch (reason) {
    case 'expired_token':
      return 'login.link.error.expired'
    case 'invalid_token':
      return 'login.link.error.invalidToken'
    case 'invalid_password':
      return 'login.link.error.invalidPassword'
    case 'rate_limited':
      return 'login.link.error.tooManyAttempts'
    case 'no_password_for_user':
      return 'login.link.error.noPassword'
    default:
      return 'login.link.error.generic'
  }
}

export function AuthLinkForm({ token, email, provider }: Props) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set('token', token)
    startTransition(async () => {
      const result = await submitLinkForm(formData)
      if (!result.ok) {
        setError(t(reasonToKey(result.reason) as Parameters<typeof t>[0]))
      }
    })
  }

  const providerLabel = PROVIDER_LABEL[provider] ?? provider

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('login.link.title')}</h1>
        <p className="mt-2 text-sm text-[var(--foreground-soft)]">
          {t('login.link.subtitle')
            .replace('{email}', email)
            .replace('{provider}', providerLabel)}
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          name="password"
          type="password"
          label={t('login.password')}
          autoComplete="current-password"
          required
        />
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" isLoading={pending} size="lg">
          {t('login.link.submit')}
        </Button>
      </form>
    </div>
  )
}
