// Component-level regression coverage for extending the Costco demo into Driver-Based mode
// (see docs/decisions.md's "Costco demo: a provider-independent Driver Base Case" record).
// Mounts the real DcfValuation.jsx via the general JSX loader (registerJsxLoader.mjs), not a
// hand-rolled stand-in, so these tests exercise the actual activateCostcoDemo/setForecastMode
// wiring rather than a re-implementation of it that could drift from the real thing.
import '../../testUtils/registerJsxLoader.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import { COSTCO_DRIVER_BASE_CASE } from './costcoDemo.js'
import { buildDriverPayload } from './driverSchedule.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
// Node has its own built-in read-only `navigator` global (21+) - only redefinable, not
// reassignable.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.KeyboardEvent = dom.window.KeyboardEvent
globalThis.localStorage = dom.window.localStorage
globalThis.HTMLInputElement = dom.window.HTMLInputElement
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { default: React } = await import('react')
const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { default: DcfValuation } = await import(pathToFileURL(path.join(__dirname, 'DcfValuation.jsx')).href)

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const flush = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await tick()
}

const MOCK_DRIVER_RESULTS = {
  forecast: Array.from({ length: 5 }, (_, i) => ({
    year: i + 1,
    revenue: 1,
    ebit: 1,
    cash_taxes: 0,
    nopat: 1,
    da: 1,
    capex: 1,
    delta_nwc: 0,
    fcf: 1,
    discount_factor: 1,
    present_value: 1,
  })),
  terminal_value: 100,
  pv_terminal_value: 90,
  enterprise_value: 100,
  equity_value: 108,
  value_per_share: 1.23,
  terminal_growth_warnings: [],
  driver_warnings: [],
}
const MOCK_QUICK_RESULTS = {
  forecast: Array.from({ length: 5 }, (_, i) => ({ year: i + 1, fcf: 1, discount_factor: 1, present_value: 1 })),
  terminal_value: 100,
  pv_terminal_value: 90,
  enterprise_value: 100,
  equity_value: 108,
  value_per_share: 1.23,
  terminal_growth_warnings: [],
  fcf_growth_warnings: [],
}
const MOCK_SENSITIVITY = { terminal_growth_rates: [0.025], rows: [{ wacc: 0.075, value_per_share_by_growth: [1.23] }] }

const MOCK_AAPL_COMPANY_DATA = {
  profile: {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    exchange: 'Nasdaq',
    market_capitalization: 3_000_000_000_000,
    shares_outstanding: 15_000_000_000,
    reference_price: null,
    reference_price_as_of: null,
  },
  periods: [
    {
      fiscal_year_end: '2025-09-30',
      revenue: 400_000_000_000,
      ebit: 120_000_000_000,
      pretax_income: 118_000_000_000,
      income_tax_expense: 18_000_000_000,
      effective_tax_rate: 0.15,
      depreciation_and_amortization: 12_000_000_000,
      capital_expenditures: 11_000_000_000,
      change_in_nwc: -2_000_000_000,
      unlevered_fcf: 100_000_000_000,
      cash: 30_000_000_000,
      total_debt: 100_000_000_000,
      net_debt: 70_000_000_000,
      revenue_growth: 0.06,
      operating_margin: 0.3,
    },
    {
      fiscal_year_end: '2024-09-30',
      revenue: 380_000_000_000,
      ebit: 110_000_000_000,
      pretax_income: 108_000_000_000,
      income_tax_expense: 16_000_000_000,
      effective_tax_rate: 0.15,
      depreciation_and_amortization: 11_500_000_000,
      capital_expenditures: 10_500_000_000,
      change_in_nwc: -1_500_000_000,
      unlevered_fcf: 92_000_000_000,
      cash: 28_000_000_000,
      total_debt: 98_000_000_000,
      net_debt: 70_000_000_000,
      revenue_growth: null,
      operating_margin: 0.29,
    },
  ],
  source: { fundamentals_provider: 'sec_edgar', market_data_provider: null, sec_filings_provider: 'sec_edgar' },
}

