/**
 * Shared cart-input contract. Phase 8 of the contract-hardening plan.
 *
 * `CartItemInput` was previously declared inline in
 * `src/domains/orders/actions.ts` and copied at every call site that
 * built a checkout payload. Centralizing it here keeps consumers
 * (cart store, checkout actions, subscription renewals) in lockstep
 * when the input shape evolves (e.g. adding a `note` field).
 */
export interface CartItemInput {
  productId: string
  variantId?: string
  quantity: number
}
