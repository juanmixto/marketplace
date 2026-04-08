import { z } from 'zod'

export const stripeCheckoutParamsSchema = z.object({
  orderId: z.string().min(1),
  secret: z.string().min(1),
})

export function isMockClientSecret(clientSecret: string) {
  return clientSecret.startsWith('mock_')
}
