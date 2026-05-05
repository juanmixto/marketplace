import test from 'node:test'
import assert from 'node:assert/strict'
import { isVerifiedSearchBot } from '@/lib/bot-detection'

test('isVerifiedSearchBot accepts Googlebot after reverse + forward DNS validation', async () => {
  const headers = new Headers({
    'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  })

  const result = await isVerifiedSearchBot(headers, '203.0.113.10', {
    reverse: async () => ['crawl-203-0-113-10.googlebot.com'],
    lookupAddresses: async hostname => hostname === 'crawl-203-0-113-10.googlebot.com'
      ? ['203.0.113.10']
      : [],
  })

  assert.equal(result, true)
})

test('isVerifiedSearchBot rejects crawlers when DNS validation fails', async () => {
  const headers = new Headers({
    'user-agent': 'Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  })

  const result = await isVerifiedSearchBot(headers, '203.0.113.11', {
    reverse: async () => ['unverified.example.com'],
    lookupAddresses: async () => ['198.51.100.99'],
  })

  assert.equal(result, false)
})