// A hard failure here is the point: any test that doesn't explicitly allow a company fetch
// (via `companyResponses`) must never see one - that's what "provider-independent" means.
function makeFetchMock({ companyResponses = {} } = {}) {
  const calls = []
  const fn = async (url, opts) => {
    const u = String(url)
    calls.push({ url: u, body: opts?.body ? JSON.parse(opts.body) : null })
    if (u.includes('/api/health')) return { ok: true, json: async () => ({}) }
    if (u.includes('/api/company/')) {
      const ticker = decodeURIComponent(u.split('/api/company/')[1])
      const data = companyResponses[ticker]
      if (!data) return { ok: false, status: 404, json: async () => ({ detail: `No company found for '${ticker}'.` }) }
      return { ok: true, json: async () => data }
    }
    if (u.includes('/api/dcf/driver-sensitivity')) return { ok: true, json: async () => MOCK_SENSITIVITY }
    if (u.includes('/api/dcf/driver-valuation')) return { ok: true, json: async () => MOCK_DRIVER_RESULTS }
    if (u.includes('/api/dcf/sensitivity')) return { ok: true, json: async () => MOCK_SENSITIVITY }
    if (u.includes('/api/dcf/valuation')) return { ok: true, json: async () => MOCK_QUICK_RESULTS }
    if (u.includes('/api/dcf/implied-growth')) return { ok: true, json: async () => ({ status: 'solved', implied_fcf_growth_rate: 0.05 }) }
    throw new Error(`unexpected fetch in test: ${u}`)
  }
  fn.calls = calls
  return fn
}

async function mountApp(fetchMock) {
  globalThis.fetch = fetchMock
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(DcfValuation))
    await flush()
  })
  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

const byText = (container, selector, text) =>
  [...container.querySelectorAll(selector)].find((el) => el.textContent.trim() === text)

async function clickButton(container, text) {
  const btn = byText(container, 'button', text)
  assert.ok(btn, `expected a button with text "${text}"`)
  await act(async () => {
    btn.click()
    await flush()
  })
  return btn
}

function inputByLabel(container, label) {
  return container.querySelector(`[aria-label="${label}"]`)
}

async function setInputValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
    await flush()
  })
}

const companyFetchCalls = (calls) => calls.filter((c) => c.url.includes('/api/company/'))

test('Costco demo: activating from Quick mode never calls the company-data endpoint', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Costco Demo ▼')
  assert.match(container.textContent, /Embedded demo snapshot/)
  assert.equal(companyFetchCalls(fetchMock.calls).length, 0)
  await unmount()
})

test('Costco demo: switching to Driver-Based mode first, then activating, still never calls the company-data endpoint', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Driver-Based')
  const demoBtn = byText(container, 'button', 'Costco Demo ▼')
  assert.equal(demoBtn.disabled, false, 'Costco Demo button must be enabled in Driver-Based mode')
  await clickButton(container, 'Costco Demo ▼')
  assert.match(container.textContent, /Embedded demo snapshot/)
  assert.match(container.textContent, /Driver Base Case/, 'the driver-mode disclosure text should be showing')
  assert.equal(companyFetchCalls(fetchMock.calls).length, 0)

  // The Driver-Based toggle itself must never have been disabled while the demo is active,
  // either - the whole point of this feature.
  const driverBtn = byText(container, 'button', 'Driver-Based')
  assert.equal(driverBtn.disabled, false)
  await unmount()
})

