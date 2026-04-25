// Public surface of the pricing subdomain. Charter:
//   - Pure functions only. No DB, no Stripe, no Prisma, no I/O.
//   - Composes primitives owned by other subdomains:
//       orders/    → cart items, line snapshots
//       promotions/ → discount evaluation results
//       shipping/  → resolved shipping cost
//   - One canonical answer to "what does the buyer pay?".
//
// If you need tax-by-region, order-level fees, or currency conversion,
// add them here behind a clear function boundary — never inline in a
// component or use-case.
export * from './order-pricing'
export * from './cart-totals'
