'use client'

import { signIn } from 'next-auth/react'
import { MOCK_OAUTH_PROVIDER_ID } from '@/lib/auth-mock-oauth'

interface Props {
  callbackUrl: string
}

export function OAuthTriggerButton({ callbackUrl }: Props) {
  return (
    <button
      type="button"
      data-testid="mock-oauth-trigger"
      onClick={() => {
        void signIn(MOCK_OAUTH_PROVIDER_ID, { callbackUrl })
      }}
      className="rounded-md bg-emerald-600 px-4 py-2 text-white"
    >
      Trigger Mock OAuth
    </button>
  )
}
