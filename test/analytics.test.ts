import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnalyticsItem, sanitizeAnalyticsPayload } from '@/lib/analytics'

test('sanitizeAnalyticsPayload removes nullish values but keeps 0 and false', () => {
  const payload = sanitizeAnalyticsPayload({
    event: 'search',
    search_term: 'tomates',
    results_count: 0,
    has_results: false,
    coupon: undefined,
    debug: null,
  })

  assert.deepEqual(payload, {
    event: 'search',
    search_term: 'tomates',
    results_count: 0,
    has_results: false,
  })
})

test('createAnalyticsItem normalizes catalog data for ecommerce events', () => {
  const item = createAnalyticsItem({
    id: 'prod_123',
    name: 'Tomate rosa',
    price: 4.5,
    quantity: 2,
    variant: 'Caja 2kg',
    brand: 'Huerta Norte',
    category: 'verduras',
  })

  assert.deepEqual(item, {
    item_id: 'prod_123',
    item_name: 'Tomate rosa',
    price: 4.5,
    quantity: 2,
    item_variant: 'Caja 2kg',
    item_brand: 'Huerta Norte',
    item_category: 'verduras',
  })
})
