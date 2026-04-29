import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

// Regression guard for the "focus jumps to close X while typing in a textarea
// inside a Modal" bug. The useEffect that locks scroll, traps focus, and
// auto-focuses the first field MUST NOT depend on `onClose`. Parents pass
// inline `() => setOpen(false)` so a fresh function identity arrives on every
// render, and listing it as a dep makes the effect re-run on every keystroke
// in any child input — which calls focus() again and yanks focus away.
test('Modal open-effect does not depend on onClose (focus stability)', () => {
  const source = readSource('../../src/components/ui/modal.tsx')

  // The effect that touches body.style.overflow is the open/close effect.
  // Find it and check its dep array.
  const effectRegex = /useEffect\(\(\) => \{[\s\S]*?body\.style\.overflow = 'hidden'[\s\S]*?\}, \[([^\]]*)\]\)/
  const match = source.match(effectRegex)
  assert.ok(match, 'modal.tsx must contain the scroll-lock useEffect')
  const deps = match![1]!.trim()
  assert.equal(
    deps,
    'open',
    `modal.tsx open/close effect deps must be exactly [open]. Found [${deps}]. Including onClose makes the effect re-run on every parent re-render and steals focus on every keystroke.`,
  )

  // The Escape handler must call the latest onClose via a ref (so we don't
  // capture a stale closure).
  assert.match(
    source,
    /onCloseRef\.current\(\)/,
    'Escape handler must invoke onCloseRef.current() so the ref pattern compensates for [open]-only deps',
  )
})

test('Modal auto-focus prefers editable fields over the close button', () => {
  const source = readSource('../../src/components/ui/modal.tsx')

  // The selector that runs first inside the auto-focus setTimeout MUST query
  // for editable fields (input/textarea/select) — focusing the close X by
  // default is hostile when the dialog has a form. The fallback querySelectorAll
  // for buttons happens only when no editable element exists.
  const inputIdx = source.indexOf("'input:not")
  const buttonIdx = source.indexOf("'button:not")
  assert.notEqual(inputIdx, -1, 'modal.tsx must query for editable fields first')
  assert.notEqual(buttonIdx, -1, 'modal.tsx must still have a button fallback selector')
  assert.ok(
    inputIdx < buttonIdx,
    'editable-field selector must appear before the button fallback selector — focusing the close X first is hostile UX',
  )
})
