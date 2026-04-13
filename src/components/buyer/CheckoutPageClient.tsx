'use client'

import { useEffect, useRef, useState } from 'react'
import { useCartStore } from '@/domains/orders/cart-store'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createCheckoutOrder } from '@/domains/orders/actions'
import { formatPrice } from '@/lib/utils'
import { SafeImage } from '@/components/catalog/SafeImage'
import {
  calculateShippingCostFromTables,
  type ShippingRateLike,
  type ShippingZoneLike,
} from '@/domains/shipping/shared'
import {
  getPreferredCheckoutAddress,
  toCheckoutFormAddress,
  type SavedCheckoutAddress,
} from '@/domains/orders/checkout'
import {
  SPAIN_PROVINCES,
  SPAIN_PROVINCE_BY_PREFIX,
  getPrefixForProvince,
  isValidPhone,
  postalCodeMatchesProvince,
} from '@/domains/shipping/spain-provinces'
import { useT } from '@/i18n'
import { createAnalyticsItem, trackAnalyticsEvent } from '@/lib/analytics'

const VALID_PROVINCE_NAMES = new Set(Object.values(SPAIN_PROVINCE_BY_PREFIX))

const schema = z
  .object({
    firstName: z.string().trim().min(1, 'Requerido'),
    lastName: z.string().trim().min(1, 'Requerido'),
    line1: z.string().trim().min(5, 'Dirección demasiado corta'),
    line2: z.string().optional(),
    city: z.string().trim().min(1, 'Requerido'),
    province: z
      .string()
      .refine(v => VALID_PROVINCE_NAMES.has(v), 'Selecciona una provincia válida'),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, 'Código postal inválido (5 dígitos)'),
    phone: z
      .string()
      .trim()
      .optional()
      .refine(
        v => !v || isValidPhone(v),
        'Teléfono inválido (solo dígitos, 9-15 cifras)',
      ),
    saveAddress: z.boolean().optional(),
    selectedAddressId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!postalCodeMatchesProvince(value.postalCode, value.province)) {
      const prefix = getPrefixForProvince(value.province)
      ctx.addIssue({
        code: 'custom',
        path: ['postalCode'],
        message: prefix
          ? `El código postal de ${value.province} debe empezar por ${prefix}`
          : 'El código postal no coincide con la provincia',
      })
    }
  })

function sanitizePhoneChar(input: string): string {
  return input.replace(/[^+\d\s()\-]/g, '')
}

type FormData = z.infer<typeof schema>

interface Props {
  shippingZones: ShippingZoneLike[]
  shippingRates: ShippingRateLike[]
  fallbackShippingCost: number
  showDemoNotice: boolean
  userFirstName?: string
  userLastName?: string
}

