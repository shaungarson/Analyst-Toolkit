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
const { default: DriverGrowthMarginGrid } = await loadJsxModule(
  path.join(__dirname, 'DriverGrowthMarginGrid.jsx'),
)

const cell = (value, warnings = []) => ({ value_per_share: value, new_warnings: warnings })

const NEGATIVE_DA = {
  id: 'negative_da_percent',
  tier: 'caution',
  explanation: 'D&A is a negative percentage of revenue in at least one forecast year.',
}

// A 3x3 slice of the real shape: one warned cell, one n/a cell, the rest plain.
const GRID = {
  step: 0.01,
  base_value_per_share: 263.25,
  ebit_margin_deltas: [-0.01, 0, 0.01],
  base_revenue_growth_path: [0.0746, 0.0498, 0.025],
  base_ebit_margin_path: [0.0343, 0.0343, 0.0343],
  rows: [
    {
      revenue_growth_delta: -0.01,
      cells: [cell(146.3, [NEGATIVE_DA]), cell(248.94), cell(351.57)],
    },
    { revenue_growth_delta: 0, cells: [cell(156.04), cell(263.25), cell(370.47)] },
    { revenue_growth_delta: 0.01, cells: [cell(166.26), cell(278.22), cell(null)] },
  ],
}

function mount(grid = GRID) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(React.createElement(DriverGrowthMarginGrid, { grid })))
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

test('the trigger names its own chart, so it is distinguishable from the tornado above', () => {
  const ui = mount()
  assert.match(ui.toggle().textContent, /Driver Interaction/)
  ui.cleanup()
})

test('the warning list this run produced stays outside the collapsed region', () => {
  const ui = mount()
  const list = ui.container.querySelector('.growth-margin-warning-list')
  assert.ok(list, 'the numbered warning list should be rendered')
  assert.ok(
    !ui.body().contains(list),
    'a result-specific warning must never sit inside the collapsed methodology',
  )
  assert.match(list.textContent, /caution/i)
  // And the footnote marker on the cell that triggered it.
  const marked = ui.container.querySelector('.growth-margin-cell--warned')
  assert.ok(marked && !ui.body().contains(marked))
  ui.cleanup()
})

test('the caption and every cell value stay visible while collapsed', () => {
  const ui = mount()
  const caption = ui.container.querySelector('.growth-margin-base')
  assert.ok(!ui.body().contains(caption))
  assert.match(caption.textContent, /\$263\.25/)
  const table = ui.container.querySelector('.growth-margin-table')
  assert.ok(!ui.body().contains(table))
  assert.equal(table.querySelectorAll('tbody td').length, 9)
  ui.cleanup()
})

test('a grid with no warnings still renders its disclosure, collapsed', () => {
  const clean = {
    ...GRID,
    rows: GRID.rows.map((row) => ({ ...row, cells: row.cells.map((c) => cell(c.value_per_share)) })),
  }
  const ui = mount(clean)
  assert.equal(ui.container.querySelector('.growth-margin-warning-list'), null)
  assert.equal(ui.toggle().getAttribute('aria-expanded'), 'false')
  assert.ok(ui.body().querySelectorAll('p').length >= 3)
  ui.cleanup()
})