test('Costco demo: the Driver Base Case is complete and matches COSTCO_DRIVER_BASE_CASE exactly', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Driver-Based')
  await clickButton(container, 'Costco Demo ▼')

  const revenueInput = [...container.querySelectorAll('input')].find(
    (el) => el.closest('.driver-base-revenue') != null,
  )
  assert.equal(revenueInput?.value, '$275.24B', 'Base Year Revenue should render the sourced figure')

  // Flat rows render one "all years" input; the Fade row (Revenue Growth) renders only its
  // two endpoints as real inputs, with the interior years read-only text - matching
  // DriverScheduleBuilder.jsx's own generated-cell rendering, not a per-year grid of five
  // editable boxes regardless of mode.
  const flatFields = [
    ['ebitMargin', 'EBIT Margin (%)'],
    ['taxRate', 'Tax Rate (%)'],
    ['daPctOfRevenue', 'D&A (% of Revenue)'],
    ['capexPctOfRevenue', 'CapEx (% of Revenue)'],
    ['nwcInvestmentPct', 'NWC Investment (% of Δ Revenue)'],
  ]
  for (const [field, label] of flatFields) {
    const expected = COSTCO_DRIVER_BASE_CASE.driverYears[0][field]
    assert.ok(
      COSTCO_DRIVER_BASE_CASE.driverYears.every((y) => y[field] === expected),
      `${field} is asserted Flat - every year should already share one value`,
    )
    const el = inputByLabel(container, `${label}, all years`)
    assert.ok(el, `expected the Flat "all years" input for ${label}`)
    assert.equal(el.value, expected)
  }

  const expectedFade = COSTCO_DRIVER_BASE_CASE.driverYears.map((y) => y.revenueGrowthRate)
  const startEl = inputByLabel(container, 'Revenue Growth (%/yr), first forecast year')
  const endEl = inputByLabel(container, 'Revenue Growth (%/yr), final forecast year target')
  assert.ok(startEl && endEl, 'expected Revenue Growth\'s two Fade endpoint inputs')
  assert.equal(startEl.value, expectedFade[0])
  assert.equal(endEl.value, expectedFade[4])
  const preview = container.querySelector('.driver-generated-preview')
  assert.equal(preview?.textContent, expectedFade.map((v) => v || '—').join(' · '))
  await unmount()
})

test('Costco demo: rowModes match the design (Revenue Growth Fade, everything else Flat)', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Driver-Based')
  await clickButton(container, 'Costco Demo ▼')

  const activeModeFor = (label) => {
    const group = [...container.querySelectorAll('[role="group"]')].find((g) =>
      g.getAttribute('aria-label')?.startsWith(label),
    )
    assert.ok(group, `expected a mode switch for ${label}`)
    return [...group.querySelectorAll('button')].find((b) => b.className.includes('active'))?.textContent
  }

  assert.equal(activeModeFor('Revenue Growth (%/yr)'), 'Fade')
  assert.equal(activeModeFor('EBIT Margin (%)'), 'Flat')
  assert.equal(activeModeFor('Tax Rate (%)'), 'Flat')
  assert.equal(activeModeFor('D&A (% of Revenue)'), 'Flat')
  assert.equal(activeModeFor('CapEx (% of Revenue)'), 'Flat')
  assert.equal(activeModeFor('NWC Investment (% of Δ Revenue)'), 'Flat')
  await unmount()
})

test('Costco demo: five rows are badged Seeded; NWC Investment is not, and still shows its Unstable badge', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Driver-Based')
  await clickButton(container, 'Costco Demo ▼')

  const seededBadges = [...container.querySelectorAll('.driver-schedule-table .driver-seed-badge')]
  assert.equal(seededBadges.length, 5, 'exactly 5 rows should be badged Seeded')

  const nwcRow = [...container.querySelectorAll('tr')].find((tr) =>
    tr.textContent.includes('NWC Investment (% of Δ Revenue)'),
  )
  assert.ok(nwcRow)
  assert.equal(nwcRow.querySelector('.driver-seed-badge'), null, 'NWC Investment must never be badged Seeded')
  const unstableBtn = [...nwcRow.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Unstable')
  assert.ok(unstableBtn, 'NWC Investment should still show its own Unstable reliability badge')
  await unmount()
})

test('Costco demo: Run Valuation posts the exact deterministic COSTCO_DRIVER_BASE_CASE payload', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Driver-Based')
  await clickButton(container, 'Costco Demo ▼')
  await clickButton(container, 'Run Valuation')

  const call = fetchMock.calls.find((c) => c.url.includes('/api/dcf/driver-valuation'))
  assert.ok(call, 'expected a POST to /api/dcf/driver-valuation')
  const expected = buildDriverPayload(COSTCO_DRIVER_BASE_CASE.baseYearRevenue, COSTCO_DRIVER_BASE_CASE.driverYears, {
    wacc: '7.5',
    terminalGrowthRate: '2.5',
    netDebt: '-8017000000',
    dilutedSharesOutstanding: '444803000',
  })
  assert.deepEqual(call.body, expected)

  // Never a driver-inputs-incomplete error - the whole point of "immediately ready to run".
  assert.doesNotMatch(container.textContent, /driver inputs are incomplete/i)
  assert.match(container.textContent, /\$1\.23/, 'the mocked value per share should render')
  await unmount()
})

