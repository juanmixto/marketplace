import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contract pins for `sendWebPushToUser`. The service itself wires
 * four code paths — PUSH_DISABLED, USER_DISABLED, NO_SUBSCRIPTION,
 * SENT/FAILED — and each of them must write a row to
 * NotificationDelivery. Silent regressions here would make
 * /admin/notificaciones lose audit trail on the web-push channel.
 *
 * A full behavioural mock harness isn't worth the plumbing for a
 * ~20-line service; a source pin catches the regressions that
 * matter (missing log, missing preference check, silently swallowed
 * error) while keeping the test runnable without a DB.
 */

const SERVICE_PATH = 'src/domains/notifications/web-push/service.ts'

function read(): string {
  return readFileSync(join(process.cwd(), SERVICE_PATH), 'utf-8')
}

test('sendWebPushToUser short-circuits when VAPID is not configured', () => {
  const src = read()
  assert.match(
    src,
    /if\s*\(\s*!isPushEnabled\s*\)\s*\{[\s\S]*logDelivery[\s\S]*'PUSH_DISABLED'/,
    'must log a SKIPPED/PUSH_DISABLED delivery before returning — otherwise /admin/notificaciones has no record of what happened',
  )
})

test('sendWebPushToUser honours the WEB_PUSH channel preference', () => {
  const src = read()
  assert.match(
    src,
    /channel:\s*'WEB_PUSH'/,
    'the preference lookup must be scoped to the WEB_PUSH channel, not the Telegram one — otherwise the buyer toggling Telegram off would silence web push too',
  )
  assert.match(
    src,
    /pref\s*&&\s*!pref\.enabled[\s\S]*'USER_DISABLED'/,
    'explicit opt-out must skip and log USER_DISABLED',
  )
})

test('sendWebPushToUser surfaces no-subscription state as its own outcome', () => {
  const src = read()
  assert.match(
    src,
    /delivered\s*===\s*0[\s\S]*'NO_SUBSCRIPTION'/,
    'a zero-delivery return from sendPushToUser means the user never subscribed from any device — that is a SKIPPED/NO_SUBSCRIPTION, not a FAILED',
  )
})

test('sendWebPushToUser logs every outcome to NotificationDelivery', () => {
  const src = read()
  const skipped = src.match(/status:\s*'SKIPPED'/g) ?? []
  const sent = src.match(/status:\s*'SENT'/g) ?? []
  const failed = src.match(/status:\s*'FAILED'/g) ?? []
  assert.ok(
    skipped.length >= 3,
    'three SKIPPED branches expected (PUSH_DISABLED, USER_DISABLED, NO_SUBSCRIPTION) — a missing one means the delivery log drops that class of skips',
  )
  assert.ok(sent.length >= 1, 'SENT branch must call logDelivery with status: SENT')
  assert.ok(failed.length >= 1, 'FAILED branch must call logDelivery with status: FAILED')
})

test('delivery log is written on the WEB_PUSH channel (not TELEGRAM)', () => {
  const src = read()
  // Match the create() call inside logDelivery — the channel field
  // must be 'WEB_PUSH'. A copy-paste slip from the Telegram service
  // would still compile but pollute the audit with the wrong channel.
  assert.match(
    src,
    /db\.notificationDelivery\.create\([\s\S]*channel:\s*'WEB_PUSH'/,
    'NotificationDelivery.channel must be WEB_PUSH',
  )
})

test('sendWebPushToUser catches transport errors instead of throwing out', () => {
  const src = read()
  assert.match(
    src,
    /try\s*\{[\s\S]*sendPushToUser[\s\S]*\}\s*catch/,
    'a web-push transport error must not bubble up — the caller is the dispatcher which fan-outs to every handler, and a throw would be swallowed into an opaque notifications.handler.failed log',
  )
})
