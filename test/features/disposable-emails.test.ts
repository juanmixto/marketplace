/**
 * Disposable email blocklist (#1280).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { isDisposableEmail } from '@/lib/disposable-emails'

test('blocks well-known temp-mail providers', () => {
  assert.equal(isDisposableEmail('user@mailinator.com'), true)
  assert.equal(isDisposableEmail('user@10minutemail.com'), true)
  assert.equal(isDisposableEmail('user@tempmail.io'), true)
  assert.equal(isDisposableEmail('user@yopmail.com'), true)
  assert.equal(isDisposableEmail('user@guerrillamail.com'), true)
  assert.equal(isDisposableEmail('user@trashmail.com'), true)
})

test('lets legitimate inboxes through', () => {
  assert.equal(isDisposableEmail('juan@gmail.com'), false)
  assert.equal(isDisposableEmail('user@outlook.com'), false)
  assert.equal(isDisposableEmail('user@hotmail.es'), false)
  assert.equal(isDisposableEmail('user@protonmail.com'), false)
  assert.equal(isDisposableEmail('user@empresa.es'), false)
})

test('case-insensitive on the domain', () => {
  assert.equal(isDisposableEmail('USER@MAILINATOR.COM'), true)
  assert.equal(isDisposableEmail('User@MailInator.Com'), true)
})

test('handles trimming gracefully', () => {
  assert.equal(isDisposableEmail('user@ tempmail.io '), true)
})

test('refuses malformed input without crashing', () => {
  assert.equal(isDisposableEmail(''), false)
  assert.equal(isDisposableEmail('no-at-sign'), false)
  assert.equal(isDisposableEmail('user@'), false)
  assert.equal(isDisposableEmail('@domain.com'), false)
})
