'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { useT } from '@/i18n'
import { useMemo } from 'react'

function buildProfileSchema(t: ReturnType<typeof useT>) {
  const imageFieldSchema = z
    .union([z.string(), z.literal(''), z.undefined()])
    .transform(v => (v ?? '').trim())
    .refine(
      v => v === '' || isAllowedImageUrl(v),
      t('vendor.profileForm.imageUrlError'),
    )
  return z.object({
    displayName: z.string().min(3, t('vendor.profileForm.nameMin')).max(80),
    description: z.string().max(2000).optional(),
    location: z.string().max(100).optional(),
    logo: imageFieldSchema,
    coverImage: imageFieldSchema,
    orderCutoffTime: z
      .union([z.string().regex(/^\d{2}:\d{2}$/, t('vendor.profileForm.cutoffFormat')), z.literal(''), z.undefined()])
      .transform(v => v || undefined),
    preparationDays: z.coerce.number().int().min(0).max(30).optional(),
    iban: z.string().max(34).optional(),
    bankAccountName: z.string().max(100).optional(),
  })
}

type ProfileSchema = ReturnType<typeof buildProfileSchema>
type ProfileFormValues = z.infer<ProfileSchema>
type ProfileFormInput = z.input<ProfileSchema>

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DEBOUNCE_MS = 900

interface Props {
  vendor: Vendor
}

export function VendorProfileForm({ vendor }: Props) {
  const router = useRouter()
  const t = useT()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [serverError, setServerError] = useState<string | null>(null)

  const profileSchema = useMemo(() => buildProfileSchema(t), [t])

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
        // Refresh server components so the vendor layout sidebar (which reads
        // displayName/logo from the DB) reflects the new values without needing
        // a full page reload.
        router.refresh()
      } catch (err) {
        setSaveState('error')
        setServerError(err instanceof Error ? err.message : t('vendor.profileForm.profileSaveError'))
      }
    },
    [router, t],
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
        <h2 className="font-semibold text-[var(--foreground)]">{t('vendor.profileForm.publicInfo')}</h2>

        <Input
          label={t('vendor.profileForm.nameLabel')}
          error={errors.displayName?.message}
          {...register('displayName')}
        />

        <div className="space-y-1.5">
          <label htmlFor="description" className="block text-sm font-medium text-[var(--foreground)]">
            {t('vendor.profileForm.description')}
          </label>
          <textarea
            id="description"
            rows={8}
            className="w-full min-h-[12rem] resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            placeholder={t('vendor.profileForm.descriptionPlaceholder')}
            {...register('description')}
          />
          {errors.description?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.description.message}</p>}
        </div>

        <Input
          label={t('vendor.profileForm.location')}
          placeholder={t('vendor.profileForm.locationPlaceholder')}
          error={errors.location?.message}
          {...register('location')}
        />

        <Controller
          control={control}
          name="logo"
          render={({ field }) => (
            <SingleImageUpload
              id="vendor-logo"
              label={t('vendor.profileForm.logoLabel')}
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
              label={t('vendor.profileForm.coverLabel')}
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
        <h2 className="font-semibold text-[var(--foreground)]">{t('vendor.profileForm.logistics')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('vendor.profileForm.cutoffLabel')}
            placeholder="18:00"
            hint={t('vendor.profileForm.cutoffHint')}
            error={errors.orderCutoffTime?.message}
            {...register('orderCutoffTime')}
          />
          <Input
            label={t('vendor.profileForm.prepDaysLabel')}
            type="number"
            min="0"
            max="30"
            hint={t('vendor.profileForm.prepDaysHint')}
            error={errors.preparationDays?.message}
            {...register('preparationDays')}
          />
        </div>
      </section>

      {/* Banking */}
      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="font-semibold text-[var(--foreground)]">{t('vendor.profileForm.bankHeading')}</h2>
        <p className="text-sm text-[var(--muted)]">{t('vendor.profileForm.bankSubtitle')}</p>
        <Input
          label={t('vendor.profileForm.ibanLabel')}
          placeholder="ES76 2100 0418 4502 0005 1332"
          hint={t('vendor.profileForm.ibanHint')}
          error={errors.iban?.message}
          {...register('iban')}
        />
        <Input
          label={t('vendor.profileForm.accountHolderLabel')}
          placeholder={t('vendor.profileForm.accountHolderPlaceholder')}
          error={errors.bankAccountName?.message}
          {...register('bankAccountName')}
        />
      </section>

      <AutoSaveIndicator state={saveState} error={serverError} t={t} />
    </form>
  )
}

function AutoSaveIndicator({
  state,
  error,
  t,
}: {
  state: SaveState
  error: string | null
  t: ReturnType<typeof useT>
}) {
  if (state === 'saving') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
        <CloudArrowUpIcon className="h-4 w-4 animate-pulse" />
        {t('vendor.profileForm.saving')}
      </div>
    )
  }
  if (state === 'saved') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-300">
        <CheckCircleIcon className="h-4 w-4" />
        {t('vendor.profileForm.saved')}
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error ?? t('vendor.profileForm.saveError')}</span>
      </div>
    )
  }
  return (
    <p className="text-xs text-[var(--muted)]">
      {t('vendor.profileForm.autosaveHint')}
    </p>
  )
}