test('Costco demo: switching Quick <-> Driver restores each mode\'s own preset without mixing', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  // Activated from Quick mode (the default on mount).
  await clickButton(container, 'Costco Demo ▼')

  const fcfGrowthInput = () => [...container.querySelectorAll('input[type="number"]')].find((el) => el.value === '8')
  assert.ok(fcfGrowthInput(), 'Quick mode should default to Base Growth (8%/yr)')

  await clickButton(container, 'Driver-Based')
  let nwcInput = [...container.querySelectorAll('input')].find((el) => el.value === '-3')
  assert.ok(nwcInput, 'Driver mode should already show the Costco Driver Base Case, no re-activation needed')

  await clickButton(container, 'Quick DCF')
  assert.ok(fcfGrowthInput(), 'Quick mode\'s own Base Growth preset must survive the round trip unmixed')
  assert.match(container.textContent, /Low Growth \(4%\/yr\)/, 'the Quick-mode three-case disclosure must be back')

  await clickButton(container, 'Driver-Based')
  nwcInput = [...container.querySelectorAll('input')].find((el) => el.value === '-3')
  assert.ok(nwcInput, 'Driver mode\'s own preset must survive the round trip unmixed')
  await unmount()
})

test('Costco demo: the Quick-mode three-case tab strip never appears in Driver-Based mode', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Driver-Based')
  await clickButton(container, 'Costco Demo ▼')
  assert.equal(container.querySelector('[role="tablist"]'), null)
  assert.doesNotMatch(container.textContent, /Low Growth \(4%\/yr\)/)
  await unmount()
})

test('Costco demo: Quick DCF\'s existing Low/Base/High experience is unaffected by Driver mode support', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Costco Demo ▼')
  const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent)
  assert.deepEqual(tabs, ['Low Growth', 'Base Growth', 'High Growth'])
  assert.match(container.textContent, /WACC \(7\.5%\)/)
  assert.match(container.textContent, /terminal growth \(2\.5%\)/)
  await unmount()
})

test('state isolation: activating the Costco demo replaces a different, already-loaded company\'s driver schedule', async () => {
  const fetchMock = makeFetchMock({ companyResponses: { AAPL: MOCK_AAPL_COMPANY_DATA } })
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Driver-Based')

  const tickerInput = container.querySelector('input[placeholder="e.g. AAPL"]')
  await setInputValue(tickerInput, 'AAPL')
  await clickButton(container, 'Load Company')
  assert.match(container.textContent, /Apple Inc\./)

  await clickButton(container, 'Costco Demo ▼')
  assert.match(container.textContent, /Costco Wholesale Corporation/)
  const nwcInput = [...container.querySelectorAll('input')].find((el) => el.value === '-3')
  assert.ok(nwcInput, 'the Costco Driver Base Case must fully replace the prior company\'s schedule')
  const seededBadges = [...container.querySelectorAll('.driver-schedule-table .driver-seed-badge')]
  assert.equal(seededBadges.length, 5, 'seed badges must be Costco\'s own, not left over from AAPL')
  await unmount()
})

test('state isolation: loading the same ticker live after the demo resets the driver schedule anyway', async () => {
  const fetchMock = makeFetchMock({ companyResponses: { COST: MOCK_AAPL_COMPANY_DATA } })
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Driver-Based')
  await clickButton(container, 'Costco Demo ▼')
  assert.ok([...container.querySelectorAll('input')].find((el) => el.value === '-3'))

  // The ticker box already reads "COST" from activation; submit it as a live load.
  await clickButton(container, 'Load Company')

  assert.equal(container.querySelectorAll('.driver-schedule-table .driver-seed-badge').length, 0, 'a live load must never inherit demo-derived Seeded badges')
  assert.equal(
    [...container.querySelectorAll('input')].find((el) => el.value === '-3'),
    undefined,
    'the demo\'s NWC override must not survive into a live-loaded company, even the same ticker',
  )
  await unmount()
})

test('Costco demo: Driver mode never adds Low/Base/High case management (Reverse DCF stays Quick-only)', async () => {
  const fetchMock = makeFetchMock()
  const { container, unmount } = await mountApp(fetchMock)
  await clickButton(container, 'Driver-Based')
  await clickButton(container, 'Costco Demo ▼')
  assert.match(container.textContent, /Not available in Driver-Based mode/)
  await unmount()
})
