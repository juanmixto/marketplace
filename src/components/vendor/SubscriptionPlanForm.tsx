'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { createSubscriptionPlan } from '@/domains/subscriptions/actions'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'
import { formatPrice } from '@/lib/utils'

const formSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  cadence: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  cutoffDayOfWeek: z.coerce.number().int().min(0).max(6),
})

type FormInput = z.input<typeof formSchema>
type FormValues = z.output<typeof formSchema>

interface Props {
  products: { id: string; name: string; basePrice: number; unit: string }[]
}

const DAY_KEYS: TranslationKeys[] = [
  'vendor.subscriptionPlans.day0',
  'vendor.subscriptionPlans.day1',
  'vendor.subscriptionPlans.day2',
  'vendor.subscriptionPlans.day3',
  'vendor.subscriptionPlans.day4',
  'vendor.subscriptionPlans.day5',
  'vendor.subscriptionPlans.day6',
]

export function SubscriptionPlanForm({ products }: Props) {
  const t = useT()
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: products[0]?.id ?? '',
      cadence: 'WEEKLY',
      cutoffDayOfWeek: 5, // Friday — standard for Monday drops
    },
  })

  const productId = watch('productId')
  const selected = products.find(p => p.id === productId)

  function onSubmit(values: FormValues) {
    setServerError(null)
    startTransition(async () => {
      try {
        await createSubscriptionPlan(values)
        router.push('/vendor/suscripciones')
        router.refresh()
      } catch (err) {
        setServerError(
          err instanceof Error ? err.message : t('vendor.subscriptionPlans.errorGeneric')
        )
      }
    })
  }

  if (products.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-8 text-center">
        <p className="text-[var(--muted)]">
          {t('vendor.subscriptionPlans.noEligibleProducts')}
        </p>
      </div>
    )
  }

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
        <select
          {...register('productId')}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          {products.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {selected && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t('vendor.subscriptionPlans.priceSnapshotHint').replace(
              '{price}',
              `${formatPrice(selected.basePrice)} / ${selected.unit}`
            )}
          </p>
        )}
      </Field>

      <Field label={t('vendor.subscriptionPlans.formCadence')} error={errors.cadence?.message}>
        <select
          {...register('cadence')}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          <option value="WEEKLY">{t('vendor.subscriptionPlans.cadenceWeekly')}</option>
          <option value="BIWEEKLY">{t('vendor.subscriptionPlans.cadenceBiweekly')}</option>
          <option value="MONTHLY">{t('vendor.subscriptionPlans.cadenceMonthly')}</option>
        </select>
      </Field>

      <Field
        label={t('vendor.subscriptionPlans.formCutoffDay')}
        error={errors.cutoffDayOfWeek?.message}
        hint={t('vendor.subscriptionPlans.formCutoffHint')}
      >
        <select
          {...register('cutoffDayOfWeek')}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          {DAY_KEYS.map((key, index) => (
            <option key={key} value={index}>
              {t(key)}
            </option>
          ))}
        </select>
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
    <label className="block">
      <span className="block text-sm font-medium text-[var(--foreground-soft)]">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </label>
  )
}
