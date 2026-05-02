'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { TrashIcon, PencilIcon, CheckIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import { trackAnalyticsEvent } from '@/lib/analytics'
import { buyerAddressSchema, type BuyerAddressInput } from '@/domains/auth/buyer-address-schema'
import { SPAIN_PROVINCES, getPrefixForProvince } from '@/domains/shipping/spain-provinces'
import { LocationAutocomplete } from '@/components/ui/LocationAutocomplete'
import type { Municipality } from '@/domains/shipping/municipalities'

type AddressForm = BuyerAddressInput

interface Address extends AddressForm {
  id: string
  createdAt: string
  updatedAt: string
}

interface DireccionesClientProps {
  userFirstName?: string
  userLastName?: string
  /**
   * Addresses pre-fetched on the server. Seeding the store from props
   * avoids the mount-time `fetch('/api/direcciones')` round trip and the
   * "blink to Loading…" that came with it: the list is visible from the
   * first paint. Left optional so existing call sites keep working.
   */
  initialAddresses?: Address[]
}

export function DireccionesClient({
  userFirstName = '',
  userLastName = '',
  initialAddresses,
}: DireccionesClientProps = {}) {
  const router = useRouter()
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses ?? [])
  // If the page already passed server-rendered addresses we can paint
  // immediately; otherwise preserve the old behaviour of showing a
  // loading indicator while the `useEffect` fetches.
  const [loading, setLoading] = useState(initialAddresses === undefined)
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
    getValues,
    watch,
  } = useForm<AddressForm>({
    resolver: zodResolver(buyerAddressSchema),
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    defaultValues: {
      isDefault: false,
    },
  })

  const currentProvince = watch('province') ?? ''
  const currentCity = watch('city') ?? ''

  const handleProvinceChange = (value: string) => {
    setValue('province', value, { shouldValidate: true, shouldDirty: true })
    const prefix = getPrefixForProvince(value)
    if (!prefix) return
    const digits = (getValues('postalCode') ?? '').replace(/\D/g, '').slice(0, 5)
    setValue('postalCode', (prefix + digits.slice(2)).slice(0, 5), {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  const handleMunicipalityPicked = (m: Municipality) => {
    setValue('city', m.name, { shouldValidate: true, shouldDirty: true })
    if (m.postalCodes[0]) {
      setValue('postalCode', m.postalCodes[0], { shouldValidate: true, shouldDirty: true })
    }
  }

  // Only fetch on mount when the caller did NOT pre-seed addresses. When
  // the server-rendered page passes `initialAddresses`, the list is
  // already visible on first paint and a second fetch would just cause
  // a visible flash. Mutations further down keep local state in sync
  // without needing a refetch.
  useEffect(() => {
    if (initialAddresses !== undefined) return
    const loadAddresses = async () => {
      try {
        const res = await fetch('/api/direcciones', { cache: 'no-store' })
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
  }, [initialAddresses])

  const onSubmit = async (data: AddressForm) => {
    const action: 'updated' | 'created' = editingId ? 'updated' : 'created'
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
        setAddresses(addresses.map(a => {
          if (a.id === editingId) return savedAddress
          return savedAddress.isDefault ? { ...a, isDefault: false } : a
        }))
      } else {
        const base = savedAddress.isDefault
          ? addresses.map(a => ({ ...a, isDefault: false }))
          : addresses
        setAddresses([...base, savedAddress])
      }

      trackAnalyticsEvent('address_changed', { action, result: 'success' })

      // Invalidate the Next.js Router Cache so server-rendered pages
      // that read addresses (/checkout, /cuenta/suscripciones/nueva,
      // /cuenta with default-address summary) re-fetch on next nav.
      router.refresh()

      reset()
      setShowForm(false)
      setEditingId(null)
    } catch {
      trackAnalyticsEvent('address_changed', { action, result: 'failure' })
      setError('Error al guardar dirección')
    }
  }

  const handleEdit = (address: Address) => {
    setEditingId(address.id)
    Object.keys(address).forEach(key => {
      if (key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic field copy; keys are filtered above
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
      trackAnalyticsEvent('address_changed', { action: 'deleted', result: 'success' })
      router.refresh()
    } catch {
      trackAnalyticsEvent('address_changed', { action: 'deleted', result: 'failure' })
      setError('Error al eliminar dirección')
    } finally {
      setDeleting(null)
    }
  }

  const startNewAddress = () => {
    setEditingId(null)
    reset({
      label: '',
      firstName: userFirstName,
      lastName: userLastName,
      line1: '',
      line2: '',
      city: '',
      province: '',
      postalCode: '',
      isDefault: addresses.length === 0,
    })
    setShowForm(true)
  }

  const handleCopyFromDefault = () => {
    const source = addresses.find(a => a.isDefault) ?? addresses[0]
    if (!source) return
    reset({
      label: '',
      firstName: source.firstName,
      lastName: source.lastName,
      line1: source.line1,
      line2: source.line2 ?? '',
      city: source.city,
      province: source.province,
      postalCode: source.postalCode,
      isDefault: false,
    })
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
      trackAnalyticsEvent('address_changed', { action: 'set_default', result: 'success' })
      router.refresh()
    } catch {
      trackAnalyticsEvent('address_changed', { action: 'set_default', result: 'failure' })
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              {editingId ? t('account.editAddress') : t('account.newAddress')}
            </h2>
            {!editingId && addresses.length > 0 && (
              <button
                type="button"
                onClick={handleCopyFromDefault}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/60 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
              >
                {t('account.copyFromDefault')}
              </button>
            )}
          </div>

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
                  autoComplete="given-name"
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
                  autoComplete="family-name"
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
                  autoComplete="address-line1"
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
                  autoComplete="address-line2"
                  placeholder={t('account.line2Placeholder')}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.line2 && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.line2.message}</p>}
              </div>

              {/* Province */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.province')}</label>
                <select
                  value={currentProvince}
                  onChange={e => handleProvinceChange(e.target.value)}
                  autoComplete="address-level1"
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">{t('account.selectProvince')}</option>
                  {SPAIN_PROVINCES.map(p => (
                    <option key={p.prefix} value={p.name}>{p.name}</option>
                  ))}
                </select>
                {errors.province && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.province.message}</p>}
              </div>

              {/* City — autocomplete */}
              <div>
                <LocationAutocomplete
                  label={t('account.city')}
                  value={currentCity}
                  province={currentProvince}
                  onChangeText={value => setValue('city', value, { shouldDirty: true })}
                  onSelect={handleMunicipalityPicked}
                  error={errors.city?.message}
                  placeholder={t('account.cityPlaceholder')}
                  autoComplete="address-level2"
                />
              </div>

              {/* PostalCode */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">{t('account.postalCode')}</label>
                <input
                  {...register('postalCode')}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={5}
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

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleEdit(address)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                >
                  <PencilIcon className="h-4 w-4" />
                  {t('account.edit')}
                </button>
                {!address.isDefault && (
                  <button
                    onClick={() => handleSetDefault(address.id)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                  >
                    {t('account.setAsDefault')}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(address.id)}
                  disabled={deleting === address.id}
                  className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800/70 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
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
          onClick={startNewAddress}
          className="rounded-lg bg-emerald-600 dark:bg-emerald-500 px-4 py-2 font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition"
        >
          {t('account.addAddress')}
        </button>
      )}
    </div>
  )
}
