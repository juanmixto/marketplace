'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createPromotion, updatePromotion, type SerializedPromotion } from '@/domains/promotions/actions'
import { useT } from '@/i18n'
import {
  ProductPicker,
  PRODUCT_STATUS_ORDER,
  type PickerProductStatus,
} from '@/components/vendor/ProductPicker'

const formSchema = z
  .object({
    name: z.string().trim().min(3, 'Mínimo 3 caracteres').max(100, 'Máximo 100 caracteres'),
    code: z
      .string()
      .trim()
      .max(40, 'Máximo 40 caracteres')
      .regex(/^[A-Z0-9_-]*$/i, 'Solo letras, números, guiones y guiones bajos')
      .optional()
      .or(z.literal('')),
    kind: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
    value: z.coerce.number({ error: 'Introduce un número válido' }).min(0, 'Debe ser 0 o mayor'),
    scope: z.enum(['PRODUCT', 'VENDOR', 'CATEGORY']),
    productId: z.string().optional().or(z.literal('')),
    categoryId: z.string().optional().or(z.literal('')),
    minSubtotal: z
      .union([
        z.coerce.number().min(0, 'Debe ser 0 o mayor').max(1_000_000, 'Demasiado alto'),
        z.literal(''),
        z.null(),
        z.undefined(),
      ])
      .transform(v => (v === '' || v == null ? undefined : v)),
    maxRedemptions: z
      .union([
        z.coerce.number().int('Debe ser un entero').positive('Debe ser mayor que 0').max(1_000_000, 'Demasiado alto'),
        z.literal(''),
        z.null(),
        z.undefined(),
      ])
      .transform(v => (v === '' || v == null ? undefined : v)),
    perUserLimit: z
      .union([
        z.coerce.number().int('Debe ser un entero').positive('Debe ser mayor que 0').max(1000, 'Máximo 1000'),
        z.literal(''),
        z.null(),
        z.undefined(),
      ])
      .transform(v => (v === '' || v == null ? 1 : v)),
    startsAt: z.string().min(1, 'Requerido'),
    endsAt: z.string().min(1, 'Requerido'),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'PERCENTAGE') {
      if (data.value <= 0 || data.value > 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'El porcentaje debe estar entre 1 y 100',
        })
      }
    } else if (data.kind === 'FIXED_AMOUNT') {
      if (data.value <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'El importe debe ser mayor que 0',
        })
      }
      if (data.value > 1_000_000) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'Importe demasiado alto',
        })
      }
    }

    if (data.scope === 'PRODUCT' && !data.productId) {
      ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Selecciona un producto' })
    }
    if (data.scope === 'CATEGORY' && !data.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Selecciona una categoría' })
    }

    const starts = new Date(data.startsAt).getTime()
    const ends = new Date(data.endsAt).getTime()
    if (Number.isNaN(starts) || Number.isNaN(ends)) {
      ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Fechas inválidas' })
      return
    }
    if (ends <= starts) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'La fecha de fin debe ser posterior a la de inicio',
      })
    }
  })

type FormInput = z.input<typeof formSchema>
type FormValues = z.output<typeof formSchema>

type ProductStatus = PickerProductStatus

interface Props {
  products: { id: string; name: string; status: ProductStatus }[]
  categories: { id: string; name: string }[]
  /** Pass a serialized promotion to render the form in edit mode. */
  initial?: SerializedPromotion
}

export function PromotionForm({ products, categories, initial }: Props) {
  const t = useT()
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEdit = Boolean(initial)

  const today = new Date()
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  const defaultValues: FormInput = initial
    ? {
        name: initial.name,
        code: initial.code ?? '',
        kind: initial.kind,
        value: initial.kind === 'FREE_SHIPPING' ? 0 : initial.value,
        scope: initial.scope,
        productId: initial.productId ?? '',
        categoryId: initial.categoryId ?? '',
        minSubtotal: initial.minSubtotal ?? undefined,
        maxRedemptions: initial.maxRedemptions ?? undefined,
        perUserLimit: initial.perUserLimit ?? 1,
        startsAt: formatDateForInput(new Date(initial.startsAt)),
        endsAt: formatDateForInput(new Date(initial.endsAt)),
      }
    : {
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
      }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  })

  const kind = watch('kind')
  const scope = watch('scope')
  const productId = watch('productId')

  // Active products first, then pending review, then drafts, then the rest.
  // Within each bucket we preserve the incoming order (already createdAt
  // desc from getMyProducts).
  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => PRODUCT_STATUS_ORDER[a.status] - PRODUCT_STATUS_ORDER[b.status]),
    [products],
  )

  function onSubmit(values: FormValues) {
    setServerError(null)
    startTransition(async () => {
      try {
        const payload = {
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
        }
        if (initial) {
          await updatePromotion(initial.id, payload)
        } else {
          await createPromotion(payload)
        }
        router.push('/vendor/promociones')
        router.refresh()
      } catch (err) {
        const raw = err instanceof Error ? err.message : ''
        // Never surface raw ZodError JSON or stack-ish messages to the user.
        const looksLikeZod = raw.startsWith('[') || raw.includes('"code"') || raw.includes('"path"')
        const friendly =
          !raw || looksLikeZod || raw.length > 200 ? t('vendor.promotions.errorGeneric') : raw
        setServerError(friendly)
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

      <div className={`grid gap-4 ${kind !== 'FREE_SHIPPING' ? 'sm:grid-cols-2' : ''}`}>
        <Field label={t('vendor.promotions.formKind')} error={errors.kind?.message}>
          <select
            {...register('kind')}
            className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 sm:h-10 sm:min-h-0"
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
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                step={kind === 'PERCENTAGE' ? '1' : '0.01'}
                min={kind === 'PERCENTAGE' ? 1 : 0.01}
                max={kind === 'PERCENTAGE' ? 100 : 1_000_000}
                className="pr-9"
                {...register('value')}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-[var(--muted)]">
                {kind === 'PERCENTAGE' ? '%' : '€'}
              </span>
            </div>
          </Field>
        )}
      </div>

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
          <input type="hidden" {...register('productId')} />
          <ProductPicker
            products={sortedProducts}
            value={productId ?? ''}
            onChange={id =>
              setValue('productId', id, { shouldDirty: true, shouldValidate: true })
            }
            placeholder={t('vendor.promotions.formProductPlaceholder')}
          />
        </Field>
      )}

      {scope === 'CATEGORY' && (
        <Field label={t('vendor.promotions.formCategory')} error={errors.categoryId?.message}>
          <select
            {...register('categoryId')}
            className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 sm:h-10 sm:min-h-0"
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
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              max={1_000_000}
              className="pr-9"
              {...register('minSubtotal')}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-[var(--muted)]">
              €
            </span>
          </div>
        </Field>
        <Field label={t('vendor.promotions.formMaxRedemptions')} error={errors.maxRedemptions?.message}>
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            min={1}
            max={1_000_000}
            {...register('maxRedemptions')}
          />
        </Field>
        <Field label={t('vendor.promotions.formPerUserLimit')} error={errors.perUserLimit?.message}>
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            min={1}
            max={1000}
            {...register('perUserLimit')}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={() => router.push('/vendor/promociones')}>
          {t('vendor.promotions.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting || isPending}>
          {isSubmitting || isPending
            ? t('vendor.promotions.saving')
            : isEdit
              ? t('vendor.promotions.saveChanges')
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
