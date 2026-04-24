/**
 * Domain errors for the Phase 4 admin publish action. Lives in its
 * own (non-`'use server'`) module because Next.js server-action
 * files are only allowed to export async functions — a class export
 * from an `'use server'` file fails the Turbopack build.
 */

export class IngestionPublishValidationError extends Error {
  readonly reason: string
  constructor(reason: string, message: string) {
    super(message)
    this.name = 'IngestionPublishValidationError'
    this.reason = reason
  }
}
