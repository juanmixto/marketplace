import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CheckoutAttemptCrossUserError,
  EmptyCartOrUnavailableProductsError,
  InsufficientStockError,
  InvalidCheckoutAmountError,
  InvalidPromotionCodeError,
  ManualConfirmationNotAllowedError,
  mapOrderErrorToUX,
  OrderConfirmationForbiddenError,
  PromotionAlreadyClaimedError,
  SavedAddressUnavailableError,
  VariantSelectionRequiredError,
  VariantUnavailableError,
} from '@/domains/orders/errors'

test('mapOrderErrorToUX preserves typed order errors as their UX messages', () => {
  assert.equal(mapOrderErrorToUX(new InsufficientStockError('Stock insuficiente: X')), 'Stock insuficiente: X')
  assert.equal(mapOrderErrorToUX(new InvalidCheckoutAmountError()), 'La verificación del importe ha fallado. Contacta con soporte.')
  assert.equal(mapOrderErrorToUX(new PromotionAlreadyClaimedError()), 'La promoción seleccionada ya no está disponible. Recarga el carrito e inténtalo de nuevo.')
  assert.equal(mapOrderErrorToUX(new CheckoutAttemptCrossUserError()), 'Sesión de checkout inválida. Recarga la página.')
  assert.equal(mapOrderErrorToUX(new SavedAddressUnavailableError()), 'La dirección guardada ya no está disponible. Elige otra o añade una nueva para continuar.')
  assert.equal(mapOrderErrorToUX(new OrderConfirmationForbiddenError()), 'No puedes confirmar un pedido que no te pertenece')
  assert.equal(mapOrderErrorToUX(new ManualConfirmationNotAllowedError()), 'La confirmacion manual solo esta disponible en modo mock')
  assert.equal(mapOrderErrorToUX(new EmptyCartOrUnavailableProductsError()), 'Carrito vacío o productos no disponibles')
  assert.equal(mapOrderErrorToUX(new VariantSelectionRequiredError('Queso')), 'Debes seleccionar una variante para "Queso"')
  assert.equal(mapOrderErrorToUX(new VariantUnavailableError('Queso', true)), 'La variante seleccionada para "Queso" ya no esta disponible')
  assert.equal(mapOrderErrorToUX(new VariantUnavailableError('Queso', false)), 'Variante "Queso" no encontrada')
  assert.equal(mapOrderErrorToUX(new InvalidPromotionCodeError('BIG40')), 'El código "BIG40" no es válido o ya no está disponible.')
})

test('mapOrderErrorToUX keeps legacy regex fallback intact', () => {
  assert.equal(
    mapOrderErrorToUX(new Error('stock insuficiente: producto sin stock')),
    'stock insuficiente: producto sin stock'
  )
  assert.equal(
    mapOrderErrorToUX(new Error('stripe temporarily unavailable')),
    'Ha habido un problema temporal al iniciar el pago. Inténtalo de nuevo en unos segundos.'
  )
  assert.equal(
    mapOrderErrorToUX(new Error('no autorizado')),
    'Debes iniciar sesión para completar el pedido.'
  )
})
