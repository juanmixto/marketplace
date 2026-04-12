'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'

const profileSchema = z.object({
  firstName: z.string().min(1, 'Nombre requerido').max(50),
  lastName: z.string().min(1, 'Apellidos requeridos').max(50),
  email: z.string().email('Email inválido'),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida'),
  newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

type ProfileFormInput = z.infer<typeof profileSchema>
type PasswordFormInput = z.infer<typeof passwordSchema>

interface Props {
  user: {
    firstName: string
    lastName: string
    email: string
  }
}

export function BuyerProfileForm({ user }: Props) {
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profileForm = useForm<ProfileFormInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
  })

  const passwordForm = useForm<PasswordFormInput>({
    resolver: zodResolver(passwordSchema),
  })

  const onProfileSubmit = async (data: ProfileFormInput) => {
    try {
      setError(null)
      setProfileSuccess(false)

      const res = await fetch('/api/buyers/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Error al actualizar perfil')
      }

      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar perfil')
    }
  }

  const onPasswordSubmit = async (data: PasswordFormInput) => {
    try {
      setError(null)
      setPasswordSuccess(false)

      const res = await fetch('/api/buyers/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Error al cambiar contraseña')
      }

      setPasswordSuccess(true)
      passwordForm.reset()
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar contraseña')
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-300">
          ✗ {error}
        </div>
      )}

      {/* Profile Section */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Información personal</h2>

        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">Nombre</label>
              <input
                {...profileForm.register('firstName')}
                className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {profileForm.formState.errors.firstName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{profileForm.formState.errors.firstName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">Apellidos</label>
              <input
                {...profileForm.register('lastName')}
                className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {profileForm.formState.errors.lastName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{profileForm.formState.errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]">Email</label>
            <input
              type="email"
              {...profileForm.register('email')}
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {profileForm.formState.errors.email && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{profileForm.formState.errors.email.message}</p>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={profileForm.formState.isSubmitting}>
              {profileForm.formState.isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
            {profileSuccess && (
              <span className="inline-flex items-center text-sm text-emerald-600 dark:text-emerald-400">
                ✓ Cambios guardados
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Password Section */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Cambiar contraseña</h2>

        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]">Contraseña actual</label>
            <input
              type="password"
              {...passwordForm.register('currentPassword')}
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {passwordForm.formState.errors.currentPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordForm.formState.errors.currentPassword.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]">Nueva contraseña</label>
            <input
              type="password"
              {...passwordForm.register('newPassword')}
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {passwordForm.formState.errors.newPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordForm.formState.errors.newPassword.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]">Confirmar contraseña</label>
            <input
              type="password"
              {...passwordForm.register('confirmPassword')}
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {passwordForm.formState.errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordForm.formState.errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
              {passwordForm.formState.isSubmitting ? 'Cambiando...' : 'Cambiar contraseña'}
            </Button>
            {passwordSuccess && (
              <span className="inline-flex items-center text-sm text-emerald-600 dark:text-emerald-400">
                ✓ Contraseña actualizada
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
