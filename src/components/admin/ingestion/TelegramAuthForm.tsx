'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { startTelegramAuth, verifyTelegramAuth } from '@/domains/ingestion/telegram/actions'

interface PendingConnection {
  id: string
  label: string
  createdAt: Date
}

interface Props {
  pendingConnections: PendingConnection[]
}

type Step = 'idle' | 'codeSent' | 'passwordNeeded'

export function TelegramAuthForm({ pendingConnections }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<Step>('idle')
  const [label, setLabel] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    startTransition(async () => {
      try {
        const res = await startTelegramAuth({ label, phoneNumber })
        setConnectionId(res.connectionId)
        setStep('codeSent')
        setInfo('Código enviado. Revisa tu app de Telegram y mete el código.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!connectionId) return
    startTransition(async () => {
      try {
        await verifyTelegramAuth({
          connectionId,
          code,
          password: password || undefined,
        })
        setStep('idle')
        setLabel('')
        setPhoneNumber('')
        setCode('')
        setPassword('')
        setConnectionId(null)
        setInfo('Conexión activada. Ya puedes listar y habilitar chats.')
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error'
        // The action throws TelegramActionError with reason tags. The
        // client can't import the class (server-action boundary), but
        // the message typically contains the cue.
        if (/password/i.test(msg) || /2fa/i.test(msg) || /two-step/i.test(msg)) {
          setStep('passwordNeeded')
          setError('La cuenta tiene 2FA. Introduce la contraseña de verificación en dos pasos.')
        } else {
          setError(msg)
        }
      }
    })
  }

  const selectPending = (conn: PendingConnection) => {
    setConnectionId(conn.id)
    setLabel(conn.label)
    setStep('codeSent')
    setInfo('Reanudando verificación de una conexión pendiente.')
  }

  return (
    <div className="space-y-4">
      {pendingConnections.length > 0 && step === 'idle' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-200">
          <p className="font-semibold">Conexiones pendientes de verificar:</p>
          <ul className="mt-2 space-y-1">
            {pendingConnections.map((conn) => (
              <li key={conn.id} className="flex items-center justify-between gap-2">
                <span>
                  {conn.label} · <span className="font-mono text-[10px]">{conn.id.slice(0, 10)}…</span>
                </span>
                <button
                  type="button"
                  onClick={() => selectPending(conn)}
                  className="rounded border border-amber-500/40 px-2 py-0.5 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
                >
                  Reanudar →
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 'idle' && (
        <form onSubmit={handleStart} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="block font-medium text-[var(--muted-foreground)]">
              Etiqueta (interna)
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              maxLength={80}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              placeholder="ej. Operador principal"
            />
          </label>
          <label className="text-xs">
            <span className="block font-medium text-[var(--muted-foreground)]">
              Número de teléfono (con prefijo)
            </span>
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              pattern="^\+?[0-9]{7,16}$"
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 font-mono text-sm"
              placeholder="+34600112233"
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Enviando…' : 'Enviar código'}
            </Button>
          </div>
        </form>
      )}

      {(step === 'codeSent' || step === 'passwordNeeded') && (
        <form onSubmit={handleVerify} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="block font-medium text-[var(--muted-foreground)]">
              Código recibido en Telegram
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={12}
              autoComplete="one-time-code"
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 font-mono text-lg tracking-widest"
              placeholder="12345"
            />
          </label>
          {step === 'passwordNeeded' && (
            <label className="text-xs">
              <span className="block font-medium text-[var(--muted-foreground)]">
                Contraseña 2FA (Two-Step Verification)
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </label>
          )}
          <div className="sm:col-span-2 flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Verificando…' : 'Verificar'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setStep('idle')
                setConnectionId(null)
                setCode('')
                setPassword('')
                setError(null)
                setInfo(null)
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-50/60 px-3 py-2 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </p>
      )}
      {info && !error && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-300">
          {info}
        </p>
      )}
    </div>
  )
}
