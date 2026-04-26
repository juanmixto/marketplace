// Public surface of the cart subdomain. Charter:
//   - Owns the buyer's "live cart" aggregate: server persistence,
//     dedupe hashing, and server actions for add/remove/clear/merge.
//   - Distinct from `orders/`: the cart is mutable buyer state, not
//     an order. Conversion happens in `createCheckoutOrder`, which
//     reads from cart and creates an Order.
//
// Excluded from the barrel on purpose:
//   - `cart-store.ts`     — Zustand client store (`'use client'`);
//                            audit forbids stores in the server graph.
//   - `cart-broadcast.ts` — uses BroadcastChannel + the client store.
// Deep-import those directly from client components.
export * from './cart-actions'
export * from './cart-persistence'
export * from './cart-dedupe'
