'use client'

import { useEffect, useRef, useState } from 'react'
import { useCartStore } from '@/domains/orders/cart-store'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createCheckoutOrder } from '@/domains/orders/actions'
import { previewPromotionsForCart, type PromotionPreviewResult } from '@/domains/promotions/checkout'
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
  checkoutFormSchema,
  type CheckoutFormInput,
  type SavedCheckoutAddress,
} from '@/domains/orders/checkout'
import { applyCartDiscounts } from '@/domains/pricing'
import {
  SPAIN_PROVINCES,
} from '@/domains/shipping/spain-provinces'
import { useT } from '@/i18n'
import { createAnalyticsItem, trackAnalyticsEvent } from '@/lib/analytics'
import { CheckoutProgress } from '@/components/checkout/CheckoutProgress'

function sanitizePhoneChar(input: string): string {
  return input.replace(/[^+\d\s()\-]/g, '')
}

const schema = checkoutFormSchema
type FormData = CheckoutFormInput

interface Props {
  shippingZones: ShippingZoneLike[]
  shippingRates: ShippingRateLike[]
  fallbackShippingCost: number
  showDemoNotice: boolean
  userFirstName?: string
  userLastName?: string
  /**
   * Server-issued idempotency token (#410/#524). Generated fresh on
   * every render of the checkout page. The client holds it in a ref
   * across re-renders so React state churn never regenerates it mid-
   * submit. Submitted alongside the cart; the backend uses it to
   * dedupe double-clicks, tab refreshes, and concurrent races.
   */
  checkoutAttemptId: string
  /**
   * Addresses pre-fetched by the server component. When provided, the
   * client skips the mount-time `fetch('/api/direcciones')` — which on
   * the critical checkout path used to add 100–300 ms of "Loading…"
   * before the buyer could pick an address. Optional so existing call
   * sites fall back to the legacy client-fetch path.
   */
  initialAddresses?: SavedCheckoutAddress[]
}

