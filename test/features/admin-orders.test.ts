import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FULFILLMENT_STATUS_LABELS_ADMIN,
  PAYMENT_STATUS_LABELS,
} from '@/domains/admin/orders'

// ─── PAYMENT_STATUS_LABELS ────────────────────────────────────────────────

test('PAYMENT_STATUS_LABELS covers every PaymentStatus with a Spanish label', () => {
  assert.equal(PAYMENT_STATUS_LABELS.PENDING, 'Pendiente')
  assert.equal(PAYMENT_STATUS_LABELS.SUCCEEDED, 'Pagado')
  assert.equal(PAYMENT_STATUS_LABELS.FAILED, 'Fallido')
  assert.equal(PAYMENT_STATUS_LABELS.REFUNDED, 'Reembolsado')
  assert.equal(PAYMENT_STATUS_LABELS.PARTIALLY_REFUNDED, 'Reembolso parcial')
})

test('PAYMENT_STATUS_LABELS has an entry for every expected status', () => {
  const expectedKeys = ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']
  for (const key of expectedKeys) {
    assert.ok(key in PAYMENT_STATUS_LABELS, `Missing label for PaymentStatus.${key}`)
    assert.ok(PAYMENT_STATUS_LABELS[key as keyof typeof PAYMENT_STATUS_LABELS].length > 0)
  }
})

// ─── FULFILLMENT_STATUS_LABELS_ADMIN ──────────────────────────────────────

test('FULFILLMENT_STATUS_LABELS_ADMIN covers every FulfillmentStatus with a Spanish label', () => {
  assert.equal(FULFILLMENT_STATUS_LABELS_ADMIN.PENDING, 'Pendiente')
  assert.equal(FULFILLMENT_STATUS_LABELS_ADMIN.CONFIRMED, 'Confirmado')
  assert.equal(FULFILLMENT_STATUS_LABELS_ADMIN.PREPARING, 'Preparando')
  assert.equal(FULFILLMENT_STATUS_LABELS_ADMIN.READY, 'Listo')
  assert.equal(FULFILLMENT_STATUS_LABELS_ADMIN.SHIPPED, 'Enviado')
  assert.equal(FULFILLMENT_STATUS_LABELS_ADMIN.DELIVERED, 'Entregado')
  assert.equal(FULFILLMENT_STATUS_LABELS_ADMIN.CANCELLED, 'Cancelado')
})

test('FULFILLMENT_STATUS_LABELS_ADMIN has an entry for every expected status', () => {
  const expectedKeys = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'CANCELLED']
  for (const key of expectedKeys) {
    assert.ok(key in FULFILLMENT_STATUS_LABELS_ADMIN, `Missing label for FulfillmentStatus.${key}`)
    assert.ok(FULFILLMENT_STATUS_LABELS_ADMIN[key as keyof typeof FULFILLMENT_STATUS_LABELS_ADMIN].length > 0)
  }
})
