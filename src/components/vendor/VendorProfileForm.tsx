'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { updateVendorProfile } from '@/domains/vendors/actions'
import type { Vendor } from '@/generated/prisma/client'

const profileSchema = z.object({
  displayName: z.string().min(3, 'Mínimo 3 caracteres').max(80),
  description: z.string().max(2000).optional(),
  location: z.string().max(100).optional(),
  orderCutoffTime: z
    .union([z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'), z.literal(''), z.undefined()])
    .transform(v => v || undefined),
  preparationDays: z.coerce.number().int().min(0).max(30).optional(),
  iban: z.string().max(34).optional(),
  bankAccountName: z.string().max(100).optional(),
})

type ProfileFormValues = z.infer<typeof profileSchema>
type ProfileFormInput = z.input<typeof profileSchema>

interface Props {
  vendor: Vendor
}

export function VendorProfileForm({ vendor }: Props) {
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: vendor.displayName,
      description: vendor.description ?? '',
      location: vendor.location ?? '',
      orderCutoffTime: vendor.orderCutoffTime ?? '',
      preparationDays: vendor.preparationDays ?? 2,
      iban: vendor.iban ?? '',
      bankAccountName: vendor.bankAccountName ?? '',
    },
  })

  async function onSubmit(values: ProfileFormValues) {
    setServerError(null)
    setSuccess(false)
    try {
      await updateVendorProfile(values)
      setSuccess(true)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error al guardar el perfil')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Public info */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Información pública</h2>

        <Input
          label="Nombre del productor"
          error={errors.displayName?.message}
          {...register('displayName')}
        />

        <div className="space-y-1.5">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Descripción
          </label>
          <textarea
            id="description"
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Cuéntanos sobre tu explotación, tus prácticas, tu historia..."
            {...register('description')}
          />
          {errors.description?.message && <p className="text-xs text-red-600">{errors.description.message}</p>}
        </div>

        <Input
          label="Ubicación"
          placeholder="Navarra, España"
          error={errors.location?.message}
          {...register('location')}
        />
      </section>

      {/* Logistics */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Logística</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Hora de corte de pedidos"
            placeholder="18:00"
            hint="Formato HH:MM. Pedidos recibidos después se procesan al día siguiente."
            error={errors.orderCutoffTime?.message}
            {...register('orderCutoffTime')}
          />
          <Input
            label="Días de preparación"
            type="number"
            min="0"
            max="30"
            hint="Tiempo estimado antes del envío."
            error={errors.preparationDays?.message}
            {...register('preparationDays')}
          />
        </div>
      </section>

      {/* Banking */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Datos bancarios</h2>
        <p className="text-sm text-gray-500">Para recibir tus liquidaciones.</p>
        <Input
          label="IBAN"
          placeholder="ES76 2100 0418 4502 0005 1332"
          hint="Solo se usa para transferencias de liquidación."
          error={errors.iban?.message}
          {...register('iban')}
        />
        <Input
          label="Titular de la cuenta"
          placeholder="Nombre del titular o empresa"
          error={errors.bankAccountName?.message}
          {...register('bankAccountName')}
        />
      </section>

      {success && (
        <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Perfil actualizado correctamente.
        </p>
      )}
      {serverError && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" isLoading={isSubmitting} disabled={!isDirty && !isSubmitting}>
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}
