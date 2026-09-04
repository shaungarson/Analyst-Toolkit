import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { loadJsxModule } from '../../testUtils/loadJsxModule.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// A minimal browser-like global environment, scoped to this file only.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.KeyboardEvent = dom.window.KeyboardEvent
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { default: React } = await import('react')
const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { default: NwcGuidanceDisclosure } = await loadJsxModule(
  path.join(__dirname, 'NwcGuidanceDisclosure.jsx'),
)

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(React.createElement(NwcGuidanceDisclosure)))
  return {
    container,
    toggle: () => container.querySelector('.driver-guidance-toggle'),
    body: () => container.querySelector('.driver-guidance-body'),
    click: () => act(() => container.querySelector('.driver-guidance-toggle').click()),
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

test('collapsed by default, with the trigger naming both what it explains and what to do', () => {
  const ui = mount()
  assert.equal(ui.toggle().getAttribute('aria-expanded'), 'false')
  assert.match(
    ui.toggle().textContent,
    /Why this benchmark was not used and how to set the assumption/,
  )
  ui.cleanup()
})

test('activating the trigger expands it and flips the reported state', () => {
  const ui = mount()
  ui.click()
  assert.equal(ui.toggle().getAttribute('aria-expanded'), 'true')
  ui.click()
  assert.equal(ui.toggle().getAttribute('aria-expanded'), 'false')
  ui.cleanup()
})

test('it is a real button, so keyboard activation and focus come from the platform', () => {
  const ui = mount()
  // A <button> is focusable and Enter/Space-activated natively - the previous popover trigger
  // needed its own key handling because it managed a floating layer.
  assert.equal(ui.toggle().tagName, 'BUTTON')
  assert.equal(ui.toggle().getAttribute('type'), 'button')
  ui.toggle().focus()
  assert.equal(document.activeElement, ui.toggle())
  ui.cleanup()
})

test('the trigger points at the region it controls, and the ids match', () => {
  const ui = mount()
  const controls = ui.toggle().getAttribute('aria-controls')
  assert.ok(controls)
  assert.equal(ui.body().getAttribute('id'), controls)
  ui.cleanup()
})

test('the guidance is two labelled parts: what happened, then what to do', () => {
  const ui = mount()
  ui.click()
  const labels = [...ui.container.querySelectorAll('.driver-guidance-part-label')].map((n) =>
    n.textContent.trim(),
  )
  assert.deepEqual(labels, ['What happened', 'What to do'])
  ui.cleanup()
})

test('the guidance explains the reversal and gives the three concrete next steps', () => {
  const ui = mount()
  ui.click()
  const text = ui.body().textContent
  assert.match(text, /consuming and releasing cash/)
  assert.match(text, /normalized assumption/)
  assert.match(text, /0%/)
  assert.match(text, /Sensitivity-test both directions/)
  ui.cleanup()
})

test('it never repeats the word Unstable - that status is stated once, in the evidence cell', () => {
  const ui = mount()
  ui.click()
  assert.ok(!/unstable/i.test(ui.container.textContent))
  ui.cleanup()
})

test('the collapsed body stays in the DOM rather than being unmounted', () => {
  // Toggling visibility with a class keeps the region a stable aria-controls target instead
  // of pointing at an element that only sometimes exists.
  const ui = mount()
  assert.ok(ui.body(), 'body element should exist while collapsed')
  assert.ok(ui.body().className.includes('no-screen'))
  ui.click()
  assert.ok(!ui.body().className.includes('no-screen'))
  ui.cleanup()
})
