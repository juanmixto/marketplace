'use client'

import { useEffect, useRef, useState } from 'react'
import { useCartStore } from '@/lib/cart-store'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createOrder, confirmOrder } from '@/domains/orders/actions'
import { formatPrice } from '@/lib/utils'
import { SafeImage } from '@/components/catalog/SafeImage'
import {
  calculateShippingCostFromTables,
  type ShippingRateLike,
  type ShippingZoneLike,
} from '@/domains/shipping/shared'
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

  const sub = subtotal()

  const {
    register,
    handleSubmit,
    control,
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

  if (items.length === 0) {
    router.replace('/carrito')
    return null
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

      const { orderId, clientSecret } = await createOrder(cartItems, {
        address: data,
        saveAddress: data.saveAddress,
      })

      if (clientSecret.startsWith('mock_')) {
        await confirmOrder(orderId, clientSecret.replace('_secret', ''))
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
      <h1 className="mb-8 text-2xl font-bold text-[var(--foreground)]">Finalizar pedido</h1>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 font-semibold text-[var(--foreground)]">Dirección de entrega</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Nombre" error={errors.firstName?.message} {...register('firstName')} />
                  <Input label="Apellidos" error={errors.lastName?.message} {...register('lastName')} />
                </div>
                <Input label="Dirección" placeholder="Calle, número, piso..." error={errors.line1?.message} {...register('line1')} />
                <Input label="Piso / Apartamento (opcional)" {...register('line2')} />
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Input label="Ciudad" error={errors.city?.message} {...register('city')} />
                  </div>
                  <Input label="Código postal" placeholder="28001" error={errors.postalCode?.message} {...register('postalCode')} />
                </div>
                <Input label="Provincia" error={errors.province?.message} {...register('province')} />
                <Input label="Teléfono (opcional)" type="tel" {...register('phone')} />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground-soft)]">
                  <input type="checkbox" {...register('saveAddress')} className="rounded border-[var(--border-strong)] text-emerald-600 accent-emerald-600 dark:accent-emerald-400" />
                  Guardar esta dirección para futuros pedidos
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-3 font-semibold text-[var(--foreground)]">Pago</h2>
              {showDemoNotice && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm text-[var(--foreground-soft)]">
                  <p className="font-medium text-[var(--foreground)]">Modo demo activado</p>
                  <p className="mt-0.5">
                    El pago se simulará automáticamente. En producción se integra Stripe.
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
              {step === 'processing' ? 'Procesando pedido...' : `Confirmar pedido · ${formatPrice(total)}`}
            </Button>
          </form>
        </div>

        <div>
          <div className="sticky top-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="mb-4 font-semibold text-[var(--foreground)]">Tu pedido</h2>
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
                <span>Subtotal</span><span>{formatPrice(sub)}</span>
              </div>
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>Envío</span>
                <span>{shipping === 0 ? <span className="text-emerald-600 dark:text-emerald-400">Gratis</span> : formatPrice(shipping)}</span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-[var(--muted-light)]">
                  El coste se ajusta automáticamente según el código postal y la zona de envío.
                </p>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold text-[var(--foreground)]">
                <span>Total</span><span>{formatPrice(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
