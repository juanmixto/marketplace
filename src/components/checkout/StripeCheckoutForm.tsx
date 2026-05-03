'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { Appearance } from '@stripe/stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import { trackAnalyticsEvent } from '@/lib/analytics'
import { getBuyerFunnelContext } from '@/lib/analytics-buyer-context'

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

interface StripeCheckoutFormProps {
  clientSecret: string
  orderId: string
  orderNumber: string
  grandTotal: number
  appUrl: string
}

interface InnerFormProps extends StripeCheckoutFormProps {
  returnUrl: string
  appearance: Appearance
}

export function getStripeAppearance(theme?: string | null): Appearance {
  const isDark = theme === 'dark'

  return {
    theme: isDark ? 'night' : 'stripe',
    variables: {
      colorPrimary: isDark ? '#34d399' : '#059669',
      colorBackground: isDark ? 'rgba(15, 23, 42, 0.72)' : '#ffffff',
      colorText: isDark ? '#e2e8f0' : '#0f172a',
      colorDanger: isDark ? '#fca5a5' : '#dc2626',
      colorTextPlaceholder: isDark ? '#94a3b8' : '#94a3b8',
      colorBackgroundText: 'transparent',
      borderRadius: '12px',
      spacingUnit: '4px',
      fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    },
    rules: {
      '.Input': {
        borderColor: isDark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.35)',
        boxShadow: 'none',
      },
      '.Input:focus': {
        borderColor: isDark ? '#4ade80' : '#10b981',
        boxShadow: isDark ? '0 0 0 2px rgba(74, 222, 128, 0.18)' : '0 0 0 2px rgba(16, 185, 129, 0.14)',
      },
      '.Tab, .Block, .AccordionItem': {
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.55)' : '#ffffff',
        borderColor: isDark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.35)',
      },
      '.Tab--selected, .Block--selected': {
        backgroundColor: isDark ? 'rgba(15, 118, 110, 0.18)' : 'rgba(236, 253, 245, 0.92)',
        borderColor: isDark ? 'rgba(74, 222, 128, 0.55)' : 'rgba(16, 185, 129, 0.45)',
      },
    },
  }
}

function InnerStripeCheckoutForm({ orderNumber, grandTotal, returnUrl }: InnerFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!stripe || !elements) return

    setError(null)
    setIsSubmitting(true)

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    })

    if (result.error) {
      setError(result.error.message ?? 'No se pudo confirmar el pago.')
      setIsSubmitting(false)
      return
    }

    if (result.paymentIntent?.status === 'succeeded' || result.paymentIntent?.status === 'processing') {
      // CF-1 funnel: payment step completed. Fires before the redirect
      // so a slow router.push doesn't drop the event on unload.
      const { device, referrer } = getBuyerFunnelContext()
      trackAnalyticsEvent('checkout.step_completed', {
        step: 'payment',
        order_number: orderNumber,
        device,
        referrer,
      })
      router.push(`/checkout/confirmacion?orderNumber=${encodeURIComponent(orderNumber)}`)
      router.refresh()
      return
    }

    setError('El pago requiere una validación adicional. Inténtalo de nuevo en unos segundos.')
    setIsSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Pago seguro</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pedido {orderNumber} · Total {formatPrice(grandTotal)}
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <PaymentElement />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">Stripe procesará el pago y te llevaremos a la pantalla de confirmación del pedido.</p>
        <Button type="submit" size="lg" isLoading={isSubmitting || !stripe || !elements}>
          Pagar {formatPrice(grandTotal)}
        </Button>
      </div>
    </form>
  )
}

export function StripeCheckoutForm(props: StripeCheckoutFormProps) {
  const { resolvedTheme } = useTheme()
  const appearance = getStripeAppearance(resolvedTheme)

  if (!stripePromise) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-300">
        Falta configurar `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` para mostrar el formulario de pago.
      </div>
    )
  }

  const returnUrl = `${props.appUrl}/checkout/confirmacion?orderNumber=${encodeURIComponent(props.orderNumber)}`

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret, appearance }}>
      <InnerStripeCheckoutForm {...props} returnUrl={returnUrl} appearance={appearance} />
    </Elements>
  )
}
