/**
 * Allow-list of dev-only routes under `src/app/dev/**`. Kept in its own
 * dependency-free module so the contract test
 * (`test/integration/dev-routes-audit.test.ts`) can import it without
 * pulling the Prisma client or the Edge runtime through `src/proxy.ts`.
 *
 * Every entry is a security decision — document WHY it exists and what
 * it would leak if it rendered in production. The edge proxy 404s the
 * whole `/dev/*` subtree in production (see src/proxy.ts) but each
 * page must ALSO self-gate on NODE_ENV.
 */
export const DEV_ROUTES_ALLOWLIST: ReadonlyArray<{ path: string; why: string }> = [
  {
    path: 'src/app/dev/mock-shipment/[ref]/page.tsx',
    why: 'Fake carrier label + tracking rendered when MockShippingProvider is active in dev/local. Reads toAddressSnapshot/fromAddressSnapshot — would leak buyer PII if it rendered in prod. Gated at proxy AND inline NODE_ENV check.',
  },
]

export function isDevRoute(pathname: string) {
  return pathname === '/dev' || pathname.startsWith('/dev/')
}
