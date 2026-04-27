'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useT } from '@/i18n'
import { capturePostHog } from '@/lib/posthog'

interface Props {
  callbackUrl: string
  googleEnabled: boolean
}

const GoogleLogo = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.708V4.96H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.04l3.007-2.332z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.292C4.672 5.163 6.656 3.58 9 3.58z"
    />
  </svg>
)

export function SocialButtonsClient({ callbackUrl, googleEnabled }: Props) {
  const t = useT()
  const [pending, setPending] = useState<string | null>(null)

  const onClick = async (provider: 'google') => {
    setPending(provider)
    // Canonical rollout event: numerator-denominator pair with the
    // server-side `auth.social.success` so PostHog can compute the
    // success rate. Captured BEFORE the redirect so the event ships
    // even if the navigation fails.
    capturePostHog('auth.social.start', { provider, callbackUrl })
    try {
      await signIn(provider, { callbackUrl })
    } catch {
      setPending(null)
      capturePostHog('auth.social.error', { provider, where: 'client_signin_threw' })
    }
  }

  if (!googleEnabled) return null

  return (
    <div className="flex flex-col gap-2 mb-4">
      <button
        type="button"
        onClick={() => onClick('google')}
        disabled={pending !== null}
        aria-label={t('login.social.googleAria')}
        aria-busy={pending === 'google'}
        data-testid="social-google-button"
        className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-slate-100 dark:text-slate-900 min-h-[44px]"
      >
        <GoogleLogo />
        <span>{t('login.social.google')}</span>
      </button>
      <div className="relative my-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-700" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-[var(--surface)] px-2 text-xs uppercase tracking-wide text-[var(--muted)]">
            {t('login.social.divider')}
          </span>
        </div>
      </div>
    </div>
  )
}
