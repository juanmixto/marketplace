'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  CheckCircleIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { Input } from '@/components/ui/input'
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

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DEBOUNCE_MS = 900

interface Props {
  vendor: Vendor
}

export function VendorProfileForm({ vendor }: Props) {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    mode: 'onChange',
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

  // Snapshot of the last successfully saved payload. The watch subscription
  // compares JSON against this so we only hit the server when something
  // actually changed (initial render / programmatic resets are ignored).
  const lastSavedJsonRef = useRef<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSave = useCallback(
    async (values: ProfileFormValues) => {
      setSaveState('saving')
      setServerError(null)
      try {
        await updateVendorProfile(values)
        lastSavedJsonRef.current = JSON.stringify(values)
        setSaveState('saved')
      } catch (err) {
        setSaveState('error')
        setServerError(err instanceof Error ? err.message : 'Error al guardar el perfil')
      }
    },
    [],
  )

  useEffect(() => {
    const subscription = watch(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        // handleSubmit runs Zod again so we only save when the form is valid.
        // It silently no-ops on validation errors, which is what we want for
        // an autosave: the user keeps typing until the input becomes valid.
        void handleSubmit(async valid => {
          const nextJson = JSON.stringify(valid)
          if (nextJson === lastSavedJsonRef.current) return
          if (lastSavedJsonRef.current === null) {
            // First tick: seed the baseline with the server values instead of
            // triggering a redundant save on mount.
            lastSavedJsonRef.current = nextJson
            return
          }
          await doSave(valid)
        })()
      }, AUTOSAVE_DEBOUNCE_MS)
    })
    return () => {
      subscription.unsubscribe()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [watch, handleSubmit, doSave])

  return (
    <form onSubmit={e => e.preventDefault()} className="space-y-6">
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
              label="Portada del escaparate"
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

      <AutoSaveIndicator state={saveState} error={serverError} />
    </form>
  )
}

function AutoSaveIndicator({ state, error }: { state: SaveState; error: string | null }) {
  if (state === 'saving') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
        <CloudArrowUpIcon className="h-4 w-4 animate-pulse" />
        Guardando cambios...
      </div>
    )
  }
  if (state === 'saved') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-300">
        <CheckCircleIcon className="h-4 w-4" />
        Cambios guardados automáticamente.
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error ?? 'Error al guardar. Reintentaremos con tu próximo cambio.'}</span>
      </div>
    )
  }
  return (
    <p className="text-xs text-[var(--muted)]">
      Los cambios se guardan automáticamente mientras editas.
    </p>
  )
}
