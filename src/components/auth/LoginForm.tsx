'use client'

import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n'
import {
  ArrowLeftIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import {
  getLoginPortalMode,
  normalizeAuthRedirectUrl,
  sanitizeCallbackUrl,
  STOREFRONT_PATH,
} from '@/lib/portals'

interface LoginFormProps {
  callbackUrl?: string
}

type Step = 'credentials' | 'totp'

export function LoginForm({ callbackUrl = '/' }: LoginFormProps) {
  const router = useRouter()
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl) ?? STOREFRONT_PATH
  const portalMode = getLoginPortalMode(safeCallbackUrl)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  // Admin-only two-step flow (#: two-step admin login). Step 1 collects
  // email+password and pings /api/auth/login-precheck to learn whether
  // 2FA is required (false when the trusted-device cookie is valid or
  // the admin hasn't enrolled yet). Step 2, when needed, collects the
  // TOTP code plus an opt-in "remember this device 30 days" checkbox.
  const [step, setStep] = useState<Step>('credentials')
  const [totpCode, setTotpCode] = useState('')
  const [rememberDevice, setRememberDevice] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null)
  const t = useT()

  useEffect(() => {
    setMounted(true)
  }, [])

  const isAdminPortal = portalMode === 'admin'

  async function completeSignIn(
    credentials: { email: string; password: string },
    opts: { totp?: string; remember?: boolean }
  ) {
    const payload: Record<string, string> = { email: credentials.email, password: credentials.password }
    if (opts.totp) payload.totpCode = opts.totp
    if (opts.remember) payload.rememberDevice = '1'

    const signInWithRetry = async () => {
      let lastError: unknown = null

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await signIn('credentials', {
            ...payload,
            redirect: false,
            callbackUrl: safeCallbackUrl,
          })
        } catch (error) {
          lastError = error
          if (attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 250))
            continue
          }
        }
      }

      throw lastError ?? new Error('signIn failed')
    }

    let result
    try {
      result = await signInWithRetry()
    } catch {
      setError(t('login.error.generic'))
      setLoading(false)
      return
    }

    if (result?.error) {
      setError(t('login.error.invalidCredentials'))
      setLoading(false)
      return
    }

    const destination = normalizeAuthRedirectUrl(result?.url) ?? safeCallbackUrl
    const nextUrl = destination.startsWith('/')
      ? new URL(destination, window.location.origin).toString()
      : destination
    window.location.assign(nextUrl)
    router.refresh()
  }

  async function handleCredentialsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')

    // Buyer / vendor portals have no 2FA surface — go straight to
    // signIn and let authorize() do its thing.
    if (!isAdminPortal) {
      await completeSignIn({ email, password }, {})
      return
    }

    try {
      const res = await fetch('/api/auth/login-precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (res.status === 429) {
        setError(t('login.error.tooManyAttempts'))
        setLoading(false)
        return
      }

      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; needs2fa?: boolean }
        | null

      if (!data || !data.ok) {
        setError(t('login.error.invalidCredentials'))
        setLoading(false)
        return
      }

      if (data.needs2fa) {
        setPendingCredentials({ email, password })
        setStep('totp')
        setLoading(false)
        return
      }

      // Password is valid and no 2FA step is required (either the
      // admin hasn't enrolled yet — in which case the proxy will
      // redirect to /admin/security/enroll — or a trusted-device
      // cookie is still valid).
      await completeSignIn({ email, password }, {})
    } catch {
      setError(t('login.error.generic'))
      setLoading(false)
    }
  }

  async function handleTotpSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    if (!pendingCredentials) {
      setError(t('login.error.generic'))
      setLoading(false)
      return
    }
    await completeSignIn(pendingCredentials, { totp: totpCode, remember: rememberDevice })
  }

  function backToCredentials() {
    setStep('credentials')
    setTotpCode('')
    setPendingCredentials(null)
    setError(null)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--foreground)]">Iniciar sesión</h1>

      {step === 'credentials' && (
        <form onSubmit={handleCredentialsSubmit} className="mt-6 space-y-4">
          <Input
            name="email"
            type="email"
            label="Email"
            placeholder="tu@email.com"
            autoComplete="email"
            required
          />
          <div className="relative">
            <Input
              name="password"
              type={showPass ? 'text' : 'password'}
              label="Contraseña"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              className="absolute right-3 top-8 rounded-md p-1 text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
            >
              {showPass ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center rounded-md px-2 py-2 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <Button type="submit" className="w-full" disabled={!mounted} isLoading={loading} size="lg">
            {isAdminPortal ? t('login.continue') : 'Iniciar sesión'}
          </Button>
        </form>
      )}

      {step === 'totp' && (
        <form onSubmit={handleTotpSubmit} className="mt-6 space-y-4">
          <button
            type="button"
            onClick={backToCredentials}
            className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {t('login.back')}
          </button>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--foreground-soft)]">
            {t('login.totp.description')}
          </div>

          <Input
            name="totpCode"
            type="text"
            inputMode="numeric"
            label={t('login.totp.label')}
            placeholder="000000"
            autoComplete="one-time-code"
            pattern="\d{6,10}"
            value={totpCode}
            onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
            required
          />

          <label className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={e => setRememberDevice(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              <span className="font-medium text-[var(--foreground)]">
                {t('login.totp.rememberDevice')}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {t('login.totp.rememberDeviceHint')}
              </span>
            </span>
          </label>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" isLoading={loading} size="lg">
            {t('login.totp.submit')}
          </Button>
        </form>
      )}

      {process.env.NEXT_PUBLIC_SHOW_DEMO_CREDS === 'true' && step === 'credentials' && (
        <div className="mt-4 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] p-3">
          <p className="text-xs font-medium text-[var(--muted)] mb-1">Credenciales de prueba:</p>
          <div className="text-xs text-[var(--foreground-soft)] space-y-0.5">
            <p>Admin: <code>admin@marketplace.com</code> / <code>admin1234</code></p>
            <p>Productor: <code>productor@test.com</code> / <code>vendor1234</code></p>
            <p>Cliente: <code>cliente@test.com</code> / <code>cliente1234</code></p>
          </div>
        </div>
      )}

      {step === 'credentials' && (
        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          ¿No tienes cuenta?{' '}
          <Link href="/register" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
            Regístrate gratis
          </Link>
        </p>
      )}
    </div>
  )
}
