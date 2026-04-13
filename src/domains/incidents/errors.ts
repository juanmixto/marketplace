/**
 * Incident-domain error classes (#29).
 *
 * Lives outside `actions.ts` because Next.js / Turbopack only allows
 * `'use server'` modules to export async functions — re-exporting classes
 * or constants from one would break the build. Importers should pull
 * errors and constants from this file, and the action functions from
 * `./actions`.
 */

export class IncidentAuthError extends Error {
  constructor(message = 'No autorizado') {
    super(message)
    this.name = 'IncidentAuthError'
  }
}

export class IncidentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IncidentValidationError'
  }
}

// 72h SLA on first response, per #29.
export const INCIDENT_SLA_HOURS = 72
