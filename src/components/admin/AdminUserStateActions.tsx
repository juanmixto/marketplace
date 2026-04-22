'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { setAdminUserActiveState } from '@/domains/admin/users/actions'

interface Props {
  userId: string
  email: string
  isActive: boolean
  isDeleted: boolean
  vendorStatus?: string | null
  canChangeState: boolean
}

export function AdminUserStateActions({
  userId,
  email,
  isActive,
  isDeleted,
  vendorStatus,
  canChangeState,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setConfirmation('')
      setError(null)
    }
  }, [open])

  const targetActive = !isActive
  const actionLabel = targetActive ? 'Unblock account' : 'Block account'
  const verb = targetActive ? 'unblock' : 'block'
  const vendorHint = useMemo(() => {
    if (targetActive && vendorStatus === 'SUSPENDED_TEMP') {
      return 'The linked producer will return to ACTIVE if the account is reactivated.'
    }
    if (!targetActive && vendorStatus === 'ACTIVE') {
      return 'The linked producer will move to SUSPENDED_TEMP to keep the operational state consistent.'
    }
    return null
  }, [targetActive, vendorStatus])

  if (!canChangeState || isDeleted) return null

  async function handleSubmit() {
    setError(null)
    setSuccess(null)
    if (confirmation.trim().toLowerCase() !== email.trim().toLowerCase()) {
      setError('Type the exact email to confirm.')
      return
    }

    setLoading(true)
    try {
      const result = await setAdminUserActiveState(userId, targetActive)
      setSuccess(
        result.isActive
          ? 'Account reactivated and old tokens invalidated on the server.'
          : 'Account blocked and session invalidation recorded.'
      )
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update account state')
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
          variant={isActive ? 'danger' : 'primary'}
          size="md"
          onClick={() => setOpen(true)}
          disabled={loading}
          className="w-full"
        >
          {actionLabel}
        </Button>
        <p className="text-xs text-[var(--muted)]">
          {isActive
            ? 'Blocks the account and marks the session as revoked on the server.'
            : 'Reactivates the account once the support case is resolved.'}
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${actionLabel} securely`}
        size="sm"
      >
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-sm text-[var(--foreground-soft)]">
              You are about to <strong>{verb}</strong> the account for <strong>{email}</strong>.
            </p>
            <p className="text-sm text-[var(--muted)]">
              This action is audited and may invalidate the current server-side session.
            </p>
            {vendorHint && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                {vendorHint}
              </p>
            )}
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
            <Button variant="danger" size="sm" isLoading={loading} onClick={handleSubmit} className="sm:min-w-40">
              {actionLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
