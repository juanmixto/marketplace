'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createPromotion } from '@/domains/promotions/actions'
import { useT } from '@/i18n'

const formSchema = z
  .object({
    name: z.string().min(3, 'Mínimo 3 caracteres').max(100),
    code: z
      .string()
      .trim()
      .max(40)
      .regex(/^[A-Z0-9_-]*$/i, 'Solo letras, números, guiones y guiones bajos')
      .optional()
      .or(z.literal('')),
    kind: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
    value: z.coerce.number().min(0),
    scope: z.enum(['PRODUCT', 'VENDOR', 'CATEGORY']),
    productId: z.string().optional().or(z.literal('')),
    categoryId: z.string().optional().or(z.literal('')),
    minSubtotal: z
      .union([z.coerce.number().min(0), z.literal(''), z.null(), z.undefined()])
      .transform(v => (v === '' || v == null ? undefined : v)),
    maxRedemptions: z
      .union([z.coerce.number().int().positive().max(1_000_000), z.literal(''), z.null(), z.undefined()])
      .transform(v => (v === '' || v == null ? undefined : v)),
    perUserLimit: z
      .union([z.coerce.number().int().positive().max(1000), z.literal(''), z.null(), z.undefined()])
      .transform(v => (v === '' || v == null ? 1 : v)),
    startsAt: z.string().min(1, 'Requerido'),
    endsAt: z.string().min(1, 'Requerido'),
  })

type FormInput = z.input<typeof formSchema>
type FormValues = z.output<typeof formSchema>

interface Props {
  products: { id: string; name: string }[]
  categories: { id: string; name: string }[]
}

export function PromotionForm({ products, categories }: Props) {
  const t = useT()
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const today = new Date()
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      kind: 'PERCENTAGE',
      value: 10,
      scope: 'VENDOR',
      productId: '',
      categoryId: '',
      minSubtotal: undefined,
      maxRedemptions: undefined,
      perUserLimit: 1,
      startsAt: formatDateForInput(today),
      endsAt: formatDateForInput(in7Days),
    },
  })

  const kind = watch('kind')
  const scope = watch('scope')

  function onSubmit(values: FormValues) {
    setServerError(null)
    startTransition(async () => {
      try {
        await createPromotion({
          name: values.name,
          code: values.code ? values.code.toUpperCase() : null,
          kind: values.kind,
          value: values.kind === 'FREE_SHIPPING' ? 0 : values.value,
          scope: values.scope,
          productId: values.scope === 'PRODUCT' ? values.productId || null : null,
          categoryId: values.scope === 'CATEGORY' ? values.categoryId || null : null,
          minSubtotal: values.minSubtotal ?? null,
          maxRedemptions: values.maxRedemptions ?? null,
          perUserLimit: values.perUserLimit ?? null,
          startsAt: new Date(values.startsAt).toISOString(),
          endsAt: new Date(values.endsAt).toISOString(),
        })
        router.push('/vendor/promociones')
        router.refresh()
      } catch (err) {
        setServerError(err instanceof Error ? err.message : t('vendor.promotions.errorGeneric'))
      }
    })
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

      <Field label={t('vendor.promotions.formName')} error={errors.name?.message}>
        <Input {...register('name')} placeholder={t('vendor.promotions.formNamePlaceholder')} />
      </Field>

      <Field
        label={t('vendor.promotions.formCode')}
        error={errors.code?.message}
        hint={t('vendor.promotions.formCodeHint')}
      >
        <Input {...register('code')} placeholder="SUMMER10" className="font-mono uppercase" />
      </Field>

      <Field label={t('vendor.promotions.formKind')} error={errors.kind?.message}>
        <select
          {...register('kind')}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          <option value="PERCENTAGE">{t('vendor.promotions.kindPercentage')}</option>
          <option value="FIXED_AMOUNT">{t('vendor.promotions.kindFixed')}</option>
          <option value="FREE_SHIPPING">{t('vendor.promotions.kindFreeShipping')}</option>
        </select>
      </Field>

      {kind !== 'FREE_SHIPPING' && (
        <Field
          label={
            kind === 'PERCENTAGE'
              ? t('vendor.promotions.formValuePercentage')
              : t('vendor.promotions.formValueFixed')
          }
          error={errors.value?.message}
        >
          <Input
            type="number"
            step={kind === 'PERCENTAGE' ? '1' : '0.01'}
            min={0}
            {...register('value')}
          />
        </Field>
      )}

      <Field label={t('vendor.promotions.formScope')} error={errors.scope?.message}>
        <select
          {...register('scope')}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          <option value="VENDOR">{t('vendor.promotions.scopeVendor')}</option>
          <option value="PRODUCT">{t('vendor.promotions.scopeProduct')}</option>
          <option value="CATEGORY">{t('vendor.promotions.scopeCategory')}</option>
        </select>
      </Field>

      {scope === 'PRODUCT' && (
        <Field label={t('vendor.promotions.formProduct')} error={errors.productId?.message}>
          <select
            {...register('productId')}
            className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          >
            <option value="">{t('vendor.promotions.formProductPlaceholder')}</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {scope === 'CATEGORY' && (
        <Field label={t('vendor.promotions.formCategory')} error={errors.categoryId?.message}>
          <select
            {...register('categoryId')}
            className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          >
            <option value="">{t('vendor.promotions.formCategoryPlaceholder')}</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('vendor.promotions.formStartsAt')} error={errors.startsAt?.message}>
          <Input type="date" {...register('startsAt')} />
        </Field>
        <Field label={t('vendor.promotions.formEndsAt')} error={errors.endsAt?.message}>
          <Input type="date" {...register('endsAt')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('vendor.promotions.formMinSubtotal')} error={errors.minSubtotal?.message}>
          <Input type="number" step="0.01" min={0} {...register('minSubtotal')} />
        </Field>
        <Field label={t('vendor.promotions.formMaxRedemptions')} error={errors.maxRedemptions?.message}>
          <Input type="number" min={1} {...register('maxRedemptions')} />
        </Field>
        <Field label={t('vendor.promotions.formPerUserLimit')} error={errors.perUserLimit?.message}>
          <Input type="number" min={1} {...register('perUserLimit')} />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={() => router.push('/vendor/promociones')}>
          {t('vendor.promotions.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting || isPending}>
          {isSubmitting || isPending
            ? t('vendor.promotions.saving')
            : t('vendor.promotions.save')}
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

function formatDateForInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
