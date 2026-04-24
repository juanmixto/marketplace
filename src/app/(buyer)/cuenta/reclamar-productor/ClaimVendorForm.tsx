'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { claimGhostVendor } from '@/domains/vendors/claim'

export function ClaimVendorForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
          try {
            const result = await claimGhostVendor({ code })
            // Send them straight to the vendor dashboard where they
            // will complete profile + Stripe onboarding via the
            // existing UI.
            router.push(`/vendor/dashboard?reclamado=${result.vendorSlug}`)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Error desconocido')
          }
        })
      }}
    >
      <label className="block">
        <span className="block text-sm font-medium text-[var(--foreground)]">
          Código de reclamación
        </span>
        <input
          name="code"
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="AB2CD3EF"
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-lg tracking-widest text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          required
        />
        <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
          8 caracteres, letras y números. Sin espacios. Distingue mayúsculas.
        </span>
      </label>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-50/60 px-3 py-2 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || code.length !== 8}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
      >
        {isPending ? 'Validando…' : 'Reclamar'}
      </button>
    </form>
  )
}
