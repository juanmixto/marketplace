'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { upsertDefaultVendorAddress } from '@/domains/shipping/vendor-address-actions'
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
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function onChange<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      await upsertDefaultVendorAddress({
        ...form,
        label: form.label || null,
        line2: form.line2 || null,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vendor.shippingAddress.saveError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label={t('vendor.shippingAddress.contactName')}
          value={form.contactName}
          onChange={e => onChange('contactName', e.target.value)}
          required
        />
        <Input
          label={t('vendor.shippingAddress.phone')}
          value={form.phone}
          onChange={e => onChange('phone', e.target.value)}
          required
        />
      </div>
      <Input
        label={t('vendor.shippingAddress.line1')}
        value={form.line1}
        onChange={e => onChange('line1', e.target.value)}
        required
      />
      <Input
        label={t('vendor.shippingAddress.line2')}
        value={form.line2}
        onChange={e => onChange('line2', e.target.value)}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          label={t('vendor.shippingAddress.postalCode')}
          value={form.postalCode}
          onChange={e => onChange('postalCode', e.target.value)}
          required
        />
        <Input
          label={t('vendor.shippingAddress.city')}
          value={form.city}
          onChange={e => onChange('city', e.target.value)}
          required
        />
        <Input
          label={t('vendor.shippingAddress.province')}
          value={form.province}
          onChange={e => onChange('province', e.target.value)}
          required
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && !error && (
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
