'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'

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
}

function InnerStripeCheckoutForm({ orderId, orderNumber, grandTotal, returnUrl }: InnerFormProps) {
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
      router.push(`/cuenta/pedidos/${orderId}?nuevo=1`)
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

      <div className="rounded-xl border border-[var(--border)] p-4">
        <PaymentElement />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">Stripe procesará el pago y te devolveremos al detalle del pedido.</p>
        <Button type="submit" size="lg" isLoading={isSubmitting || !stripe || !elements}>
          Pagar {formatPrice(grandTotal)}
        </Button>
      </div>
    </form>
  )
}

export function StripeCheckoutForm(props: StripeCheckoutFormProps) {
  if (!stripePromise) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Falta configurar `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` para mostrar el formulario de pago.
      </div>
    )
  }

  const returnUrl = `${props.appUrl}/cuenta/pedidos/${props.orderId}?nuevo=1`

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <InnerStripeCheckoutForm {...props} returnUrl={returnUrl} />
    </Elements>
  )
}
