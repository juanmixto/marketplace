import { ZodError } from 'zod'

export type OrderErrorCode =
  | 'EMPTY_CART'
  | 'PRODUCT_UNAVAILABLE'
  | 'VARIANT_UNAVAILABLE'
  | 'VARIANT_SELECTION_REQUIRED'
  | 'INSUFFICIENT_STOCK'
  | 'SAVED_ADDRESS_UNAVAILABLE'
  | 'CHECKOUT_ATTEMPT_CROSS_USER'
  | 'PROMOTION_ALREADY_CLAIMED'
  | 'INVALID_PROMOTION_CODE'
  | 'INVALID_CHECKOUT_AMOUNT'
  | 'ORDER_CONFIRMATION_FORBIDDEN'
  | 'MANUAL_CONFIRMATION_NOT_ALLOWED'
  | 'GUEST_EMAIL_REQUIRED'
  | 'GUEST_EMAIL_BELONGS_TO_REAL_ACCOUNT'
  | 'PAYMENT_ROW_DIVERGED'
  | 'TOO_MANY_PENDING_ORDERS'

export abstract class OrderDomainError extends Error {
  readonly code: OrderErrorCode

  protected constructor(code: OrderErrorCode, message: string) {
    super(message)
    this.name = new.target.name
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class EmptyCartOrUnavailableProductsError extends OrderDomainError {
  constructor() {
    super('EMPTY_CART', 'Carrito vacío o productos no disponibles')
  }
}

export class ProductUnavailableError extends OrderDomainError {
  constructor(productLabel: string, notFound = false) {
    super(
      'PRODUCT_UNAVAILABLE',
      notFound ? `Producto "${productLabel}" no encontrado` : `Producto ${productLabel} no disponible`
    )
  }
}

export class VariantUnavailableError extends OrderDomainError {
  constructor(productName: string, variantSelected = true) {
    super(
      'VARIANT_UNAVAILABLE',
      variantSelected
        ? `La variante seleccionada para "${productName}" ya no esta disponible`
        : `Variante "${productName}" no encontrada`
    )
  }
}

export class VariantSelectionRequiredError extends OrderDomainError {
  constructor(productName: string) {
    super('VARIANT_SELECTION_REQUIRED', `Debes seleccionar una variante para "${productName}"`)
  }
}

export class InsufficientStockError extends OrderDomainError {
  constructor(message: string) {
    super('INSUFFICIENT_STOCK', message)
  }
}

export class SavedAddressUnavailableError extends OrderDomainError {
  constructor() {
    super(
      'SAVED_ADDRESS_UNAVAILABLE',
      'La dirección guardada ya no está disponible. Elige otra o añade una nueva para continuar.'
    )
  }
}

export class CheckoutAttemptCrossUserError extends OrderDomainError {
  constructor() {
    super('CHECKOUT_ATTEMPT_CROSS_USER', 'Sesión de checkout inválida. Recarga la página.')
  }
}

export class PromotionAlreadyClaimedError extends OrderDomainError {
  constructor() {
    super(
      'PROMOTION_ALREADY_CLAIMED',
      'La promoción seleccionada ya no está disponible. Recarga el carrito e inténtalo de nuevo.'
    )
  }
}

export class InvalidPromotionCodeError extends OrderDomainError {
  constructor(code: string) {
    super('INVALID_PROMOTION_CODE', `El código "${code}" no es válido o ya no está disponible.`)
  }
}

export class InvalidCheckoutAmountError extends OrderDomainError {
  constructor() {
    super(
      'INVALID_CHECKOUT_AMOUNT',
      'La verificación del importe ha fallado. Contacta con soporte.'
    )
  }
}

export class OrderConfirmationForbiddenError extends OrderDomainError {
  constructor() {
    super('ORDER_CONFIRMATION_FORBIDDEN', 'No puedes confirmar un pedido que no te pertenece')
  }
}

export class ManualConfirmationNotAllowedError extends OrderDomainError {
  constructor() {
    super(
      'MANUAL_CONFIRMATION_NOT_ALLOWED',
      'La confirmacion manual solo esta disponible en modo mock'
    )
  }
}

export class GuestEmailRequiredError extends OrderDomainError {
  constructor() {
    super(
      'GUEST_EMAIL_REQUIRED',
      'Introduce un email para recibir la confirmación del pedido.',
    )
  }
}

export class GuestEmailBelongsToRealAccountError extends OrderDomainError {
  constructor() {
    super(
      'GUEST_EMAIL_BELONGS_TO_REAL_ACCOUNT',
      'Ya existe una cuenta con este email. Inicia sesión para continuar con tu pedido.',
    )
  }
}

/**
 * #1169 H-9: thrown when `linkOrderPaymentProviderRef` finds an existing
 * Payment row whose `providerRef` differs from the freshly-created PI.
 * Continuing would route the buyer's session at one PI while Stripe
 * holds another — the next webhook would never match a local row.
 * Caller surfaces a retry that generates a fresh `checkoutAttemptId`.
 */
/**
 * #1270: cap on per-user pending orders. A user with too many PLACED
 * orders awaiting payment is either testing or trying to grief vendors
 * by forcing manual cancellations. New checkouts are refused until the
 * pending count drops.
 */
export class TooManyPendingOrdersError extends OrderDomainError {
  constructor() {
    super(
      'TOO_MANY_PENDING_ORDERS',
      'Tienes demasiados pedidos pendientes de pago. Termina o cancela alguno antes de crear uno nuevo.',
    )
  }
}

export class PaymentRowDivergedError extends OrderDomainError {
  constructor() {
    super(
      'PAYMENT_ROW_DIVERGED',
      'No pudimos enlazar el cobro con tu pedido. Recarga el carrito e inténtalo de nuevo.',
    )
  }
}

export function mapOrderErrorToUX(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Revisa los datos de la dirección y vuelve a intentarlo.'
  }

  if (error instanceof OrderDomainError) {
    return error.message
  }

  if (error instanceof Error) {
    const message = error.message.trim()

    if (/stock insuficiente|carrito vac[íi]o|no disponible|ya no esta disponible|ya no está disponible|debes seleccionar una variante|c[óo]digo postal|requerid|promoci[óo]n|c[óo]digo "|cantidad m[áa]xima|carrito no puede tener|pedidos pendientes/i.test(message)) {
      return message
    }

    if (/direcci[óo]n guardada|no encontrada/i.test(message)) {
      return 'Tu dirección guardada ya no estaba disponible. Hemos mantenido los datos del formulario para que puedas completar la compra igualmente.'
    }

    if (/payment intent|payment_intent|stripe|temporarily unavailable|timeout|timed out|deadlock|closed the connection|ECONN|network/i.test(message)) {
      return 'Ha habido un problema temporal al iniciar el pago. Inténtalo de nuevo en unos segundos.'
    }

    if (/no autorizado|unauthorized|iniciar sesi[óo]n|login/i.test(message)) {
      return 'Debes iniciar sesión para completar el pedido.'
    }
  }

  return 'No se pudo procesar el pedido. Revisa el stock disponible o actualiza el carrito e inténtalo de nuevo.'
}

export const getCheckoutErrorMessage = mapOrderErrorToUX
