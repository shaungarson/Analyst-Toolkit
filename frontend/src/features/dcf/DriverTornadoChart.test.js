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
const { default: DriverTornadoChart } = await loadJsxModule(
  path.join(__dirname, 'DriverTornadoChart.jsx'),
)

// One warned row and one clean row - enough to check that a warning this run actually
// raised is presented outside the collapsed methodology, which is the whole point of
// splitting the two.
const TORNADO = {
  shift: 0.01,
  base_value_per_share: 263.25,
  rows: [
    {
      driver: 'da_pct_of_revenue',
      complete: true,
      base_path: [0.0088, 0.0088, 0.0088],
      down_value_per_share: 121.15,
      down_delta: -142.1,
      down_new_warnings: [
        {
          id: 'negative_da_percent',
          tier: 'caution',
          years: [1, 2, 3],
          explanation: 'D&A is a negative percentage of revenue in years 1-3.',
        },
      ],
      up_value_per_share: 405.35,
      up_delta: 142.1,
      up_new_warnings: [],
    },
    {
      driver: 'tax_rate',
      complete: true,
      base_path: [0.2455, 0.2455, 0.2455],
      down_value_per_share: 268.13,
      down_delta: 4.88,
      down_new_warnings: [],
      up_value_per_share: 258.38,
      up_delta: -4.87,
      up_new_warnings: [],
    },
  ],
}

function mount(tornado = TORNADO) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(React.createElement(DriverTornadoChart, { tornado })))
  return {
    container,
    toggle: () => container.querySelector('.chart-notes-toggle'),
    body: () => container.querySelector('.chart-notes-body'),
    click: () => act(() => container.querySelector('.chart-notes-toggle').click()),
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

test('the methodology disclosure is collapsed by default', () => {
  const ui = mount()
  assert.equal(ui.toggle().getAttribute('aria-expanded'), 'false')
  assert.ok(ui.body().className.includes('no-screen'))
  ui.cleanup()
})

test('toggling flips both the reported state and the region visibility, twice', () => {
  const ui = mount()
  ui.click()
  assert.equal(ui.toggle().getAttribute('aria-expanded'), 'true')
  assert.ok(!ui.body().className.includes('no-screen'))
  ui.click()
  assert.equal(ui.toggle().getAttribute('aria-expanded'), 'false')
  assert.ok(ui.body().className.includes('no-screen'))
  ui.cleanup()
})

test('the trigger points at the region it controls, and the ids match', () => {
  const ui = mount()
  const controls = ui.toggle().getAttribute('aria-controls')
  assert.ok(controls)
  assert.equal(ui.body().getAttribute('id'), controls)
  ui.cleanup()
})

test('the trigger names its own chart, since three read "How to read this"', () => {
  const ui = mount()
  assert.match(ui.toggle().textContent, /Driver Sensitivity/)
  ui.cleanup()
})

test('a warning this run raised stays outside the collapsed region', () => {
  const ui = mount()
  const warning = ui.container.querySelector('.tornado-endpoint-warning')
  assert.ok(warning, 'the endpoint warning should be rendered')
  assert.ok(
    !ui.body().contains(warning),
    'a result-specific warning must never sit inside the collapsed methodology',
  )
  assert.match(warning.textContent, /caution/i)
  ui.cleanup()
})

test('the caption keeps the base case and the tested endpoints visible while collapsed', () => {
  const ui = mount()
  const caption = ui.container.querySelector('.tornado-base')
  assert.ok(!ui.body().contains(caption))
  assert.match(caption.textContent, /\$263\.25/)
  // Every endpoint value stays in its own table cell, not behind the disclosure.
  const endpoints = [...ui.container.querySelectorAll('.tornado-endpoint-value')]
  assert.equal(endpoints.length, 4)
  assert.ok(endpoints.every((cell) => !ui.body().contains(cell)))
  ui.cleanup()
})

test('the collapsed region still holds the methodology, rather than dropping it', () => {
  // Kept mounted so aria-controls always has a target and print.css can force it visible.
  const ui = mount()
  assert.ok(ui.body().querySelectorAll('p').length >= 3)
  ui.cleanup()
})
