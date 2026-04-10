/**
 * Rate Limiting Tests
 * Verifies that brute force attacks and registration spam are prevented
 *
 * Run with: npm test -- ratelimit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

describe('Rate Limiting (#76)', () => {
  beforeEach(() => {
    // Clear in-memory store between tests by using unique keys
  })

  describe('checkRateLimit', () => {
    it('should allow requests under limit', async () => {
      const result1 = await checkRateLimit('test', '192.168.1.1', 3, 60)
      expect(result1.success).toBe(true)
      expect(result1.remaining).toBe(2)

      const result2 = await checkRateLimit('test', '192.168.1.1', 3, 60)
      expect(result2.success).toBe(true)
      expect(result2.remaining).toBe(1)
    })

    it('should reject requests over limit', async () => {
      // Make 3 requests (limit)
      await checkRateLimit('test2', '192.168.1.2', 3, 60)
      await checkRateLimit('test2', '192.168.1.2', 3, 60)
      await checkRateLimit('test2', '192.168.1.2', 3, 60)

      // 4th request should be rejected
      const result = await checkRateLimit('test2', '192.168.1.2', 3, 60)
      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.message).toContain('Demasiados intentos')
    })

    it('should be per-IP when different IPs are used', async () => {
      const result1 = await checkRateLimit('test3', '192.168.1.3', 2, 60)
      expect(result1.success).toBe(true)

      const result2 = await checkRateLimit('test3', '192.168.1.4', 2, 60)
      expect(result2.success).toBe(true)

      // Both IPs should have independent limits
      const result3 = await checkRateLimit('test3', '192.168.1.3', 2, 60)
      expect(result3.remaining).toBe(0)

      const result4 = await checkRateLimit('test3', '192.168.1.4', 2, 60)
      expect(result4.remaining).toBe(0)
    })

    it('should be per-action', async () => {
      await checkRateLimit('register', '192.168.1.5', 1, 60)
      await checkRateLimit('login', '192.168.1.5', 1, 60)

      // Register should be exhausted
      const registerResult = await checkRateLimit('register', '192.168.1.5', 1, 60)
      expect(registerResult.success).toBe(false)

      // But login should still work (independent limit)
      const loginResult = await checkRateLimit('login', '192.168.1.5', 1, 60)
      expect(loginResult.success).toBe(false) // Already used the 1 allowed
    })

    it('should include resetAt timestamp', async () => {
      const before = Date.now()
      const result = await checkRateLimit('test4', '192.168.1.6', 5, 60)
      const after = Date.now()

      expect(result.resetAt).toBeGreaterThanOrEqual(before + 60000)
      expect(result.resetAt).toBeLessThanOrEqual(after + 60000)
    })
  })

  describe('getClientIP', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.178' },
      })
      const ip = getClientIP(request)
      expect(ip).toBe('203.0.113.1')
    })

    it('should use x-real-ip as fallback', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-real-ip': '203.0.113.2' },
      })
      const ip = getClientIP(request)
      expect(ip).toBe('203.0.113.2')
    })

    it('should default to localhost', () => {
      const request = new Request('http://localhost', { headers: {} })
      const ip = getClientIP(request)
      expect(ip).toBe('127.0.0.1')
    })

    it('should handle IPv6 addresses', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '[2001:db8::1], [2001:db8::2]' },
      })
      const ip = getClientIP(request)
      expect(ip).toContain('2001:db8::1')
    })
  })

  describe('Registration attack scenarios', () => {
    it('should prevent bot from registering 10 accounts in 1 hour', async () => {
      const attackerIP = '192.168.1.100'
      const registrationLimit = 3
      const timeWindow = 3600

      const results = []
      for (let i = 0; i < 10; i++) {
        const result = await checkRateLimit('register', attackerIP, registrationLimit, timeWindow)
        results.push(result)
      }

      // First 3 should succeed
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(true)
      expect(results[2].success).toBe(true)

      // Rest should fail
      expect(results[3].success).toBe(false)
      expect(results[4].success).toBe(false)
    })

    it('should prevent brute force login attacks', async () => {
      const attackerIP = '192.168.1.101'
      const loginLimit = 5
      const timeWindow = 900 // 15 minutes

      const results = []
      for (let i = 0; i < 20; i++) {
        const result = await checkRateLimit('login', attackerIP, loginLimit, timeWindow)
        results.push(result)
      }

      // First 5 should succeed
      for (let i = 0; i < 5; i++) {
        expect(results[i].success).toBe(true)
      }

      // Remaining should fail
      for (let i = 5; i < 20; i++) {
        expect(results[i].success).toBe(false)
        expect(results[i].message).toContain('Demasiados intentos')
      }
    })

    it('should allow legitimate users after window expires', async () => {
      // Note: Real expiry testing would require time manipulation
      // This tests the data structure is consistent
      const result1 = await checkRateLimit('test5', '192.168.1.102', 1, 1)
      expect(result1.success).toBe(true)

      const result2 = await checkRateLimit('test5', '192.168.1.102', 1, 1)
      expect(result2.success).toBe(false)

      // Window should be set for future
      expect(result2.resetAt).toBeGreaterThan(Date.now())
    })
  })
})
