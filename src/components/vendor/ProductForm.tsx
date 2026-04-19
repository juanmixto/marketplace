'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CERTIFICATIONS, PRODUCT_UNITS, TAX_RATES } from '@/lib/constants'
import { createProduct, updateProduct, updateProductVariants } from '@/domains/vendors/actions'
import { trackAnalyticsEvent } from '@/lib/analytics'
import { formatExpirationDateInput } from '@/domains/catalog/availability'
import { parseAndValidateImages } from '@/lib/image-validation'
import { ImageUploader } from '@/components/vendor/ImageUploader'
import type { Category } from '@/generated/prisma/client'
import { useT } from '@/i18n'
import { detectProductDefaults } from '@/domains/catalog/product-autodetect'
import type { VendorProductFormItem } from '@/lib/vendor-serialization'

type AutoField = 'category' | 'tax' | 'unit' | 'region'

const productFormSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres').max(100),
  description: z.string().max(2000).optional(),
  categoryId: z.string().optional(),
  basePrice: z.coerce.number().positive('Precio debe ser positivo'),
  compareAtPrice: z
    .union([z.coerce.number().positive('Debe ser positivo'), z.literal(''), z.null(), z.undefined()])
    .transform(value => (value === '' || value == null ? undefined : value)),
  taxRate: z.coerce.number().refine(value => [0.04, 0.1, 0.21].includes(value), 'IVA inválido'),
  unit: z.string().min(1, 'Unidad requerida').max(20),
  stock: z.coerce.number().int().min(0, 'No puede ser negativo'),
  trackStock: z.boolean(),
  weightGrams: z
    .union([z.coerce.number().int().positive('Debe ser positivo').max(50000, 'Máximo 50000 g'), z.literal(''), z.null(), z.undefined()])
    .transform(value => (value === '' || value == null ? undefined : value)),
  certifications: z.array(z.string()).default([]),
  originRegion: z.string().max(100).optional(),
  imagesText: z.string().optional().refine(
    value => {
      if (!value) return true
      const { invalid } = parseAndValidateImages(value)
      return invalid.length === 0
    },
    'Una o más URLs son inválidas o no están permitidas'
  ),
  expiresAt: z
    .union([z.string().date('Fecha inválida'), z.literal(''), z.null(), z.undefined()])
    .transform(value => (value === '' || value == null ? undefined : value)),
  status: z.enum(['DRAFT', 'PENDING_REVIEW']).default('DRAFT'),
})

type ProductFormValues = z.infer<typeof productFormSchema>
type ProductFormInput = z.input<typeof productFormSchema>

interface ProductFormProps {
  categories: Category[]
  initialData?: VendorProductFormItem
  vendorLocation?: string | null
}


type VariantRow = {
  /** Database id when persisted, null for rows added in this session. */
  id: string | null
  /** Stable react key across renders, including for unsaved rows. */
  key: string
  name: string
  priceModifier: string
  stock: string
  isActive: boolean
}

function variantRowFromDb(variant: VendorProductFormItem['variants'][number]): VariantRow {
  return {
    id: variant.id,
    key: variant.id,
    name: variant.name,
    priceModifier: Number(variant.priceModifier).toString(),
    stock: String(variant.stock),
    isActive: variant.isActive,
  }
}

function makeEmptyVariantRow(): VariantRow {
  return {
    id: null,
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    priceModifier: '0',
    stock: '0',
    isActive: true,
  }
}

