import { NextResponse } from 'next/server'
import type { ZodError } from 'zod'

/**
 * Canonical error-response helpers for /api routes.
 *
 * Previously every route shaped its errors slightly differently
 * (`{ error }`, `{ message }`, `{ error, message, details }` etc.) and
 * clients had to handle each one. Migrate new routes to these helpers so
 * the client can rely on a single shape:
 *
 *   { error: string, code: ApiErrorCode, details?: unknown }
 *
 * `error` is the human-readable (localized) message, `code` is the
 * stable machine-readable identifier, `details` is optional structured
 * context (e.g. Zod issues list).
 */

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export interface ApiErrorBody {
  error: string
  code: ApiErrorCode
  details?: unknown
  /**
   * Map of field path → human-readable message for form-style validation
   * errors. The client surfaces these inline next to the offending input
   * instead of a generic "Datos inválidos" banner. (#131)
   */
  fieldErrors?: Record<string, string>
}

export interface ApiErrorOptions {
  details?: unknown
  fieldErrors?: Record<string, string>
  headers?: Record<string, string>
}

export function apiError(
  message: string,
  status: number,
  code: ApiErrorCode = 'INTERNAL_ERROR',
  detailsOrOptions?: unknown | ApiErrorOptions,
  extraHeaders?: Record<string, string>
): NextResponse<ApiErrorBody> {
  // Back-compat: accept either the legacy (details, headers) tuple or the
  // newer options bag with fieldErrors.
  const opts: ApiErrorOptions =
    detailsOrOptions != null
      && typeof detailsOrOptions === 'object'
      && !Array.isArray(detailsOrOptions)
      && ('fieldErrors' in detailsOrOptions || 'details' in detailsOrOptions || 'headers' in detailsOrOptions)
      ? (detailsOrOptions as ApiErrorOptions)
      : { details: detailsOrOptions, headers: extraHeaders }

  const body: ApiErrorBody = { error: message, code }
  if (opts.details !== undefined) body.details = opts.details
  if (opts.fieldErrors !== undefined) body.fieldErrors = opts.fieldErrors
  return NextResponse.json(body, { status, headers: opts.headers })
}

/**
 * Flatten a Zod error into a `{ field: 'message' }` map keyed by dotted path.
 * Returns the first message encountered for each path, which is what users
 * actually want to read next to the input.
 */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const map: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (path && map[path] === undefined) {
      map[path] = issue.message
    }
  }
  return map
}

export function apiValidationFromZod(error: ZodError, fallbackMessage = 'Revisa los datos del formulario') {
  const fieldErrors = zodFieldErrors(error)
  const firstMessage = Object.values(fieldErrors)[0] ?? fallbackMessage
  return apiError(firstMessage, 422, 'VALIDATION_ERROR', { fieldErrors })
}

export const apiBadRequest = (message: string, details?: unknown) =>
  apiError(message, 400, 'BAD_REQUEST', details)

export const apiUnauthorized = (message = 'No autorizado') =>
  apiError(message, 401, 'UNAUTHORIZED')

export const apiForbidden = (message = 'Acción no permitida') =>
  apiError(message, 403, 'FORBIDDEN')

export const apiNotFound = (message = 'Recurso no encontrado') =>
  apiError(message, 404, 'NOT_FOUND')

export const apiConflict = (message: string, details?: unknown) =>
  apiError(message, 409, 'CONFLICT', details)

export const apiValidationError = (message: string, details?: unknown) =>
  apiError(message, 422, 'VALIDATION_ERROR', details)

export const apiRateLimited = (
  message: string,
  retryAfterSeconds: number,
  limit?: number
) =>
  apiError(message, 429, 'RATE_LIMITED', undefined, {
    'Retry-After': String(Math.max(0, Math.ceil(retryAfterSeconds))),
    ...(limit !== undefined ? { 'X-RateLimit-Limit': String(limit) } : {}),
  })

export const apiInternalError = (message = 'Error interno') =>
  apiError(message, 500, 'INTERNAL_ERROR')
