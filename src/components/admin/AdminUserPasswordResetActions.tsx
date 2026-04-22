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
      setError('Escribe el email exacto para confirmar.')
      return
    }

    setLoading(true)
    try {
      const result = await requestAdminUserPasswordReset(userId)
      setSuccess(`Reset solicitado para ${result.emailMasked}. El enlace se envió por email.`)
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo solicitar el reset')
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
          Enviar reset password
        </Button>
        <p className="text-xs text-[var(--muted)]">
          Genera un enlace seguro y auditable sin revelar la contraseña actual.
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Enviar reset password"
        size="sm"
      >
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-sm text-[var(--foreground-soft)]">
              Vas a enviar un reset password para <strong>{email}</strong>.
            </p>
            <p className="text-sm text-[var(--muted)]">
              La acción queda auditada y el usuario recibirá un enlace seguro por email.
            </p>
          </div>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-[var(--foreground-soft)]">
              Escribe el email para confirmar
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
              Cancelar
            </Button>
            <Button variant="primary" size="sm" isLoading={loading} onClick={handleSubmit} className="sm:min-w-36">
              Enviar reset
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
