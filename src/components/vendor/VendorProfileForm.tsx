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
import { trackAnalyticsEvent } from '@/lib/analytics'
import { isAllowedImageUrl } from '@/lib/image-validation'
import { VendorHeroUpload } from './VendorHeroUpload'
import type { VendorProfileItem } from '@/lib/vendor-profile-serialization'
import { useT } from '@/i18n'
import { useMemo } from 'react'

const VENDOR_CATEGORY_OPTIONS = [
  { value: 'BAKERY', labelKey: 'vendorVisual.bakery' },
  { value: 'CHEESE', labelKey: 'vendorVisual.cheese' },
  { value: 'WINERY', labelKey: 'vendorVisual.winery' },
  { value: 'ORCHARD', labelKey: 'vendorVisual.orchard' },
  { value: 'OLIVE_OIL', labelKey: 'vendorVisual.oliveOil' },
  { value: 'FARM', labelKey: 'vendorVisual.farm' },
  { value: 'DRYLAND', labelKey: 'vendorVisual.dryland' },
  { value: 'LOCAL_PRODUCER', labelKey: 'vendorVisual.localProducer' },
] as const

type VendorCategoryOption = (typeof VENDOR_CATEGORY_OPTIONS)[number]['value']

// Cap matches PRODUCT_IMAGE_ALT_MAX in src/shared/types/products.ts.
// One rule for both surfaces is easier to teach the vendor than "200 here,
// something else there".
const IMAGE_ALT_MAX = 200

function buildProfileSchema(t: ReturnType<typeof useT>) {
  const imageFieldSchema = z
    .union([z.string().max(2048), z.literal(''), z.undefined()])
    .transform(v => (v ?? '').trim())
    .refine(
      v => v === '' || isAllowedImageUrl(v),
      t('vendor.profileForm.imageUrlError'),
    )
  const altFieldSchema = z
    .union([z.string().max(IMAGE_ALT_MAX), z.literal(''), z.undefined()])
    .transform(v => (v ?? '').trim())
  return z.object({
    displayName: z.string().min(3, t('vendor.profileForm.nameMin')).max(80),
    description: z.string().max(2000).optional(),
    location: z.string().max(100).optional(),
    category: z
      .union([
        z.enum(VENDOR_CATEGORY_OPTIONS.map(c => c.value) as [VendorCategoryOption, ...VendorCategoryOption[]]),
        z.literal(''),
        z.undefined(),
      ])
      .optional(),
    logo: imageFieldSchema,
    logoAlt: altFieldSchema,
    coverImage: imageFieldSchema,
    coverImageAlt: altFieldSchema,
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
  vendor: VendorProfileItem
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
      category: (vendor.category ?? '') as VendorCategoryOption | '',
      logo: vendor.logo ?? '',
      logoAlt: vendor.logoAlt ?? '',
      coverImage: vendor.coverImage ?? '',
      coverImageAlt: vendor.coverImageAlt ?? '',
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
        trackAnalyticsEvent('seller_profile_completed', {
          vendor_id: vendor.id,
          vendor_category: values.category || undefined,
        })
        // First successful save acts as the "seller onboarding completed"
        // signal. Dedup per-vendor via localStorage so we fire once even if
        // the user edits their profile later.
        try {
          const storageKey = `seller_signup_completed:${vendor.id}`
          if (typeof window !== 'undefined' && !window.localStorage.getItem(storageKey)) {
            trackAnalyticsEvent('seller_signup_completed', {
              vendor_id: vendor.id,
              vendor_category: values.category || undefined,
            })
            window.localStorage.setItem(storageKey, new Date().toISOString())
          }
        } catch {
          // Silent: analytics must never break saves.
        }
        // Refresh server components so the vendor layout sidebar (which reads
        // displayName/logo from the DB) reflects the new values without needing
        // a full page reload.
        router.refresh()
      } catch (err) {
        setSaveState('error')
        setServerError(err instanceof Error ? err.message : t('vendor.profileForm.profileSaveError'))
      }
    },
    [router, t, vendor.id],
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
            rows={4}
            spellCheck
            autoCapitalize="sentences"
            className="w-full min-h-[8rem] resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:min-h-[12rem] dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
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

        <div className="space-y-1.5">
          <label htmlFor="vendor-category" className="block text-sm font-medium text-[var(--foreground)]">
            {t('vendor.profileForm.categoryLabel')}
          </label>
          <select
            id="vendor-category"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            {...register('category')}
          >
            <option value="">{t('vendor.profileForm.categoryAuto')}</option>
            {VENDOR_CATEGORY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--muted)]">{t('vendor.profileForm.categoryHint')}</p>
        </div>

        <Controller
          control={control}
          name="logo"
          render={({ field: logoField }) => (
            <Controller
              control={control}
              name="coverImage"
              render={({ field: coverField }) => (
                <VendorHeroUpload
                  coverLabel={t('vendor.profileForm.coverLabel')}
                  logoLabel={t('vendor.profileForm.logoLabel')}
                  coverValue={coverField.value ?? ''}
                  logoValue={logoField.value ?? ''}
                  onCoverChange={coverField.onChange}
                  onLogoChange={logoField.onChange}
                />
              )}
            />
          )}
        />
        {errors.logo?.message && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.logo.message}</p>
        )}
        {errors.coverImage?.message && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.coverImage.message}</p>
        )}

        {/*
          #1049 — alt text for logo + cover. Empty falls back to the
          vendor display name at render time. Kept right under the
          hero upload so the vendor sees both fields in the same
          glance.
        */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('vendor.profileForm.logoAltLabel')}
            placeholder={t('vendor.profileForm.logoAltPlaceholder')}
            hint={t('vendor.imageAltHint')}
            maxLength={IMAGE_ALT_MAX}
            error={errors.logoAlt?.message}
            {...register('logoAlt')}
          />
          <Input
            label={t('vendor.profileForm.coverImageAltLabel')}
            placeholder={t('vendor.profileForm.coverImageAltPlaceholder')}
            hint={t('vendor.imageAltHint')}
            maxLength={IMAGE_ALT_MAX}
            error={errors.coverImageAlt?.message}
            {...register('coverImageAlt')}
          />
        </div>
      </section>

      {/* Logistics */}
      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="font-semibold text-[var(--foreground)]">{t('vendor.profileForm.logistics')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('vendor.profileForm.cutoffLabel')}
            type="time"
            placeholder="18:00"
            hint={t('vendor.profileForm.cutoffHint')}
            error={errors.orderCutoffTime?.message}
            {...register('orderCutoffTime')}
          />
          <Input
            label={t('vendor.profileForm.prepDaysLabel')}
            type="number"
            inputMode="numeric"
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
