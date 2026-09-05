import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { loadJsxModule } from '../../testUtils/loadJsxModule.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { default: React, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { default: DcfProfessionalSummary } = await loadJsxModule(
  path.join(__dirname, 'DcfProfessionalSummary.jsx')
)

const RESULTS = {
  enterprise_value: 100_000_000_000,
  equity_value: 108_000_000_000,
  value_per_share: 240,
  terminal_value: 150_000_000_000,
  pv_terminal_value: 79_000_000_000,
  terminal_growth_warnings: [],
}

const FORM = {
  baseYearFcf: '6450000000',
  fcfGrowthRate: '8',
  forecastYears: '5',
  wacc: '7.5',
  terminalGrowthRate: '2.5',
  netDebt: '-8020000000',
  dilutedSharesOutstanding: '444800000',
  referencePrice: '943.88',
  referencePriceDate: '2026-08-31',
}

const DRIVER_FORM = {
  baseYearRevenue: '275235000000',
  driverYears: Array.from({ length: 5 }, () => ({
    revenueGrowthRate: '5', ebitMargin: '3.43', taxRate: '24.55',
    daPctOfRevenue: '0.88', capexPctOfRevenue: '1.83', nwcInvestmentPct: '-3',
  })),
  rowModes: { revenueGrowthRate: 'flat' },
}

const BASE_YEAR_CAUTION = {
  reliability: 'unstable',
  reason: 'History changes sign - working capital was both consumed and released as revenue grew.',
  movement: { direction: 'release', amount: 1_750_000_000, label: '$1.75B working-capital release' },
  fiscalYear: '2025',
  headline: 'FY2025 included a $1.75B working-capital release.',
}

const HISTORICAL_CAGR = {
  cagr: 0.0844,
  oldestFiscalYearEnd: '2021-08-29',
  newestFiscalYearEnd: '2025-08-31',
}

const COMPANY = {
  profile: { company_name: 'Costco Wholesale Corporation', ticker: 'COST', sec_filings_url: 'https://x.invalid' },
  source: { fundamentals_provider: 'sec_edgar', market_data_provider: null },
  periods: [{ fiscal_year_end: '2025-08-31', provenance: { revenue: { status: 'reported' } } }],
}

function render(props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      React.createElement(DcfProfessionalSummary, {
        companyData: COMPANY,
        isDemoSnapshot: true,
        demoCaseLabel: 'Base Growth',
        forecastMode: 'quick',
        results: RESULTS,
        sensitivity: null,
        form: FORM,
        driverForm: DRIVER_FORM,
        baseYearRepresentativeness: BASE_YEAR_CAUTION,
        historicalFcfCagr: HISTORICAL_CAGR,
        historicalCagrQualification: null,
        reverseResult: null,
        showReverseResult: false,
        generatedOn: '9/4/2026',
        ...props,
      })
    )
  })
  const text = host.textContent
  act(() => root.unmount())
  host.remove()
  return text
}

// --- Quick-only content must not appear in Driver mode -------------------------------------

test('Driver mode omits the Base Year UFCF representativeness caution', () => {
  // Driver mode never starts from Base Year UFCF - it starts from base-year revenue - so a
  // qualification about that figure would describe an input this valuation did not use.
  const quick = render({})
  assert.match(quick, /Base-year representativeness/)
  assert.match(quick, /\$1\.75B working-capital release/)

  const driver = render({ forecastMode: 'driver' })
  assert.doesNotMatch(driver, /Base-year representativeness/)
  assert.doesNotMatch(driver, /working-capital release/)
})

test('Driver mode omits the historical UFCF CAGR qualification', () => {
  const props = {
    historicalCagrQualification:
      'Working-capital history is unstable for this company, so this CAGR may reflect working-capital timing rather than the underlying business.',
  }
  const quick = render(props)
  assert.match(quick, /is not used as a benchmark here/)
  assert.match(quick, /Working-capital history is unstable/)

  const driver = render({ ...props, forecastMode: 'driver' })
  assert.doesNotMatch(driver, /not used as a benchmark here/)
  assert.doesNotMatch(driver, /Working-capital history is unstable/)
})

test('Driver mode omits the Quick demo case identity', () => {
  // activeDemoCaseId is Quick's Low/Base/High tab identity; Driver's demo is one seeded Base Case.
  const quick = render({})
  assert.match(quick, /Base Growth case/)

  const driver = render({ forecastMode: 'driver' })
  assert.doesNotMatch(driver, /Base Growth case/)
  assert.match(driver, /Driver-Based mode/)
})

test('Driver mode still carries the shared content and its own assumptions', () => {
  const driver = render({ forecastMode: 'driver' })

  assert.match(driver, /Base Year Revenue/)
  assert.doesNotMatch(driver, /Base Year UFCF/)
  assert.match(driver, /no single growth rate to solve a reference price against/)
  // Reference price comparison is shared, and is the whole of Driver's price content.
  assert.match(driver, /Reference Price/)
  assert.match(driver, /Implied Downside/)
})

// --- Quick's solved reverse DCF names the analyst assumption --------------------------------

const SOLVED = { status: 'solved', implied_fcf_growth_rate: 0.307, reconciled_value_per_share: 943.88 }

test('a solved price-implied growth is compared with the analyst FCF growth assumption', () => {
  const text = render({ reverseResult: SOLVED, showReverseResult: true })

  assert.match(text, /Price-implied FCF growth of 30\.7%\/yr/)
  // 30.7 - 8.00 = 22.7pp. The analyst's own assumption is what the reader is judging against.
  assert.match(text, /22\.7 percentage points above the 8\.00%\/yr assumption in this valuation/)
})

test('the analyst comparison stands even when the historical CAGR is withheld', () => {
  const text = render({
    reverseResult: SOLVED,
    showReverseResult: true,
    historicalCagrQualification: 'Working-capital history is unstable for this company, so this CAGR may mislead.',
  })

  assert.match(text, /percentage points above the 8\.00%\/yr assumption/)
  assert.doesNotMatch(text, /Historical unlevered FCF CAGR over the sourced periods/)
})

test('a reliable historical CAGR appears alongside the analyst comparison, not instead of it', () => {
  const text = render({ reverseResult: SOLVED, showReverseResult: true })

  assert.match(text, /assumption in this valuation/)
  assert.match(text, /Historical unlevered FCF CAGR over the sourced periods was 8\.4%\/yr/)
})

test('Driver mode reports no price-implied growth even when a solved result is passed', () => {
  const text = render({ forecastMode: 'driver', reverseResult: SOLVED, showReverseResult: true })

  assert.doesNotMatch(text, /Price-implied FCF growth/)
  assert.doesNotMatch(text, /percentage points above/)
})

test('a blank analyst growth rate omits the comparison rather than inventing one', () => {
  const text = render({
    reverseResult: SOLVED,
    showReverseResult: true,
    form: { ...FORM, fcfGrowthRate: '' },
  })

  assert.match(text, /Price-implied FCF growth of 30\.7%\/yr/)
  assert.doesNotMatch(text, /assumption in this valuation/)
})
