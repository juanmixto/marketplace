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
import type { Category, Product, ProductVariant } from '@/generated/prisma/client'

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
  imagesText: z.string().optional(),
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

function parseImages(value?: string) {
  if (!value) return []
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

export function ProductForm({ categories, initialData }: ProductFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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

  async function onSubmit(values: ProductFormValues) {
    setServerError(null)

    const payload = {
      ...values,
      categoryId: values.categoryId || undefined,
      description: values.description?.trim() || undefined,
      originRegion: values.originRegion?.trim() || undefined,
      images: parseImages(values.imagesText),
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input label="Nombre" error={errors.name?.message} {...register('name')} />
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Descripción
          </label>
          <textarea
            id="description"
            rows={5}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Cuenta qué hace especial a este producto"
            {...register('description')}
          />
          {errors.description?.message && <p className="text-xs text-red-600">{errors.description.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700">
            Categoría
          </label>
          <select
            id="categoryId"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            {...register('categoryId')}
          >
            <option value="">Sin categoría</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId?.message && <p className="text-xs text-red-600">{errors.categoryId.message}</p>}
        </div>

        <Input
          label="Región de origen"
          placeholder="Navarra, Jaén, Girona..."
          error={errors.originRegion?.message}
          {...register('originRegion')}
        />

        <Input
          label="Precio base"
          type="number"
          min="0"
          step="0.01"
          error={errors.basePrice?.message}
          {...register('basePrice')}
        />

        <Input
          label="Precio comparado"
          type="number"
          min="0"
          step="0.01"
          hint="Opcional, para mostrar oferta"
          error={errors.compareAtPrice?.message}
          {...register('compareAtPrice')}
        />

        <div className="space-y-1.5">
          <label htmlFor="taxRate" className="block text-sm font-medium text-gray-700">
            IVA
          </label>
          <select
            id="taxRate"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            {...register('taxRate')}
          >
            <option value={TAX_RATES.REDUCED}>4%</option>
            <option value={TAX_RATES.STANDARD}>10%</option>
            <option value={TAX_RATES.GENERAL}>21%</option>
          </select>
          {errors.taxRate?.message && <p className="text-xs text-red-600">{errors.taxRate.message}</p>}
        </div>

        <Input label="Unidad" placeholder="kg, caja, docena..." error={errors.unit?.message} {...register('unit')} />

        <Input
          label="Stock"
          type="number"
          min="0"
          step="1"
          error={errors.stock?.message}
          {...register('stock')}
        />

        <Input
          label="Fecha de caducidad"
          type="date"
          hint="Si llega esta fecha sin venderse, el producto dejará de aparecer en la tienda."
          error={errors.expiresAt?.message}
          {...register('expiresAt')}
        />

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <input id="trackStock" type="checkbox" className="rounded border-gray-300 text-emerald-600" {...register('trackStock')} />
          <label htmlFor="trackStock">Controlar stock</label>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <p className="block text-sm font-medium text-gray-700">Certificaciones</p>
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
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-emerald-300 hover:text-emerald-700'
                  }`}
                  disabled={isPending}
                >
                  {certification}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="imagesText" className="block text-sm font-medium text-gray-700">
            Imágenes
          </label>
          <textarea
            id="imagesText"
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Una URL por línea"
            {...register('imagesText')}
          />
          {errors.imagesText?.message && <p className="text-xs text-red-600">{errors.imagesText.message}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">
            Estado inicial
          </label>
          <select
            id="status"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            {...register('status')}
          >
            <option value="DRAFT">Guardar como borrador</option>
            <option value="PENDING_REVIEW">Enviar a revisión</option>
          </select>
          <p className="text-xs text-gray-500">Puedes editar borradores y reenviar productos rechazados más adelante.</p>
        </div>
      </div>

      {initialData?.variants?.length ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Este producto tiene {initialData.variants.length} variante{initialData.variants.length !== 1 ? 's' : ''}. La edición de variantes aún no está disponible en este formulario.
        </div>
      ) : null}

      {serverError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.push('/vendor/productos')}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {isEditing ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </div>
    </form>
  )
}
