'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { updateVendorProfile } from '@/domains/vendors/actions'
import { isAllowedImageUrl } from '@/lib/image-validation'
import { SingleImageUpload } from './SingleImageUpload'
import type { Vendor } from '@/generated/prisma/client'

const imageFieldSchema = z
  .union([z.string(), z.literal(''), z.undefined()])
  .transform(v => (v ?? '').trim())
  .refine(
    v => v === '' || isAllowedImageUrl(v),
    'URL inválida. Sube una imagen o usa cloudinary.com, uploadthing.com o unsplash.com (HTTPS)',
  )

const profileSchema = z.object({
  displayName: z.string().min(3, 'Mínimo 3 caracteres').max(80),
  description: z.string().max(2000).optional(),
  location: z.string().max(100).optional(),
  logo: imageFieldSchema,
  coverImage: imageFieldSchema,
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
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: vendor.displayName,
      description: vendor.description ?? '',
      location: vendor.location ?? '',
      logo: vendor.logo ?? '',
      coverImage: vendor.coverImage ?? '',
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
      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="font-semibold text-[var(--foreground)]">Información pública</h2>

        <Input
          label="Nombre del productor"
          error={errors.displayName?.message}
          {...register('displayName')}
        />

        <div className="space-y-1.5">
          <label htmlFor="description" className="block text-sm font-medium text-[var(--foreground)]">
            Descripción
          </label>
          <textarea
            id="description"
            rows={4}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            placeholder="Cuéntanos sobre tu explotación, tus prácticas, tu historia..."
            {...register('description')}
          />
          {errors.description?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.description.message}</p>}
        </div>

        <Input
          label="Ubicación"
          placeholder="Navarra, España"
          error={errors.location?.message}
          {...register('location')}
        />

        <Controller
          control={control}
          name="logo"
          render={({ field }) => (
            <SingleImageUpload
              id="vendor-logo"
              label="Foto de perfil"
              hint="Se muestra redonda junto al nombre de tu tienda. Sube un JPG/PNG/WebP (máx. 5 MB) o pega una URL."
              value={field.value ?? ''}
              onChange={field.onChange}
              shape="circle"
            />
          )}
        />
        {errors.logo?.message && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.logo.message}</p>
        )}

        <Controller
          control={control}
          name="coverImage"
          render={({ field }) => (
            <SingleImageUpload
              id="vendor-cover"
              label="Imagen de portada"
              hint="Se usa como fondo del escaparate de tu tienda. Recomendado 1600×500. Si la dejas vacía usaremos una imagen por defecto."
              value={field.value ?? ''}
              onChange={field.onChange}
              shape="banner"
            />
          )}
        />
        {errors.coverImage?.message && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.coverImage.message}</p>
        )}
      </section>

      {/* Logistics */}
      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="font-semibold text-[var(--foreground)]">Logística</h2>
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
      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="font-semibold text-[var(--foreground)]">Datos bancarios</h2>
        <p className="text-sm text-[var(--muted)]">Para recibir tus liquidaciones.</p>
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
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-300">
          Perfil actualizado correctamente.
        </p>
      )}
      {serverError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
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
