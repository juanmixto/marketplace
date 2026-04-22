'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { requestAdminUserPasswordReset } from '@/domains/admin/users/actions'

interface Props {
  userId: string
  email: string
  canReset: boolean
  isDeleted: boolean
}

export function AdminUserPasswordResetActions({ userId, email, canReset, isDeleted }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setConfirmation('')
      setError(null)
    }
  }, [open])

  if (!canReset || isDeleted) return null

  async function handleSubmit() {
    setError(null)
    setSuccess(null)

    if (confirmation.trim().toLowerCase() !== email.trim().toLowerCase()) {
      setError('Type the exact email to confirm.')
      return
    }

    setLoading(true)
    try {
      const result = await requestAdminUserPasswordReset(userId)
      setSuccess(`Password reset requested for ${result.emailMasked}. The link was sent by email.`)
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request the password reset')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="space-y-3">
        {success && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {success}
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => setOpen(true)}
          disabled={loading}
          className="w-full"
        >
          Send password reset
        </Button>
        <p className="text-xs text-[var(--muted)]">
          Generates a secure, auditable link without revealing the current password.
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send password reset"
        size="sm"
      >
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-sm text-[var(--foreground-soft)]">
              You are about to send a password reset for <strong>{email}</strong>.
            </p>
            <p className="text-sm text-[var(--muted)]">
              The action is audited and the user will receive a secure email link.
            </p>
          </div>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-[var(--foreground-soft)]">
              Type the email to confirm
            </span>
            <input
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder={email}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} className="sm:min-w-28">
              Cancel
            </Button>
            <Button variant="primary" size="sm" isLoading={loading} onClick={handleSubmit} className="sm:min-w-36">
              Send reset
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
