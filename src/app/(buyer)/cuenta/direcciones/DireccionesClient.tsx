'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TrashIcon, PencilIcon, CheckIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'

const addressSchema = z.object({
  label: z.string().max(50).optional(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  line1: z.string().min(1).max(200),
  line2: z.string().max(100).optional(),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  postalCode: z.string().regex(/^\d{5}$/, 'Código postal español: 5 dígitos'),
  isDefault: z.boolean(),
})

type AddressForm = z.infer<typeof addressSchema>

interface Address extends AddressForm {
  id: string
  createdAt: string
  updatedAt: string
}

const SPANISH_PROVINCES = [
  'Álava', 'Albacete', 'Alicante', 'Almería', 'Ávila', 'Badajoz', 'Baleares', 'Barcelona',
  'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ciudad Real', 'Córdoba', 'Coruña',
  'Cuenca', 'Guipúzcoa', 'Girona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca', 'Jaén',
  'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Palencia',
  'Palmas', 'Pontevedra', 'Rioja', 'Salamanca', 'Segovia', 'Sevilla', 'Soria', 'Tarragona',
  'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla',
]

export function DireccionesClient() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const t = useT()

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      isDefault: false,
    },
  })

  // Load addresses on mount
  useEffect(() => {
    const loadAddresses = async () => {
      try {
        const res = await fetch('/api/direcciones')
        if (!res.ok) throw new Error('Error al cargar direcciones')
        const data = await res.json()
        setAddresses(data)
      } catch {
        setError('Error al cargar direcciones')
      } finally {
        setLoading(false)
      }
    }
    loadAddresses()
  }, [])

  const onSubmit = async (data: AddressForm) => {
    try {
      setError(null)
      const url = editingId ? `/api/direcciones/${editingId}` : '/api/direcciones'
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) throw new Error('Error al guardar dirección')

      const savedAddress = await res.json()

      if (editingId) {
        setAddresses(addresses.map(a => a.id === editingId ? savedAddress : a))
      } else {
        setAddresses([...addresses, savedAddress])
      }

      reset()
      setShowForm(false)
      setEditingId(null)
    } catch {
      setError('Error al guardar dirección')
    }
  }

  const handleEdit = (address: Address) => {
    setEditingId(address.id)
    Object.keys(address).forEach(key => {
      if (key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
        setValue(key as keyof AddressForm, (address as any)[key])
      }
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta dirección?')) return

    try {
      setDeleting(id)
      const res = await fetch(`/api/direcciones/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Error al eliminar')
      setAddresses(addresses.filter(a => a.id !== id))
    } catch {
      setError('Error al eliminar dirección')
    } finally {
      setDeleting(null)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/direcciones/${id}/predeterminada`, {
        method: 'PUT',
      })
      if (!res.ok) throw new Error('Error al establecer default')

      // Update local addresses
      setAddresses(addresses.map(a => ({
        ...a,
        isDefault: a.id === id,
      })))
    } catch {
      setError('Error al establecer dirección predeterminada')
    }
  }

  if (loading) {
    return <div className="text-center text-[var(--muted)]">{t('account.loadingAddresses')}</div>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-300">
          ✗ {error}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
            {editingId ? t('account.editAddress') : t('account.newAddress')}
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.labelField')}</label>
                <input
                  {...register('label')}
                  placeholder={t('account.labelPlaceholder')}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.label && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.label.message}</p>}
              </div>

              {/* FirstName */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.firstName')}</label>
                <input
                  {...register('firstName')}
                  placeholder={t('account.firstNamePlaceholder')}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.firstName && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.firstName.message}</p>}
              </div>

              {/* LastName */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.lastName')}</label>
                <input
                  {...register('lastName')}
                  placeholder={t('account.lastNamePlaceholder')}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.lastName && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.lastName.message}</p>}
              </div>

              {/* Line1 */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.line1')}</label>
                <input
                  {...register('line1')}
                  placeholder={t('account.line1Placeholder')}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.line1 && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.line1.message}</p>}
              </div>

              {/* Line2 */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.line2Field')}</label>
                <input
                  {...register('line2')}
                  placeholder={t('account.line2Placeholder')}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.line2 && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.line2.message}</p>}
              </div>

              {/* City */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.city')}</label>
                <input
                  {...register('city')}
                  placeholder={t('account.cityPlaceholder')}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.city && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.city.message}</p>}
              </div>

              {/* Province */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.province')}</label>
                <select
                  {...register('province')}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">{t('account.selectProvince')}</option>
                  {SPANISH_PROVINCES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {errors.province && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.province.message}</p>}
              </div>

              {/* PostalCode */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.postalCode')}</label>
                <input
                  {...register('postalCode')}
                  placeholder="28001"
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.postalCode && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.postalCode.message}</p>}
              </div>

              {/* IsDefault */}
              <div className="flex items-center gap-2">
                <input
                  {...register('isDefault')}
                  type="checkbox"
                  id="isDefault"
                  className="h-4 w-4 rounded border-[var(--border)] accent-emerald-600"
                />
                <label htmlFor="isDefault" className="text-sm font-medium text-[var(--foreground)]">
                  {t('account.setAsDefault')}
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 transition"
              >
                {editingId ? t('account.update') : t('account.saveAddress')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                  reset()
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface)] transition"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Addresses List */}
      {!showForm && addresses.length > 0 && (
        <div className="space-y-4">
          {addresses.map(address => (
            <div key={address.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="font-semibold text-[var(--foreground)]">
                      {address.firstName} {address.lastName}
                    </h3>
                    {address.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckIcon className="h-3 w-3" />
                        {t('account.defaultBadge')}
                      </span>
                    )}
                  </div>
                  {address.label && (
                    <p className="text-sm text-[var(--muted)]">{address.label}</p>
                  )}
                </div>
              </div>

              <div className="mb-3 text-sm text-[var(--muted)]">
                <p>{address.line1}</p>
                {address.line2 && <p>{address.line2}</p>}
                <p>{address.city}, {address.province} {address.postalCode}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(address)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                >
                  <PencilIcon className="h-4 w-4" />
                  {t('account.edit')}
                </button>
                {!address.isDefault && (
                  <button
                    onClick={() => handleSetDefault(address.id)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {t('account.setAsDefault')}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(address.id)}
                  disabled={deleting === address.id}
                  className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                  {t('account.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!showForm && addresses.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--surface-raised)] p-8 text-center shadow-sm">
          <p className="text-[var(--muted)]">{t('account.noAddresses')}</p>
        </div>
      )}

      {/* Add Button */}
      {!showForm && (
        <button
          onClick={() => {
            setShowForm(true)
            reset()
          }}
          className="rounded-lg bg-emerald-600 dark:bg-emerald-500 px-4 py-2 font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition"
        >
          {t('account.addAddress')}
        </button>
      )}
    </div>
  )
}
