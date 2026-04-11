'use client'

import { useEffect, useRef, useState } from 'react'
import { useCartStore } from '@/lib/cart-store'
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
import { useT } from '@/i18n'
import { createAnalyticsItem, trackAnalyticsEvent } from '@/lib/analytics'

const schema = z.object({
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().min(1, 'Requerido'),
  line1: z.string().min(5, 'Dirección demasiado corta'),
  line2: z.string().optional(),
  city: z.string().min(1, 'Requerido'),
  province: z.string().min(1, 'Requerido'),
  postalCode: z.string().regex(/^\d{5}$/, 'Código postal inválido (5 dígitos)'),
  phone: z.string().optional(),
  saveAddress: z.boolean().optional(),
  selectedAddressId: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  shippingZones: ShippingZoneLike[]
  shippingRates: ShippingRateLike[]
  fallbackShippingCost: number
  showDemoNotice: boolean
}

export function CheckoutPageClient({
  shippingZones,
  shippingRates,
  fallbackShippingCost,
  showDemoNotice,
}: Props) {
  const router = useRouter()
  const { items, subtotal, clearCart } = useCartStore()
  const [step, setStep] = useState<'address' | 'payment' | 'processing'>('address')
  const [serverError, setServerError] = useState<string | null>(null)
  const [savedAddresses, setSavedAddresses] = useState<SavedCheckoutAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [loadingAddresses, setLoadingAddresses] = useState(true)
  const [addressLoadError, setAddressLoadError] = useState<string | null>(null)
  const t = useT()

  const sub = subtotal()

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })
  const watchedPostalCode = useWatch({ control, name: 'postalCode' }) ?? ''

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

  if (items.length === 0) {
    router.replace('/carrito')
    return null
  }

  function handleUseSavedAddress(address: SavedCheckoutAddress) {
    setSelectedAddressId(address.id)
    reset(toCheckoutFormAddress(address))
  }

  function handleUseNewAddress() {
    setSelectedAddressId(null)
    reset({
      firstName: '',
      lastName: '',
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

      const { orderId, clientSecret } = result

      if (clientSecret.startsWith('mock_')) {
        clearCart()
        router.push(`/cuenta/pedidos/${orderId}?nuevo=1`)
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
                    <button
                      type="button"
                      onClick={handleUseNewAddress}
                      className="text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      {t('checkout.useNewAddress')}
                    </button>
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
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input label={t('checkout.firstName')} error={errors.firstName?.message} {...register('firstName')} />
                  <Input label={t('checkout.lastName')} error={errors.lastName?.message} {...register('lastName')} />
                </div>
                <Input label={t('checkout.line1')} placeholder={t('checkout.line1Placeholder')} error={errors.line1?.message} {...register('line1')} />
                <Input label={t('checkout.line2')} {...register('line2')} />
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Input label={t('checkout.city')} error={errors.city?.message} {...register('city')} />
                  </div>
                  <Input label={t('checkout.postalCode')} placeholder={t('checkout.postalCodePlaceholder')} error={errors.postalCode?.message} {...register('postalCode')} />
                </div>
                <Input label={t('checkout.province')} error={errors.province?.message} {...register('province')} />
                <Input label={t('checkout.phone')} type="tel" {...register('phone')} />
                <input type="hidden" value={selectedAddressId ?? ''} {...register('selectedAddressId')} />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground-soft)]">
                  <input type="checkbox" {...register('saveAddress')} className="rounded border-[var(--border-strong)] text-emerald-600 accent-emerald-600 dark:accent-emerald-400" />
                  {t('checkout.saveAddress')}
                </label>
              </div>
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
