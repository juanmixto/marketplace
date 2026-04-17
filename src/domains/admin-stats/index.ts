// admin-stats currently exposes only `./queries` (server-only,
// Prisma-backed). The barrel is intentionally empty so client
// callers can't accidentally pull queries into their bundle. Server
// callers deep-import `@/domains/admin-stats/queries` directly.
export {}
