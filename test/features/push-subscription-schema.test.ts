import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'

// Replicate the schema from the server action to test it without importing
// the 'use server' module directly (which would fail in node:test).
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().max(500).optional(),
})

test('push subscription schema: valid input passes', () => {
  const input = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
    auth: 'tBHItJI5svbpC7D2LlAnFA',
  }
  const result = subscribeSchema.safeParse(input)
  assert.ok(result.success)
})

test('push subscription schema: with userAgent', () => {
  const input = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
    auth: 'tBHItJI5svbpC7D2LlAnFA',
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
  }
  const result = subscribeSchema.safeParse(input)
  assert.ok(result.success)
})

test('push subscription schema: rejects invalid endpoint URL', () => {
  const input = {
    endpoint: 'not-a-url',
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
    auth: 'tBHItJI5svbpC7D2LlAnFA',
  }
  const result = subscribeSchema.safeParse(input)
  assert.ok(!result.success)
})

test('push subscription schema: rejects empty p256dh', () => {
  const input = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    p256dh: '',
    auth: 'tBHItJI5svbpC7D2LlAnFA',
  }
  const result = subscribeSchema.safeParse(input)
  assert.ok(!result.success)
})

test('push subscription schema: rejects empty auth', () => {
  const input = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
    auth: '',
  }
  const result = subscribeSchema.safeParse(input)
  assert.ok(!result.success)
})

test('push subscription schema: rejects userAgent over 500 chars', () => {
  const input = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
    auth: 'tBHItJI5svbpC7D2LlAnFA',
    userAgent: 'x'.repeat(501),
  }
  const result = subscribeSchema.safeParse(input)
  assert.ok(!result.success)
})

test('push subscription schema: missing endpoint rejects', () => {
  const input = {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
    auth: 'tBHItJI5svbpC7D2LlAnFA',
  }
  const result = subscribeSchema.safeParse(input)
  assert.ok(!result.success)
})