export function ProductForm({ categories, initialData, vendorLocation }: ProductFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<'DRAFT' | 'PENDING_REVIEW' | null>(null)
  const t = useT()

  const [variants, setVariants] = useState<VariantRow[]>(
    () => initialData?.variants?.map(variantRowFromDb) ?? [],
  )
  const [variantError, setVariantError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      categoryId: initialData?.categoryId ?? '',
      basePrice: initialData ? Number(initialData.basePrice) : 0,
      compareAtPrice: initialData?.compareAtPrice ? Number(initialData.compareAtPrice) : undefined,
      taxRate: initialData ? Number(initialData.taxRate) : TAX_RATES.STANDARD,
      unit: initialData?.unit ?? 'kg',
      stock: initialData?.stock ?? 0,
      trackStock: initialData?.trackStock ?? true,
      weightGrams: initialData?.weightGrams ?? undefined,
      certifications: initialData?.certifications ?? [],
      originRegion: initialData?.originRegion ?? vendorLocation ?? '',
      imagesText: initialData?.images?.join('\n') ?? '',
      expiresAt: formatExpirationDateInput(initialData?.expiresAt),
      status:
        initialData?.status === 'PENDING_REVIEW'
          ? 'PENDING_REVIEW'
          : 'DRAFT',
    },
  })

  const selectedCertifications = watch('certifications') ?? []
  const imagesTextValue = watch('imagesText')
  const { valid: validImages } = parseAndValidateImages(imagesTextValue)
  const trackStockValue = watch('trackStock')
  const unitValue = watch('unit')
  const unitOptions = PRODUCT_UNITS.includes(unitValue as (typeof PRODUCT_UNITS)[number])
    ? PRODUCT_UNITS
    : ([...PRODUCT_UNITS, unitValue].filter(Boolean) as readonly string[])

  const nameValue = watch('name')
  const [autoFilled, setAutoFilled] = useState<Set<AutoField>>(() => new Set())
  const touchedRef = useRef<Record<AutoField, boolean>>({
    category: false,
    tax: false,
    unit: Boolean(initialData?.unit && initialData.unit !== 'kg'),
    region: Boolean(initialData?.originRegion),
  })
  const isEditing = Boolean(initialData)

  useEffect(() => {
    if (isEditing) return
    const handle = setTimeout(() => {
      const detected = detectProductDefaults(nameValue ?? '', categories)
      const next = new Set<AutoField>()
      if (detected.category && !touchedRef.current.category) {
        setValue('categoryId', detected.category.id, { shouldDirty: true })
        next.add('category')
      }
      if (detected.taxRate != null && !touchedRef.current.tax) {
        setValue('taxRate', detected.taxRate, { shouldDirty: true })
        next.add('tax')
      }
      if (detected.unit && !touchedRef.current.unit) {
        setValue('unit', detected.unit, { shouldDirty: true })
        next.add('unit')
      }
      if (detected.originRegion && !touchedRef.current.region) {
        setValue('originRegion', detected.originRegion, { shouldDirty: true })
        next.add('region')
      }
      setAutoFilled(next)
    }, 300)
    return () => clearTimeout(handle)
  }, [nameValue, categories, setValue, isEditing])

  function markTouched(field: AutoField) {
    touchedRef.current[field] = true
    setAutoFilled(prev => {
      if (!prev.has(field)) return prev
      const next = new Set(prev)
      next.delete(field)
      return next
    })
  }

  const categoryRegister = register('categoryId')
  const taxRateRegister = register('taxRate')
  const unitRegister = register('unit')
  const originRegionRegister = register('originRegion')

  const autoBadge = (
    <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
      ✨ {t('vendor.newProduct.autoFilledHint')}
    </span>
  )

  function labelRow(htmlFor: string, label: string, field: AutoField | null = null) {
    return (
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-[var(--foreground)]">
          {label}
        </label>
        {field && autoFilled.has(field) ? autoBadge : null}
      </div>
    )
  }

  async function onSubmit(values: ProductFormValues) {
    setServerError(null)
    setVariantError(null)

    const { valid: images } = parseAndValidateImages(values.imagesText)

    const payload = {
      ...values,
      categoryId: values.categoryId || undefined,
      description: values.description?.trim() || undefined,
      originRegion: values.originRegion?.trim() || undefined,
      images,
      compareAtPrice: values.compareAtPrice ?? undefined,
      expiresAt: values.expiresAt ?? undefined,
    }

    // Validate variants before anything touches the server.
    const normalizedVariants: {
      id: string | null
      name: string
      priceModifier: number
      stock: number
      isActive: boolean
    }[] = []
    for (const v of variants) {
      const name = v.name.trim()
      if (!name) {
        setVariantError(t('vendor.productForm.variantsErrorName'))
        return
      }
      const priceModifier = Number(v.priceModifier)
      if (!Number.isFinite(priceModifier)) {
        setVariantError(t('vendor.productForm.variantsErrorPrice'))
        return
      }
      const stock = Number(v.stock)
      if (!Number.isInteger(stock) || stock < 0) {
        setVariantError(t('vendor.productForm.variantsErrorStock'))
        return
      }
      normalizedVariants.push({ id: v.id, name, priceModifier, stock, isActive: v.isActive })
    }

    try {
      const wasAlreadyPublished = initialData?.status === 'PENDING_REVIEW'
      if (initialData) {
        await updateProduct(initialData.id, payload)
        await updateProductVariants({
          productId: initialData.id,
          variants: normalizedVariants,
        })
      } else {
        await createProduct(payload)
      }
      const baseEventProps = {
        product_id: initialData?.id,
        product_name: values.name,
        category_id: values.categoryId || undefined,
        price: values.basePrice,
        currency: 'EUR',
        status: values.status,
      }
      if (!initialData) {
        trackAnalyticsEvent('seller_product_created', baseEventProps)
      }
      // Fire "published" once when the product transitions into (or is
      // created as) PENDING_REVIEW — that's our "sent to marketplace" moment.
      if (values.status === 'PENDING_REVIEW' && !wasAlreadyPublished) {
        trackAnalyticsEvent('seller_product_published', baseEventProps)
      }
      router.push('/vendor/productos')
      router.refresh()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t('vendor.productForm.saveError'))
      setPendingAction(null)
    }
  }

  function updateVariantField<K extends keyof VariantRow>(
    key: string,
    field: K,
    value: VariantRow[K],
  ) {
    setVariants(prev => prev.map(v => (v.key === key ? { ...v, [field]: value } : v)))
  }

  function removeVariant(key: string) {
    setVariants(prev => prev.filter(v => v.key !== key))
  }

  function addVariant() {
    setVariants(prev => [...prev, makeEmptyVariantRow()])
  }

  function toggleCertification(certification: string) {
    const next = selectedCertifications.includes(certification)
      ? selectedCertifications.filter(item => item !== certification)
      : [...selectedCertifications, certification]

    startTransition(() => {
      setValue('certifications', next, { shouldDirty: true, shouldValidate: true })
    })
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full max-w-full min-w-0 space-y-6 overflow-x-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6"
    >
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-200">
        <p>🌐 {t('vendor.autoTranslateHint')}</p>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input label={t('vendor.nameLabel')} error={errors.name?.message} {...register('name')} />
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label htmlFor="description" className="block text-sm font-medium text-[var(--foreground)]">
            {t('vendor.description')}
          </label>
          <textarea
            id="description"
            rows={3}
            spellCheck
            autoCapitalize="sentences"
            className="w-full min-h-24 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:min-h-40 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            placeholder={t('vendor.descPlaceholder')}
            {...register('description')}
          />
          {errors.description?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.description.message}</p>}
        </div>

        <div className="space-y-1.5">
          {labelRow('categoryId', t('vendor.category'), 'category')}
          <select
            id="categoryId"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            {...categoryRegister}
            onChange={e => {
              markTouched('category')
              categoryRegister.onChange(e)
            }}
          >
            <option value="">{t('vendor.noCategory')}</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.icon ? `${category.icon} ${category.name}` : category.name}
              </option>
            ))}
          </select>
          {errors.categoryId?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.categoryId.message}</p>}
        </div>

        <div className="space-y-1.5">
          {labelRow('originRegion', t('vendor.originRegion'), 'region')}
          <input
            id="originRegion"
            type="text"
            placeholder="Navarra, Jaén, Girona..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            {...originRegionRegister}
            onChange={e => {
              markTouched('region')
              originRegionRegister.onChange(e)
            }}
          />
          {errors.originRegion?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.originRegion.message}</p>}
        </div>

        <Input
          label={t('vendor.basePrice')}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          error={errors.basePrice?.message}
          {...register('basePrice')}
        />

        <div className="space-y-1.5">
          {labelRow('unit', t('vendor.unit'), 'unit')}
          <select
            id="unit"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            {...unitRegister}
            onChange={e => {
              markTouched('unit')
              unitRegister.onChange(e)
            }}
          >
            {unitOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {errors.unit?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.unit.message}</p>}
        </div>

        <Input
          label={t('vendor.compareAtPrice')}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          hint={t('vendor.compareAtHint')}
          error={errors.compareAtPrice?.message}
          {...register('compareAtPrice')}
        />

        <div className="space-y-1.5">
          {labelRow('taxRate', t('vendor.taxRate'), 'tax')}
          <select
            id="taxRate"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            {...taxRateRegister}
            onChange={e => {
              markTouched('tax')
              taxRateRegister.onChange(e)
            }}
          >
            <option value={TAX_RATES.REDUCED}>4%</option>
            <option value={TAX_RATES.STANDARD}>10%</option>
            <option value={TAX_RATES.GENERAL}>21%</option>
          </select>
          {errors.taxRate?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.taxRate.message}</p>}
        </div>

        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3 sm:col-span-2">
          <label htmlFor="trackStock" className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)] cursor-pointer">
            <input
              id="trackStock"
              type="checkbox"
              className="rounded border-[var(--border-strong)] text-emerald-600 accent-emerald-600 dark:accent-emerald-400"
              {...register('trackStock')}
            />
            {t('vendor.trackStock')}
          </label>
          {trackStockValue ? (
            <Input
              label={t('vendor.stock')}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              error={errors.stock?.message}
              {...register('stock')}
            />
          ) : (
            <p className="text-xs text-[var(--muted)] pl-6">{t('vendor.stockUnlimited')}</p>
          )}
        </div>

        <Input
          label={t('vendor.weightGrams')}
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          placeholder="500"
          hint={t('vendor.weightGramsHint')}
          error={errors.weightGrams?.message}
          {...register('weightGrams')}
        />

        <Input
          label={t('vendor.expiresAt')}
          type="date"
          hint={t('vendor.expiresAtHint')}
          error={errors.expiresAt?.message}
          {...register('expiresAt')}
        />

        <div className="space-y-1.5 sm:col-span-2">
          <p className="block text-sm font-medium text-[var(--foreground)]">{t('vendor.certifications')}</p>
          <div className="flex flex-wrap gap-2">
            {CERTIFICATIONS.map(certification => {
              const active = selectedCertifications.includes(certification)
              return (
                <button
                  key={certification}
                  type="button"
                  onClick={() => toggleCertification(certification)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    active
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:border-emerald-300 hover:text-emerald-700 dark:hover:border-emerald-700'
                  }`}
                  disabled={isPending}
                >
                  {certification}
                </button>
              )
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-3 sm:col-span-2">
          <label className="block text-sm font-semibold text-[var(--foreground)]">
            📸 {t('vendor.images')}
          </label>

          <ImageUploader
            urls={validImages}
            disabled={isPending || isSubmitting}
            onChange={next => {
              setValue('imagesText', next.join('\n'), { shouldValidate: true })
            }}
          />

          {errors.imagesText?.message && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
              <span className="shrink-0 text-lg">⚠️</span>
              <span>{errors.imagesText.message}</span>
            </div>
          )}
        </div>

        <input type="hidden" {...register('status')} />
      </div>

      {initialData ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {t('vendor.productForm.variantsTitle')}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {t('vendor.productForm.variantsHint')}
              </p>
            </div>
            <button
              type="button"
              onClick={addVariant}
              className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)]"
            >
              + {t('vendor.productForm.variantsAdd')}
            </button>
          </div>

          {variants.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--muted)]">
              {t('vendor.productForm.variantsEmpty')}
            </p>
          ) : (
            <div className="space-y-2">
              {variants.map(variant => (
                <div
                  key={variant.key}
                  className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-end"
                >
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[var(--muted)]">
                      {t('vendor.productForm.variantsColName')}
                    </label>
                    <input
                      type="text"
                      value={variant.name}
                      onChange={e => updateVariantField(variant.key, 'name', e.target.value)}
                      placeholder="500 g"
                      maxLength={60}
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[var(--muted)]">
                      {t('vendor.productForm.variantsColPriceModifier')}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={variant.priceModifier}
                      onChange={e => updateVariantField(variant.key, 'priceModifier', e.target.value)}
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[var(--muted)]">
                      {t('vendor.productForm.variantsColStock')}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min={0}
                      value={variant.stock}
                      onChange={e => updateVariantField(variant.key, 'stock', e.target.value)}
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-[var(--foreground-soft)]">
                    <input
                      type="checkbox"
                      checked={variant.isActive}
                      onChange={e => updateVariantField(variant.key, 'isActive', e.target.checked)}
                      className="rounded border-[var(--border-strong)] text-emerald-600 accent-emerald-600 dark:accent-emerald-400"
                    />
                    {t('vendor.productForm.variantsColActive')}
                  </label>
                  <button
                    type="button"
                    onClick={() => removeVariant(variant.key)}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                    aria-label={t('vendor.productForm.variantsRemove')}
                  >
                    {t('vendor.productForm.variantsRemove')}
                  </button>
                </div>
              ))}
            </div>
          )}

          {variantError && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {variantError}
            </p>
          )}
        </div>
      ) : null}

      {serverError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
          {serverError}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-[var(--border)] pt-4">
        <p className="text-xs text-[var(--muted)]">{t('vendor.statusHint')}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/vendor/productos')}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            isLoading={isSubmitting && pendingAction === 'DRAFT'}
            disabled={isSubmitting}
            onClick={() => {
              setPendingAction('DRAFT')
              setValue('status', 'DRAFT')
            }}
          >
            {t('vendor.saveDraft')}
          </Button>
          <Button
            type="submit"
            size="sm"
            isLoading={isSubmitting && pendingAction === 'PENDING_REVIEW'}
            disabled={isSubmitting}
            onClick={() => {
              setPendingAction('PENDING_REVIEW')
              setValue('status', 'PENDING_REVIEW')
            }}
          >
            {t('vendor.sendReview')}
          </Button>
        </div>
      </div>
    </form>
  )
}