export function CheckoutPageClient({
  shippingZones,
  shippingRates,
  fallbackShippingCost,
  showDemoNotice,
  userFirstName = '',
  userLastName = '',
  checkoutAttemptId,
  initialAddresses,
}: Props) {
  const router = useRouter()
  const { items, subtotal, clearCart } = useCartStore()
  const cartHydrated = useCartStore(state => state.hasHydrated)
  const [step, setStep] = useState<'address' | 'payment' | 'processing'>('address')
  const [serverError, setServerError] = useState<string | null>(null)
  const hasInitialAddresses = initialAddresses !== undefined
  const [savedAddresses, setSavedAddresses] = useState<SavedCheckoutAddress[]>(
    initialAddresses ?? [],
  )
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(() => {
    if (!hasInitialAddresses) return null
    return getPreferredCheckoutAddress(initialAddresses!)?.id ?? null
  })
  // If the server supplied addresses there is nothing to load.
  const [loadingAddresses, setLoadingAddresses] = useState(!hasInitialAddresses)
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
    getValues,
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

  const baseShipping = watchedPostalCode.length === 5
    ? calculateShippingCostFromTables({
        postalCode: watchedPostalCode,
        subtotal: sub,
        zones: shippingZones,
        rates: shippingRates,
        fallbackCost: fallbackShippingCost,
      })
    : fallbackShippingCost

  // Phase 2 of the promotions RFC — coupon input + discount preview.
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [appliedCode, setAppliedCode] = useState<string | null>(null)
  const [promoPreview, setPromoPreview] = useState<PromotionPreviewResult | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [promoPending, setPromoPending] = useState(false)

  const { subtotalDiscount, shippingDiscount, shipping, total } = applyCartDiscounts(sub, baseShipping, {
    subtotalDiscount: promoPreview?.subtotalDiscount,
    shippingDiscount: promoPreview?.shippingDiscount,
  })

  useEffect(() => {
    let cancelled = false
    if (items.length === 0) {
      setPromoPreview(null)
      return
    }

    setPromoPending(true)
    previewPromotionsForCart({
      items: items.map(i => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
      })),
      code: appliedCode,
      shippingCost: baseShipping,
    })
      .then(result => {
        if (cancelled) return
        setPromoPreview(result)
        if (appliedCode && result.unknownCodes.includes(appliedCode.toUpperCase())) {
          setPromoError(t('checkout.promo.invalidCode').replace('{code}', appliedCode))
          setAppliedCode(null)
          // Do NOT clear promoError on the follow-up preview run — the
          // error is only cleared by explicit user action (apply/clear),
          // otherwise it flashes away before the user can read it.
        }
      })
      .catch(() => {
        if (cancelled) return
        setPromoPreview(null)
      })
      .finally(() => {
        if (!cancelled) setPromoPending(false)
      })

    return () => {
      cancelled = true
    }
  }, [items, appliedCode, baseShipping, t])

  function handleApplyPromoCode() {
    const trimmed = promoCodeInput.trim().toUpperCase()
    if (!trimmed) return
    setPromoError(null)
    setAppliedCode(trimmed)
  }

  function handleClearPromoCode() {
    setPromoCodeInput('')
    setAppliedCode(null)
    setPromoError(null)
  }

  const hasTrackedCheckoutRef = useRef(false)
  const hasRedirectedToCartRef = useRef(false)
  // #524: keep the server-issued attempt id stable across re-renders.
  // Declared at the top of the component alongside other hooks — hooks
  // cannot live below conditional returns.
  const attemptIdRef = useRef(checkoutAttemptId)
  const shouldRedirectToCart = cartHydrated && items.length === 0 && step !== 'processing' && !completedOrderNumber

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

    // Fast path: the server already handed us the address list, so we
    // just seed the form from the preferred address and skip the
    // network round-trip. The slow path keeps the previous behaviour
    // intact for callers that don't pre-fetch.
    if (hasInitialAddresses) {
      const preferredAddress = getPreferredCheckoutAddress(initialAddresses!)
      if (preferredAddress) {
        reset(toCheckoutFormAddress(preferredAddress))
      } else {
        setShowNewAddressForm(true)
      }
      return
    }

    async function loadSavedAddresses() {
      try {
        setLoadingAddresses(true)
        setAddressLoadError(null)

        const response = await fetch('/api/direcciones', { cache: 'no-store' })
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
  }, [reset, hasInitialAddresses, initialAddresses])

  useEffect(() => {
    if (!completedOrderNumber) return

    clearCart()
    // #270 — if the buyer was authenticated, their cart is also
    // persisted server-side. Wipe it so the next login on any device
    // doesn't bring back the purchased items. Fire-and-forget: the
    // redirect below is the user-visible success path; a transient
    // failure just leaves a stale server cart that the next login
    // merge will reconcile.
    void import('@/domains/orders/cart-actions')
      .then(mod => mod.clearMyServerCart())
      .catch(() => {})
    router.replace(`/checkout/confirmacion?orderNumber=${encodeURIComponent(completedOrderNumber)}`)
    router.refresh()
  }, [clearCart, completedOrderNumber, router])

  useEffect(() => {
    if (!shouldRedirectToCart || hasRedirectedToCartRef.current) return
    hasRedirectedToCartRef.current = true
    router.replace('/carrito')
  }, [router, shouldRedirectToCart])

  if (!cartHydrated) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
            {t('checkout.flowLabel')}
          </p>
          <h1 className="mt-3 text-2xl font-bold text-[var(--foreground)]">{t('checkout.title')}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{t('cart.title')}…</p>
        </div>
      </div>
    )
  }

  if (shouldRedirectToCart) {
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

      const result = await createCheckoutOrder(
        cartItems,
        {
          address: data,
          saveAddress: data.saveAddress,
          selectedAddressId: selectedAddressId ?? undefined,
        },
        { promotionCode: appliedCode, checkoutAttemptId: attemptIdRef.current }
      )

      if (!result.ok) {
        setServerError(result.error)
        setStep('address')
        return
      }

      const { orderId, orderNumber, clientSecret, replayed } = result

      // #524 replay path: the backend found an existing Order for this
      // attempt id. That means a previous submit (maybe from a dropped
      // network response, a tab refresh, or a concurrent click) already
      // committed it. Send the buyer to the confirmation page without
      // re-attempting payment — re-confirming would either be a no-op
      // (idempotent by providerRef) or hit a stale Stripe session.
      if (replayed) {
        router.push(`/checkout/confirmacion?orderNumber=${orderNumber}&replayed=1`)
        return
      }

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

  // When the user picks a saved address, the server trusts the stored
  // row and ignores the client address payload (see `createOrder` →
  // `validated.selectedAddressId`). Client-side validation must therefore
  // not block that path: an older saved address with a value that no
  // longer matches the current zod regex would silently fail the hidden
  // form and leave the submit button doing nothing. This guard submits
  // directly in that case, bypassing the form validator entirely.
  function handleConfirmClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!selectedAddressId || showNewAddressForm) return
    e.preventDefault()
    void onSubmit(getValues())
  }

  // When validation fails on a hidden address form, surface a friendly
  // error AND reveal the form so the user can actually see what is wrong.
  function handleInvalid(formErrors: Record<string, unknown>) {
    if (!showNewAddressForm && !selectedAddressId) {
      setShowNewAddressForm(true)
    }
    console.warn('[checkout] form validation blocked submission', formErrors)
    setServerError(t('checkout.reviewAddressError'))
  }

  return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 space-y-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('checkout.title')}</h1>
        <CheckoutProgress
          title={t('checkout.flowLabel')}
          subtitle={t('checkout.flowSubtitle')}
          currentStep={1}
          steps={[
            { label: t('checkout.flowStepAddress'), description: t('checkout.flowStepAddressDesc') },
            { label: t('checkout.flowStepPayment'), description: t('checkout.flowStepPaymentDesc') },
          ]}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit(onSubmit, handleInvalid)} className="space-y-6">
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
                <div className="grid gap-3" data-testid="checkout-saved-addresses">
                  {savedAddresses.map(address => {
                    const isSelected = selectedAddressId === address.id
                    return (
                      <button
                        key={address.id}
                        type="button"
                        onClick={() => handleUseSavedAddress(address)}
                        data-testid="checkout-saved-address"
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
                    <Input label={t('checkout.firstName')} autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
                    <Input label={t('checkout.lastName')} autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
                  </div>
                  <Input label={t('checkout.line1')} autoComplete="address-line1" placeholder={t('checkout.line1Placeholder')} error={errors.line1?.message} {...register('line1')} />
                  <Input label={t('checkout.line2')} autoComplete="address-line2" {...register('line2')} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-3">
                      <label className="block text-sm font-medium text-[var(--foreground)]">
                        {t('checkout.province')}
                      </label>
                      <select
                        autoComplete="address-level1"
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
                      autoComplete="postal-code"
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
                        autoComplete="address-level2"
                        error={errors.city?.message}
                        {...register('city')}
                      />
                    </div>
                  </div>
                  <Input
                    label={t('checkout.phone')}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
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
              onClick={handleConfirmClick}
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
              {subtotalDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span className="flex items-center gap-1">
                    {t('checkout.promo.discountLine')}
                    {promoPreview?.appliedByVendor[0]?.name && (
                      <span className="text-xs text-[var(--muted)]">
                        ({promoPreview.appliedByVendor[0].name}
                        {promoPreview.appliedByVendor.length > 1 ? '…' : ''})
                      </span>
                    )}
                  </span>
                  <span>−{formatPrice(subtotalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>{t('cart.shipping')}</span>
                <span>{shipping === 0 ? <span className="text-emerald-600 dark:text-emerald-400">{t('cart.shippingFree')}</span> : formatPrice(shipping)}</span>
              </div>
              {shippingDiscount > 0 && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {t('checkout.promo.freeShippingApplied')}
                </p>
              )}
              {shipping > 0 && shippingDiscount === 0 && (
                <p className="text-xs text-[var(--muted-light)]">
                  {t('checkout.shippingHint')}
                </p>
              )}

              {/* Coupon code input */}
              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <label className="block text-xs font-medium text-[var(--foreground-soft)]">
                  {t('checkout.promo.label')}
                </label>
                {appliedCode ? (
                  <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-800 dark:bg-emerald-950/40">
                    <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                      {appliedCode}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearPromoCode}
                      className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                    >
                      {t('checkout.promo.remove')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={promoCodeInput}
                      onChange={e => setPromoCodeInput(e.target.value.toUpperCase())}
                      placeholder={t('checkout.promo.placeholder')}
                      className="h-9 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-xs uppercase text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                    />
                    <button
                      type="button"
                      onClick={handleApplyPromoCode}
                      disabled={!promoCodeInput.trim() || promoPending}
                      className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] disabled:opacity-60"
                    >
                      {t('checkout.promo.apply')}
                    </button>
                  </div>
                )}
                {promoError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                    {promoError}
                  </p>
                )}
              </div>

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
