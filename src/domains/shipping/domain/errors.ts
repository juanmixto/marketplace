export class ShippingError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly cause?: unknown

  constructor(message: string, code: string, retryable: boolean, cause?: unknown) {
    super(message)
    this.name = 'ShippingError'
    this.code = code
    this.retryable = retryable
    this.cause = cause
  }
}

export class ShippingValidationError extends ShippingError {
  readonly field?: string

  constructor(message: string, field?: string, cause?: unknown) {
    super(message, 'SHIPPING_VALIDATION', false, cause)
    this.name = 'ShippingValidationError'
    this.field = field
  }
}

export class ShippingProviderUnavailableError extends ShippingError {
  constructor(message = 'Shipping provider unavailable', cause?: unknown) {
    super(message, 'SHIPPING_PROVIDER_UNAVAILABLE', true, cause)
    this.name = 'ShippingProviderUnavailableError'
  }
}

export class ShippingNotFoundError extends ShippingError {
  constructor(providerRef: string) {
    super(`Shipment not found: ${providerRef}`, 'SHIPPING_NOT_FOUND', false)
    this.name = 'ShippingNotFoundError'
  }
}

export class ShippingCancelForbiddenError extends ShippingError {
  constructor(reason: string) {
    super(reason, 'SHIPPING_CANCEL_FORBIDDEN', false)
    this.name = 'ShippingCancelForbiddenError'
  }
}
