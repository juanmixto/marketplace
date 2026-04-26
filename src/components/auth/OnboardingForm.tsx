'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import {
  completeOnboardingAction,
  type OnboardingActionResult,
} from '@/app/(auth)/onboarding/actions'

interface Props {
  firstName: string
  next: string
}

function reasonToKey(reason: Exclude<OnboardingActionResult, never>['reason']) {
  switch (reason) {
    case 'unauthenticated':
      return 'login.onboarding.error.unauthenticated' as const
    case 'consent_required':
      return 'login.onboarding.error.consentRequired' as const
    default:
      return 'login.onboarding.error.generic' as const
  }
}

export function OnboardingForm({ firstName, next }: Props) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set('next', next)
    startTransition(async () => {
      try {
        const result = await completeOnboardingAction(formData)
        // Action throws redirect on success — anything returned is an
        // error case.
        if (result && !result.ok) {
          setError(t(reasonToKey(result.reason)))
        }
      } catch {
        // Redirect signal propagated; nothing else to do.
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('login.onboarding.title')}</h1>
        <p className="mt-2 text-sm text-[var(--foreground-soft)]">
          {t('login.onboarding.greeting').replace('{firstName}', firstName)}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-1 h-4 w-4"
          />
          <span>
            {t('login.onboarding.consent.preLink')}{' '}
            <Link href="/terminos" className="underline">
              {t('login.onboarding.consent.terms')}
            </Link>
            {' '}{t('login.onboarding.consent.and')}{' '}
            <Link href="/privacidad" className="underline">
              {t('login.onboarding.consent.privacy')}
            </Link>
            {t('login.onboarding.consent.postLink')}
          </span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" isLoading={pending} size="lg">
          {t('login.onboarding.submit')}
        </Button>
      </form>
    </div>
  )
}
