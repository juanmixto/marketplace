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
  const actionLabel = targetActive ? 'Desbloquear cuenta' : 'Bloquear cuenta'
  const verb = targetActive ? 'desbloquear' : 'bloquear'
  const vendorHint = useMemo(() => {
    if (targetActive && vendorStatus === 'SUSPENDED_TEMP') {
      return 'El productor volverá a ACTIVE si la cuenta se reactiva.'
    }
    if (!targetActive && vendorStatus === 'ACTIVE') {
      return 'El productor asociado pasará a SUSPENDED_TEMP para mantener coherencia operativa.'
    }
    return null
  }, [targetActive, vendorStatus])

  if (!canChangeState || isDeleted) return null

  async function handleSubmit() {
    setError(null)
    setSuccess(null)
    if (confirmation.trim().toLowerCase() !== email.trim().toLowerCase()) {
      setError('Escribe el email exacto para confirmar.')
      return
    }

    setLoading(true)
    try {
      const result = await setAdminUserActiveState(userId, targetActive)
      setSuccess(
        result.isActive
          ? 'Cuenta reactivada y sesión invalidada para tokens viejos.'
          : 'Cuenta bloqueada e invalidación de sesión registrada.'
      )
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado')
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
            ? 'Bloquea la cuenta y marca la sesión como revocada en servidor.'
            : 'Reactiva la cuenta si el caso de soporte ya está resuelto.'}
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${actionLabel} de forma segura`}
        size="sm"
      >
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-sm text-[var(--foreground-soft)]">
              Vas a <strong>{verb}</strong> la cuenta de <strong>{email}</strong>.
            </p>
            <p className="text-sm text-[var(--muted)]">
              Esta acción queda auditada y puede invalidar la sesión actual en servidor.
            </p>
            {vendorHint && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                {vendorHint}
              </p>
            )}
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
            <Button variant="danger" size="sm" isLoading={loading} onClick={handleSubmit} className="sm:min-w-40">
              {actionLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
