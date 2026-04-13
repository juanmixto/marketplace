'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { upsertDefaultVendorAddress } from '@/domains/shipping/vendor-address-actions'
import {
  SPAIN_PROVINCES,
  getPrefixForProvince,
  isValidPhone,
  postalCodeMatchesProvince,
} from '@/domains/shipping/spain-provinces'
import { useT } from '@/i18n'

interface Props {
  initial: {
    label?: string | null
    contactName?: string
    phone?: string
    line1?: string
    line2?: string | null
    city?: string
    province?: string
    postalCode?: string
    countryCode?: string
  } | null
}

type FieldErrors = Partial<Record<
  'label' | 'contactName' | 'phone' | 'line1' | 'line2' | 'city' | 'province' | 'postalCode' | 'form',
  string
>>

function sanitizePhoneChar(input: string): string {
  return input.replace(/[^+\d\s()\-]/g, '')
}

export function VendorAddressForm({ initial }: Props) {
  const t = useT()
  const [form, setForm] = useState({
    label: initial?.label ?? '',
    contactName: initial?.contactName ?? '',
    phone: initial?.phone ?? '',
    line1: initial?.line1 ?? '',
    line2: initial?.line2 ?? '',
    city: initial?.city ?? '',
    province: initial?.province ?? '',
    postalCode: initial?.postalCode ?? '',
    countryCode: initial?.countryCode ?? 'ES',
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saved, setSaved] = useState(false)

  function onChange<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    setSaved(false)
    setErrors(prev => ({ ...prev, [key]: undefined, form: undefined }))
  }

  function validateClient(): FieldErrors {
    const next: FieldErrors = {}
    if (form.contactName.trim().length < 2) next.contactName = t('vendor.shippingAddress.errorContactName')
    if (!isValidPhone(form.phone.trim())) next.phone = t('vendor.shippingAddress.errorPhone')
    if (form.line1.trim().length < 3) next.line1 = t('vendor.shippingAddress.errorLine1')
    if (form.city.trim().length < 2) next.city = t('vendor.shippingAddress.errorCity')
    if (!form.province) next.province = t('vendor.shippingAddress.errorProvince')
    if (!/^\d{5}$/.test(form.postalCode)) {
      next.postalCode = t('vendor.shippingAddress.errorPostalCodeFormat')
    } else if (form.province && !postalCodeMatchesProvince(form.postalCode, form.province)) {
      const prefix = getPrefixForProvince(form.province)
      next.postalCode = prefix
        ? t('vendor.shippingAddress.errorPostalCodeProvince').replace('{prefix}', prefix)
        : t('vendor.shippingAddress.errorPostalCodeProvinceGeneric')
    }
    return next
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaved(false)

    const clientErrors = validateClient()
    if (Object.values(clientErrors).some(Boolean)) {
      setErrors(clientErrors)
      return
    }

    setLoading(true)
    setErrors({})
    try {
      const result = await upsertDefaultVendorAddress({
        ...form,
        label: form.label || null,
        line2: form.line2 || null,
      })
      if (!result.ok) {
        setErrors({ ...result.fieldErrors, form: result.message })
      } else {
        setSaved(true)
      }
    } catch (err) {
      setErrors({
        form: err instanceof Error ? err.message : t('vendor.shippingAddress.saveError'),
      })
    } finally {
      setLoading(false)
    }
  }

  const selectCls =
    'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20'

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label={t('vendor.shippingAddress.contactName')}
          value={form.contactName}
          onChange={e => onChange('contactName', e.target.value)}
          error={errors.contactName}
          required
        />
        <Input
          label={t('vendor.shippingAddress.phone')}
          value={form.phone}
          inputMode="tel"
          placeholder="+34 600 000 000"
          onChange={e => onChange('phone', sanitizePhoneChar(e.target.value))}
          error={errors.phone}
          required
        />
      </div>
      <Input
        label={t('vendor.shippingAddress.line1')}
        value={form.line1}
        onChange={e => onChange('line1', e.target.value)}
        error={errors.line1}
        required
      />
      <Input
        label={t('vendor.shippingAddress.line2')}
        value={form.line2}
        onChange={e => onChange('line2', e.target.value)}
        error={errors.line2}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--foreground)]">
            {t('vendor.shippingAddress.province')}
          </label>
          <select
            className={selectCls}
            value={form.province}
            onChange={e => onChange('province', e.target.value)}
            required
          >
            <option value="" disabled>
              {t('vendor.shippingAddress.provincePlaceholder')}
            </option>
            {SPAIN_PROVINCES.map(p => (
              <option key={p.prefix} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.province && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.province}</p>
          )}
        </div>
        <Input
          label={t('vendor.shippingAddress.postalCode')}
          value={form.postalCode}
          inputMode="numeric"
          maxLength={5}
          placeholder="28001"
          onChange={e => onChange('postalCode', e.target.value.replace(/\D/g, '').slice(0, 5))}
          error={errors.postalCode}
          required
        />
        <Input
          label={t('vendor.shippingAddress.city')}
          value={form.city}
          onChange={e => onChange('city', e.target.value)}
          error={errors.city}
          required
        />
      </div>

      {errors.form && <p className="text-sm text-red-600 dark:text-red-400">{errors.form}</p>}
      {saved && !errors.form && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {t('vendor.shippingAddress.saved')}
        </p>
      )}

      <div>
        <Button type="submit" isLoading={loading}>
          {t('vendor.shippingAddress.save')}
        </Button>
      </div>
    </form>
  )
}
