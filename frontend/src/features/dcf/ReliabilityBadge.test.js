import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { loadJsxModule } from '../../testUtils/loadJsxModule.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// A minimal browser-like global environment, scoped to this file only - none of the other
// tests in this suite touch the DOM, so this is set up here rather than project-wide.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
// Node has its own built-in read-only `navigator` global (21+), so it can't be reassigned -
// only redefined.
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
const { default: ReliabilityBadge } = await loadJsxModule(path.join(__dirname, 'ReliabilityBadge.jsx'))

function mount(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(React.createElement(ReliabilityBadge, props))
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

test('ReliabilityBadge: non-unstable reliability renders plain text, no button', () => {
  const { container, unmount } = mount({ field: 'nwcInvestmentPct', reliability: 'thin', label: 'Thin history' })
  assert.equal(container.querySelectorAll('button').length, 0)
  assert.equal(container.textContent, 'Thin history')
  unmount()
})

test('ReliabilityBadge: unstable on a non-NWC field renders plain text, no button', () => {
  // Only NWC Investment ever reaches 'unstable' today (see classifyNwc in driverHistory.js),
  // but the badge is field-gated defensively rather than trusting that invariant forever.
  const { container, unmount } = mount({ field: 'capexPctOfRevenue', reliability: 'unstable', label: 'Unstable' })
  assert.equal(container.querySelectorAll('button').length, 0)
  assert.equal(container.querySelector('[role="dialog"]'), null)
  unmount()
})

test('ReliabilityBadge: unstable NWC renders an interactive button, closed by default', () => {
  const { container, unmount } = mount({ field: 'nwcInvestmentPct', reliability: 'unstable', label: 'Unstable' })
  const button = container.querySelector('button')
  assert.ok(button, 'expected the Unstable badge to be a button')
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(container.querySelector('[role="dialog"]'), null)
  unmount()
})

test('ReliabilityBadge: activating the button opens the popover and moves focus into it', () => {
  const { container, unmount } = mount({ field: 'nwcInvestmentPct', reliability: 'unstable', label: 'Unstable' })
  const button = container.querySelector('button')
  act(() => {
    button.click()
  })
  const panel = container.querySelector('[role="dialog"]')
  assert.ok(panel, 'popover should be open after activating the trigger')
  assert.equal(button.getAttribute('aria-expanded'), 'true')
  assert.equal(document.activeElement, panel, 'focus should move into the popover on open')
  assert.match(panel.textContent, /too inconsistent to provide a reliable automatic forecast/)
  assert.match(panel.textContent, /How to proceed/)
  assert.match(panel.textContent, /use 0% as a neutral preliminary assumption/)
  unmount()
})

test('ReliabilityBadge: Escape closes the popover and returns focus to the trigger', () => {
  const { container, unmount } = mount({ field: 'nwcInvestmentPct', reliability: 'unstable', label: 'Unstable' })
  const button = container.querySelector('button')
  act(() => {
    button.click()
  })
  assert.ok(container.querySelector('[role="dialog"]'))
  act(() => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  assert.equal(container.querySelector('[role="dialog"]'), null)
  assert.equal(document.activeElement, button, 'focus should return to the trigger on close')
  unmount()
})

test('ReliabilityBadge: clicking outside the popover dismisses it', () => {
  const { container, unmount } = mount({ field: 'nwcInvestmentPct', reliability: 'unstable', label: 'Unstable' })
  const button = container.querySelector('button')
  act(() => {
    button.click()
  })
  assert.ok(container.querySelector('[role="dialog"]'))
  act(() => {
    document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  })
  assert.equal(container.querySelector('[role="dialog"]'), null)
  unmount()
})

test('ReliabilityBadge: clicking inside the popover does not dismiss it', () => {
  const { container, unmount } = mount({ field: 'nwcInvestmentPct', reliability: 'unstable', label: 'Unstable' })
  const button = container.querySelector('button')
  act(() => {
    button.click()
  })
  const panel = container.querySelector('[role="dialog"]')
  act(() => {
    panel.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  })
  assert.ok(container.querySelector('[role="dialog"]'), 'a click inside the popover must not close it')
  unmount()
})

test('ReliabilityBadge: the explicit close button dismisses the popover and restores focus', () => {
  const { container, unmount } = mount({ field: 'nwcInvestmentPct', reliability: 'unstable', label: 'Unstable' })
  const button = container.querySelector('button')
  act(() => {
    button.click()
  })
  const closeBtn = container.querySelector('.reliability-popover-close')
  assert.ok(closeBtn)
  act(() => {
    closeBtn.click()
  })
  assert.equal(container.querySelector('[role="dialog"]'), null)
  assert.equal(document.activeElement, button)
  unmount()
})

test('ReliabilityBadge: clicking the trigger again toggles the popover closed', () => {
  const { container, unmount } = mount({ field: 'nwcInvestmentPct', reliability: 'unstable', label: 'Unstable' })
  const button = container.querySelector('button')
  act(() => {
    button.click()
  })
  assert.ok(container.querySelector('[role="dialog"]'))
  act(() => {
    button.click()
  })
  assert.equal(container.querySelector('[role="dialog"]'), null)
  unmount()
})
