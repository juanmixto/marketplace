/**
 * Domain error for the ghost-vendor claim action. Lives in its own
 * non-`'use server'` module because Next.js server-action files can
 * only export async functions — a class export breaks the Turbopack
 * build. Mirrors the `IngestionPublishValidationError` split landed
 * for Phase 4 PR-B.
 */
export class VendorClaimError extends Error {
  readonly reason: string
  constructor(reason: string, message: string) {
    super(message)
    this.name = 'VendorClaimError'
    this.reason = reason
  }
}
