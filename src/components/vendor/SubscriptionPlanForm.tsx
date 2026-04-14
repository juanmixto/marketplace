'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { createSubscriptionPlan, updateSubscriptionPlan } from '@/domains/subscriptions/actions'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'
import { formatPrice } from '@/lib/utils'
import { ProductPicker, type PickerProductStatus } from '@/components/vendor/ProductPicker'

const formSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  cadence: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  cutoffDayOfWeek: z.coerce.number().int().min(0).max(6),
})

type FormInput = z.input<typeof formSchema>
type FormValues = z.output<typeof formSchema>

interface Props {
  products: {
    id: string
    name: string
    basePrice: number
    unit: string
    status: PickerProductStatus
  }[]
  /**
   * Present only in edit mode. Product and cadence are locked (the
   * product is tied to the plan via @@unique, and the cadence is tied
   * to the immutable Stripe Price). Only the cutoff day can change.
   */
  initial?: {
    id: string
    productId: string
    productName: string
    productUnit: string
    priceSnapshot: number
    cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
    cutoffDayOfWeek: number
  }
}

const CADENCE_OPTIONS: {
  value: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  labelKey: TranslationKeys
}[] = [
  { value: 'WEEKLY',   labelKey: 'vendor.subscriptionPlans.cadenceWeekly'   },
  { value: 'BIWEEKLY', labelKey: 'vendor.subscriptionPlans.cadenceBiweekly' },
  { value: 'MONTHLY',  labelKey: 'vendor.subscriptionPlans.cadenceMonthly'  },
]

// Monday-first display order. The schema still stores the ISO day-of-week
// value where Sunday=0 … Saturday=6, so the button value maps back to that.
const DAYS_MON_FIRST: { value: number; shortKey: TranslationKeys }[] = [
  { value: 1, shortKey: 'vendor.subscriptionPlans.dayShortMon' },
  { value: 2, shortKey: 'vendor.subscriptionPlans.dayShortTue' },
  { value: 3, shortKey: 'vendor.subscriptionPlans.dayShortWed' },
  { value: 4, shortKey: 'vendor.subscriptionPlans.dayShortThu' },
  { value: 5, shortKey: 'vendor.subscriptionPlans.dayShortFri' },
  { value: 6, shortKey: 'vendor.subscriptionPlans.dayShortSat' },
  { value: 0, shortKey: 'vendor.subscriptionPlans.dayShortSun' },
]

export function SubscriptionPlanForm({ products, initial }: Props) {
  const t = useT()
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEdit = Boolean(initial)

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial
      ? {
          productId: initial.productId,
          cadence: initial.cadence,
          cutoffDayOfWeek: initial.cutoffDayOfWeek,
        }
      : {
          productId: products[0]?.id ?? '',
          cadence: 'WEEKLY',
          cutoffDayOfWeek: 5, // Friday — standard for Monday drops
        },
  })

  const productId = watch('productId')
  const cadence = watch('cadence')
  const cutoffDayOfWeek = watch('cutoffDayOfWeek')
  const selected = products.find(p => p.id === productId)

  function onSubmit(values: FormValues) {
    setServerError(null)
    startTransition(async () => {
      try {
        if (initial) {
          await updateSubscriptionPlan(initial.id, {
            cutoffDayOfWeek: values.cutoffDayOfWeek,
          })
        } else {
          await createSubscriptionPlan(values)
        }
        router.push('/vendor/suscripciones')
        router.refresh()
      } catch (err) {
        setServerError(
          err instanceof Error ? err.message : t('vendor.subscriptionPlans.errorGeneric')
        )
      }
    })
  }

  if (!isEdit && products.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-8 text-center">
        <p className="text-[var(--muted)]">
          {t('vendor.subscriptionPlans.noEligibleProducts')}
        </p>
      </div>
    )
  }

  const cutoffHintKey: TranslationKeys =
    cadence === 'WEEKLY'   ? 'vendor.subscriptionPlans.formCutoffHintWeekly'   :
    cadence === 'BIWEEKLY' ? 'vendor.subscriptionPlans.formCutoffHintBiweekly' :
    'vendor.subscriptionPlans.formCutoffHintMonthly'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {serverError}
        </div>
      )}

      <Field label={t('vendor.subscriptionPlans.formProduct')} error={errors.productId?.message}>
        {isEdit && initial ? (
          <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--foreground-soft)]">
            <span className="truncate">{initial.productName}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {t('vendor.subscriptionPlans.lockedField')}
            </span>
          </div>
        ) : (
          <ProductPicker
            products={products}
            value={productId ?? ''}
            onChange={id => setValue('productId', id, { shouldDirty: true, shouldValidate: true })}
            placeholder={t('vendor.subscriptionPlans.formProduct')}
            allowClear={false}
          />
        )}
        {isEdit && initial ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t('vendor.subscriptionPlans.priceSnapshotHint').replace(
              '{price}',
              `${formatPrice(initial.priceSnapshot)} / ${initial.productUnit}`
            )}
          </p>
        ) : (
          selected && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {t('vendor.subscriptionPlans.priceSnapshotHint').replace(
                '{price}',
                `${formatPrice(selected.basePrice)} / ${selected.unit}`
              )}
            </p>
          )
        )}
      </Field>

      <Field label={t('vendor.subscriptionPlans.formCadence')} error={errors.cadence?.message}>
        <div
          role="radiogroup"
          aria-label={t('vendor.subscriptionPlans.formCadence')}
          className="grid grid-cols-3 gap-2"
        >
          {CADENCE_OPTIONS.map(opt => {
            const active = cadence === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={isEdit}
                onClick={() => {
                  if (isEdit) return
                  setValue('cadence', opt.value, { shouldDirty: true, shouldValidate: true })
                }}
                className={`h-10 rounded-lg border px-3 text-sm font-semibold transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
                } ${isEdit && !active ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {t(opt.labelKey)}
              </button>
            )
          })}
        </div>
        {isEdit && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t('vendor.subscriptionPlans.cadenceLocked')}
          </p>
        )}
      </Field>

      <Field
        label={t('vendor.subscriptionPlans.formCutoffDay')}
        error={errors.cutoffDayOfWeek?.message}
        hint={t(cutoffHintKey)}
      >
        <div
          role="radiogroup"
          aria-label={t('vendor.subscriptionPlans.formCutoffDay')}
          className="grid grid-cols-7 gap-1.5"
        >
          {DAYS_MON_FIRST.map(day => {
            const active = Number(cutoffDayOfWeek) === day.value
            return (
              <button
                key={day.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  setValue('cutoffDayOfWeek', day.value, { shouldDirty: true, shouldValidate: true })
                }
                className={`h-10 rounded-lg border text-xs font-semibold transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
                }`}
              >
                {t(day.shortKey)}
              </button>
            )
          })}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push('/vendor/suscripciones')}
        >
          {t('vendor.subscriptionPlans.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting || isPending}>
          {isSubmitting || isPending
            ? t('vendor.subscriptionPlans.saving')
            : isEdit
              ? t('vendor.subscriptionPlans.saveChanges')
              : t('vendor.subscriptionPlans.save')}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="block">
      <span className="block text-sm font-medium text-[var(--foreground-soft)]">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
