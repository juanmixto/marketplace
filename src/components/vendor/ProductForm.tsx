'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CERTIFICATIONS, TAX_RATES } from '@/lib/constants'
import { createProduct, updateProduct } from '@/domains/vendors/actions'
import { formatExpirationDateInput } from '@/domains/catalog/availability'
import { parseAndValidateImages } from '@/lib/image-validation'
import { ImagePreview } from '@/components/vendor/ImagePreview'
import { ImageValidationErrors } from '@/components/vendor/ImageValidationErrors'
import type { Category, Product, ProductVariant } from '@/generated/prisma/client'
import { useT } from '@/i18n'

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

type EditableProduct = Product & {
  category: Category | null
  variants: ProductVariant[]
}

interface ProductFormProps {
  categories: Category[]
  initialData?: EditableProduct
}


export function ProductForm({ categories, initialData }: ProductFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const t = useT()

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
      certifications: initialData?.certifications ?? [],
      originRegion: initialData?.originRegion ?? '',
      imagesText: initialData?.images?.join('\n') ?? '',
      expiresAt: formatExpirationDateInput(initialData?.expiresAt),
      status:
        initialData?.status === 'PENDING_REVIEW'
          ? 'PENDING_REVIEW'
          : 'DRAFT',
    },
  })

  const selectedCertifications = watch('certifications') ?? []
  const isEditing = Boolean(initialData)
  const imagesTextValue = watch('imagesText')
  const { valid: validImages, invalid: invalidImages } = parseAndValidateImages(imagesTextValue)

  async function onSubmit(values: ProductFormValues) {
    setServerError(null)

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

    try {
      if (initialData) {
        await updateProduct(initialData.id, payload)
      } else {
        await createProduct(payload)
      }
      router.push('/vendor/productos')
      router.refresh()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'No se pudo guardar el producto')
    }
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input label={t('vendor.nameLabel')} error={errors.name?.message} {...register('name')} />
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label htmlFor="description" className="block text-sm font-medium text-[var(--foreground)]">
            {t('vendor.description')}
          </label>
          <textarea
            id="description"
            rows={5}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            placeholder={t('vendor.descPlaceholder')}
            {...register('description')}
          />
          {errors.description?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.description.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="categoryId" className="block text-sm font-medium text-[var(--foreground)]">
            {t('vendor.category')}
          </label>
          <select
            id="categoryId"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            {...register('categoryId')}
          >
            <option value="">{t('vendor.noCategory')}</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.categoryId.message}</p>}
        </div>

        <Input
          label={t('vendor.originRegion')}
          placeholder="Navarra, Jaén, Girona..."
          error={errors.originRegion?.message}
          {...register('originRegion')}
        />

        <Input
          label={t('vendor.basePrice')}
          type="number"
          min="0"
          step="0.01"
          error={errors.basePrice?.message}
          {...register('basePrice')}
        />

        <Input
          label={t('vendor.compareAtPrice')}
          type="number"
          min="0"
          step="0.01"
          hint={t('vendor.compareAtHint')}
          error={errors.compareAtPrice?.message}
          {...register('compareAtPrice')}
        />

        <div className="space-y-1.5">
          <label htmlFor="taxRate" className="block text-sm font-medium text-[var(--foreground)]">
            {t('vendor.taxRate')}
          </label>
          <select
            id="taxRate"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            {...register('taxRate')}
          >
            <option value={TAX_RATES.REDUCED}>4%</option>
            <option value={TAX_RATES.STANDARD}>10%</option>
            <option value={TAX_RATES.GENERAL}>21%</option>
          </select>
          {errors.taxRate?.message && <p className="text-xs text-red-600 dark:text-red-400">{errors.taxRate.message}</p>}
        </div>

        <Input label={t('vendor.unit')} placeholder="kg, caja, docena..." error={errors.unit?.message} {...register('unit')} />

        <Input
          label={t('vendor.stock')}
          type="number"
          min="0"
          step="1"
          error={errors.stock?.message}
          {...register('stock')}
        />

        <Input
          label={t('vendor.expiresAt')}
          type="date"
          hint={t('vendor.expiresAtHint')}
          error={errors.expiresAt?.message}
          {...register('expiresAt')}
        />

        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground-soft)]">
          <input id="trackStock" type="checkbox" className="rounded border-[var(--border-strong)] text-emerald-600 accent-emerald-600 dark:accent-emerald-400" {...register('trackStock')} />
          <label htmlFor="trackStock">{t('vendor.trackStock')}</label>
        </div>

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

        <div className="space-y-3 sm:col-span-2">
          <div className="flex items-center justify-between">
            <label htmlFor="imagesText" className="block text-sm font-semibold text-[var(--foreground)]">
              📸 {t('vendor.images')}
            </label>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              {validImages.length} válidas
            </span>
          </div>

          <div className="rounded-lg border border-emerald-200/50 bg-emerald-50/30 p-3 dark:border-emerald-900/30 dark:bg-emerald-950/20">
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              💡 <strong>Consejo:</strong> Sube tus imágenes a Cloudinary o UploadThing y copia las URLs aquí. Una URL por línea.
            </p>
          </div>

          <textarea
            id="imagesText"
            rows={4}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
            placeholder={t('vendor.imagesPlaceholder')}
            {...register('imagesText')}
          />

          {errors.imagesText?.message && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
              <span className="shrink-0 text-lg">⚠️</span>
              <span>{errors.imagesText.message}</span>
            </div>
          )}

          {validImages.length > 0 && (
            <div className="space-y-2">
              <ImagePreview
                urls={validImages}
                onRemove={(url) => {
                  const updated = validImages.filter(u => u !== url).join('\n')
                  setValue('imagesText', updated, { shouldValidate: true })
                }}
              />
            </div>
          )}

          <ImageValidationErrors invalidUrls={invalidImages} />

          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400">
            <span className="shrink-0 text-sm">✅</span>
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-300">Dominios permitidos:</p>
              <ul className="mt-1.5 space-y-1 list-disc list-inside">
                <li><code className="text-[11px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">cloudinary.com</code> (recomendado)</li>
                <li><code className="text-[11px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">uploadthing.com</code> (alternativa)</li>
                <li><code className="text-[11px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">unsplash.com</code> (demos)</li>
              </ul>
              <p className="mt-2 text-gray-500 dark:text-gray-500">Solo se aceptan URLs HTTPS.</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="status" className="block text-sm font-medium text-[var(--foreground)]">
            {t('vendor.statusLabel')}
          </label>
          <select
            id="status"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            {...register('status')}
          >
            <option value="DRAFT">{t('vendor.saveDraft')}</option>
            <option value="PENDING_REVIEW">{t('vendor.sendReview')}</option>
          </select>
          <p className="text-xs text-[var(--muted)]">{t('vendor.statusHint')}</p>
        </div>
      </div>

      {initialData?.variants?.length ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--foreground-soft)]">
          Este producto tiene {initialData.variants.length} variante{initialData.variants.length !== 1 ? 's' : ''}. La edición de variantes aún no está disponible en este formulario.
        </div>
      ) : null}

      {serverError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
          {serverError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.push('/vendor/productos')}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {isEditing ? t('vendor.saveChanges') : t('vendor.createProduct')}
        </Button>
      </div>
    </form>
  )
}