export function CheckoutPageClient({
  shippingZones,
  shippingRates,
  fallbackShippingCost,
  showDemoNotice,
  userFirstName = '',
  userLastName = '',
}: Props) {
  const router = useRouter()
  const { items, subtotal, clearCart } = useCartStore()
  const [step, setStep] = useState<'address' | 'payment' | 'processing'>('address')
  const [serverError, setServerError] = useState<string | null>(null)
  const [savedAddresses, setSavedAddresses] = useState<SavedCheckoutAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [loadingAddresses, setLoadingAddresses] = useState(true)
  const [addressLoadError, setAddressLoadError] = useState<string | null>(null)
  const [showNewAddressForm, setShowNewAddressForm] = useState(false)
  const [completedOrderNumber, setCompletedOrderNumber] = useState<string | null>(null)
  const t = useT()

  const sub = subtotal()

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: userFirstName,
      lastName: userLastName,
      line1: '',
      line2: '',
      city: '',
      province: '',
      postalCode: '',
      phone: '',
      saveAddress: true,
    },
  })
  const watchedPostalCode = useWatch({ control, name: 'postalCode' }) ?? ''
  const watchedProvince = useWatch({ control, name: 'province' }) ?? ''
  const watchedPhone = useWatch({ control, name: 'phone' }) ?? ''

  const shipping = watchedPostalCode.length === 5
    ? calculateShippingCostFromTables({
        postalCode: watchedPostalCode,
        subtotal: sub,
        zones: shippingZones,
        rates: shippingRates,
        fallbackCost: fallbackShippingCost,
      })
    : fallbackShippingCost
  const total = sub + shipping
  const hasTrackedCheckoutRef = useRef(false)

  useEffect(() => {
    if (items.length === 0 || hasTrackedCheckoutRef.current) return

    hasTrackedCheckoutRef.current = true
    trackAnalyticsEvent('begin_checkout', {
      currency: 'EUR',
      value: total,
      items: items.map(item =>
        createAnalyticsItem({
          id: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          variant: item.variantName,
          brand: item.vendorName,
        })
      ),
    })
  }, [items, total])

  useEffect(() => {
    let cancelled = false

    async function loadSavedAddresses() {
      try {
        setLoadingAddresses(true)
        setAddressLoadError(null)

        const response = await fetch('/api/direcciones')
        if (!response.ok) {
          throw new Error('No se pudieron cargar las direcciones')
        }

        const addresses = await response.json() as SavedCheckoutAddress[]
        if (cancelled) return

        setSavedAddresses(addresses)

        const preferredAddress = getPreferredCheckoutAddress(addresses)
        if (preferredAddress) {
          setSelectedAddressId(preferredAddress.id)
          reset(toCheckoutFormAddress(preferredAddress))
        } else {
          setShowNewAddressForm(true)
        }
      } catch (error) {
        if (cancelled) return
        setAddressLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las direcciones')
      } finally {
        if (!cancelled) {
          setLoadingAddresses(false)
        }
      }
    }

    void loadSavedAddresses()

    return () => {
      cancelled = true
    }
  }, [reset])

  useEffect(() => {
    if (!completedOrderNumber) return

    clearCart()
    router.replace(`/checkout/confirmacion?orderNumber=${encodeURIComponent(completedOrderNumber)}`)
    router.refresh()
  }, [clearCart, completedOrderNumber, router])

  if (items.length === 0 && step !== 'processing' && !completedOrderNumber) {
    router.replace('/carrito')
    return null
  }

  function handleUseSavedAddress(address: SavedCheckoutAddress) {
    setSelectedAddressId(address.id)
    setShowNewAddressForm(false)
    reset(toCheckoutFormAddress(address))
  }

  function handleUseNewAddress() {
    setSelectedAddressId(null)
    setShowNewAddressForm(true)
    reset({
      firstName: userFirstName,
      lastName: userLastName,
      line1: '',
      line2: '',
      city: '',
      province: '',
      postalCode: '',
      phone: '',
      saveAddress: savedAddresses.length === 0,
      selectedAddressId: undefined,
    })
  }

  function handleCopyFromDefault() {
    const defaultAddress =
      savedAddresses.find(a => a.isDefault) ?? savedAddresses[0]
    if (!defaultAddress) return
    setSelectedAddressId(null)
    setShowNewAddressForm(true)
    reset({
      ...toCheckoutFormAddress(defaultAddress),
      saveAddress: true,
      selectedAddressId: undefined,
    })
  }

  async function onSubmit(data: FormData) {
    setServerError(null)
    setStep('processing')

    try {
      const cartItems = items.map(i => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
      }))

      const result = await createCheckoutOrder(cartItems, {
        address: data,
        saveAddress: data.saveAddress,
        selectedAddressId: selectedAddressId ?? undefined,
      })

      if (!result.ok) {
        setServerError(result.error)
        setStep('address')
        return
      }

      const { orderId, orderNumber, clientSecret } = result

      if (clientSecret.startsWith('mock_')) {
        setCompletedOrderNumber(orderNumber)
        return
      }

      router.push(`/checkout/pago?orderId=${orderId}&secret=${clientSecret}`)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Error al procesar el pedido. Inténtalo de nuevo.')
      setStep('address')
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-2xl font-bold text-[var(--foreground)]">{t('checkout.title')}</h1>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 font-semibold text-[var(--foreground)]">{t('checkout.address')}</h2>
              {loadingAddresses && (
                <p className="mb-4 text-sm text-[var(--muted)]">{t('checkout.savedAddressesLoading')}</p>
              )}
              {!loadingAddresses && savedAddresses.length > 0 && (
                <div className="mb-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--foreground)]">{t('checkout.savedAddresses')}</p>
                    {!showNewAddressForm && (
                      <button
                        type="button"
                        onClick={handleUseNewAddress}
                        className="text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                      >
                        {t('checkout.useNewAddress')}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3">
                    {savedAddresses.map(address => {
                      const isSelected = selectedAddressId === address.id
                      return (
                        <button
                          key={address.id}
                          type="button"
                          onClick={() => handleUseSavedAddress(address)}
                          className={`rounded-lg border p-3 text-left transition ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/70 dark:border-emerald-400 dark:bg-emerald-950/20'
                              : 'border-[var(--border)] bg-[var(--surface-raised)] hover:border-emerald-300 dark:hover:border-emerald-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-[var(--foreground)]">
                              {address.firstName} {address.lastName}
                            </p>
                            {address.isDefault && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                {t('account.defaultBadge')}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-[var(--foreground-soft)]">
                            {address.line1}{address.line2 ? `, ${address.line2}` : ''}
                          </p>
                          <p className="text-sm text-[var(--muted)]">
                            {address.postalCode} {address.city}, {address.province}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {addressLoadError && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  {t('checkout.savedAddressesError')}
                </div>
              )}
              <input type="hidden" value={selectedAddressId ?? ''} {...register('selectedAddressId')} />
              {(showNewAddressForm || (!loadingAddresses && savedAddresses.length === 0)) && (
                <div className="space-y-4">
                  {showNewAddressForm && savedAddresses.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCopyFromDefault}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/60 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                    >
                      {t('checkout.copyFromDefault')}
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={t('checkout.firstName')} error={errors.firstName?.message} {...register('firstName')} />
                    <Input label={t('checkout.lastName')} error={errors.lastName?.message} {...register('lastName')} />
                  </div>
                  <Input label={t('checkout.line1')} placeholder={t('checkout.line1Placeholder')} error={errors.line1?.message} {...register('line1')} />
                  <Input label={t('checkout.line2')} {...register('line2')} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-3">
                      <label className="block text-sm font-medium text-[var(--foreground)]">
                        {t('checkout.province')}
                      </label>
                      <select
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                        value={watchedProvince}
                        onChange={e =>
                          setValue('province', e.target.value, {
                            shouldValidate: true,
                            shouldDirty: true,
                          })
                        }
                      >
                        <option value="" disabled>
                          {t('checkout.provincePlaceholder')}
                        </option>
                        {SPAIN_PROVINCES.map(p => (
                          <option key={p.prefix} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {errors.province?.message && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          {errors.province.message}
                        </p>
                      )}
                    </div>
                    <Input
                      label={t('checkout.postalCode')}
                      placeholder={t('checkout.postalCodePlaceholder')}
                      inputMode="numeric"
                      maxLength={5}
                      error={errors.postalCode?.message}
                      {...register('postalCode', {
                        setValueAs: value =>
                          typeof value === 'string'
                            ? value.replace(/\D/g, '').slice(0, 5)
                            : value,
                      })}
                    />
                    <div className="sm:col-span-2">
                      <Input
                        label={t('checkout.city')}
                        error={errors.city?.message}
                        {...register('city')}
                      />
                    </div>
                  </div>
                  <Input
                    label={t('checkout.phone')}
                    type="tel"
                    inputMode="tel"
                    placeholder="+34 600 000 000"
                    error={errors.phone?.message}
                    value={watchedPhone}
                    onChange={e =>
                      setValue('phone', sanitizePhoneChar(e.target.value), {
                        shouldValidate: false,
                        shouldDirty: true,
                      })
                    }
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground-soft)]">
                    <input type="checkbox" {...register('saveAddress')} className="rounded border-[var(--border-strong)] text-emerald-600 accent-emerald-600 dark:accent-emerald-400" />
                    {t('checkout.saveAddress')}
                  </label>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-3 font-semibold text-[var(--foreground)]">{t('checkout.payment')}</h2>
              {showDemoNotice && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-300">
                  <p className="font-medium">{t('checkout.demoMode')}</p>
                  <p className="mt-0.5 text-sky-600 dark:text-sky-400">
                    {t('checkout.demoModeDesc')}
                  </p>
                </div>
              )}
            </div>

            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
                {serverError}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={isSubmitting || step === 'processing'}
            >
              {step === 'processing' ? t('checkout.processing') : `${t('checkout.confirm')} · ${formatPrice(total)}`}
            </Button>
          </form>
        </div>

        <div>
          <div className="sticky top-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="mb-4 font-semibold text-[var(--foreground)]">{t('checkout.yourOrder')}</h2>
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {items.map(item => (
                <div key={`${item.productId}-${item.variantId}`} className="flex gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                    {item.image
                      ? <SafeImage src={item.image} alt={item.name} fill className="object-cover" sizes="48px" />
                      : <div className="flex h-full items-center justify-center text-lg">🌿</div>
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium text-[var(--foreground)]">{item.name}</p>
                    {item.variantName && (
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{item.variantName}</p>
                    )}
                    <p className="text-xs text-[var(--muted)]">× {item.quantity}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-[var(--foreground)]">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-sm">
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>{t('cart.subtotal')}</span><span>{formatPrice(sub)}</span>
              </div>
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>{t('cart.shipping')}</span>
                <span>{shipping === 0 ? <span className="text-emerald-600 dark:text-emerald-400">{t('cart.shippingFree')}</span> : formatPrice(shipping)}</span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-[var(--muted-light)]">
                  {t('checkout.shippingHint')}
                </p>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold text-[var(--foreground)]">
                <span>{t('cart.total')}</span><span>{formatPrice(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
