import test from 'node:test'
import assert from 'node:assert/strict'
import { doesWebhookPaymentMatchStoredPayment } from '@/domains/payments/webhook'

// Simulates a Prisma Decimal with a toString method
class FakeDecimal {
  constructor(private readonly val: string | number) {}
  toString() { return String(this.val) }
}

test('doesWebhookPaymentMatchStoredPayment rejects missing webhook amount', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 100, currency: 'EUR' },
      { currency: 'EUR' }
    ),
    false
  )
})

test('doesWebhookPaymentMatchStoredPayment rejects missing webhook currency', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 100, currency: 'EUR' },
      { amount: 10000 }
    ),
    false
  )
})

test('doesWebhookPaymentMatchStoredPayment converts stored euros to cents for comparison', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 100.50, currency: 'EUR' },
      { amount: 10050, currency: 'EUR' }
    ),
    true
  )
})

test('doesWebhookPaymentMatchStoredPayment rejects underpayment (1 cent short)', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 100.0, currency: 'EUR' },
      { amount: 9999, currency: 'EUR' }
    ),
    false
  )
})

test('doesWebhookPaymentMatchStoredPayment rejects overpayment (1 cent over)', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 100.0, currency: 'EUR' },
      { amount: 10001, currency: 'EUR' }
    ),
    false
  )
})

test('doesWebhookPaymentMatchStoredPayment is case-insensitive for currency code', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 100, currency: 'EUR' },
      { amount: 10000, currency: 'eur' }
    ),
    true
  )
})

test('doesWebhookPaymentMatchStoredPayment handles Decimal-like stored amounts', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: new FakeDecimal('100.50'), currency: 'EUR' },
      { amount: 10050, currency: 'EUR' }
    ),
    true
  )
})

test('doesWebhookPaymentMatchStoredPayment rejects currency mismatch (EUR vs USD)', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 100.0, currency: 'EUR' },
      { amount: 10000, currency: 'USD' }
    ),
    false
  )
})

test('doesWebhookPaymentMatchStoredPayment rejects 50% discount attack', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 100.0, currency: 'EUR' },
      { amount: 5000, currency: 'EUR' }
    ),
    false
  )
})
