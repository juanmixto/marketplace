import { NextResponse } from 'next/server'

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
}

export function apiError(
  message: string,
  status: number,
  code: ApiErrorCode = 'INTERNAL_ERROR',
  details?: unknown,
  extraHeaders?: Record<string, string>
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error: message, code }
  if (details !== undefined) body.details = details
  return NextResponse.json(body, { status, headers: extraHeaders })
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
