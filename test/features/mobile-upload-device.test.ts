import test from 'node:test'
import assert from 'node:assert/strict'
import { detectMobileUploadDevice } from '@/components/vendor/useMobileUploadDevice'

test('detectMobileUploadDevice treats iPhone user agents as mobile upload devices', () => {
  assert.equal(
    detectMobileUploadDevice({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      hasCoarsePointer: true,
      viewportWidth: 390,
    }),
    true,
  )
})

test('detectMobileUploadDevice treats coarse narrow touch devices as mobile even without a phone UA', () => {
  assert.equal(
    detectMobileUploadDevice({
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      hasCoarsePointer: true,
      viewportWidth: 820,
    }),
    true,
  )
})

test('detectMobileUploadDevice keeps desktop browsers on the upload-only path', () => {
  assert.equal(
    detectMobileUploadDevice({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      hasCoarsePointer: false,
      viewportWidth: 1440,
    }),
    false,
  )
})

test('detectMobileUploadDevice does not treat large coarse-pointer kiosks as handheld upload devices', () => {
  assert.equal(
    detectMobileUploadDevice({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      hasCoarsePointer: true,
      viewportWidth: 1366,
    }),
    false,
  )
})
