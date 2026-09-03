import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_DRIVER_YEAR,
  buildDriverPayload,
  driverInputsError,
  resizeDriverYears,
} from './driverSchedule.js'

test('resizeDriverYears: growing from empty clones EMPTY_DRIVER_YEAR into every new year', () => {
  const result = resizeDriverYears([], 3)
  assert.equal(result.length, 3)
  assert.deepEqual(result[0], EMPTY_DRIVER_YEAR)
  assert.deepEqual(result[2], EMPTY_DRIVER_YEAR)
  // Independent objects, not the same reference repeated - editing one year must not edit
  // the others.
  assert.notEqual(result[0], result[1])
})

test('resizeDriverYears: growing an existing schedule clones the last year, preserving earlier years', () => {
  const existing = [
    { ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '10' },
    { ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '8' },
  ]
  const result = resizeDriverYears(existing, 4)
  assert.equal(result.length, 4)
  assert.equal(result[0].revenueGrowthRate, '10') // untouched
  assert.equal(result[1].revenueGrowthRate, '8') // untouched
  assert.equal(result[2].revenueGrowthRate, '8') // cloned from the last existing year
  assert.equal(result[3].revenueGrowthRate, '8')
})

test('resizeDriverYears: shrinking truncates from the end, keeping earlier years exactly', () => {
  const existing = [
    { ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '10' },
    { ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '8' },
    { ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '6' },
  ]
  const result = resizeDriverYears(existing, 1)
  assert.equal(result.length, 1)
  assert.equal(result[0].revenueGrowthRate, '10')
})

test('resizeDriverYears: same length returns the input unchanged (no unnecessary re-render churn)', () => {
  const existing = [{ ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '10' }]
  assert.equal(resizeDriverYears(existing, 1), existing)
})

test('resizeDriverYears: negative or non-numeric target clamps to zero years', () => {
  assert.equal(resizeDriverYears([{ ...EMPTY_DRIVER_YEAR }], -5).length, 0)
  assert.equal(resizeDriverYears([{ ...EMPTY_DRIVER_YEAR }], NaN).length, 0)
})

test('buildDriverPayload: converts percent-entered strings to decimals and numbers throughout', () => {
  const payload = buildDriverPayload(
    '1000',
    [
      {
        revenueGrowthRate: '10',
        ebitMargin: '20',
        taxRate: '25',
        daPctOfRevenue: '4',
        capexPctOfRevenue: '5',
        nwcInvestmentPct: '10',
      },
    ],
    { wacc: '9', terminalGrowthRate: '2.5', netDebt: '200', dilutedSharesOutstanding: '100' },
  )
  assert.equal(payload.base_year_revenue, 1000)
  assert.equal(payload.driver_years.length, 1)
  assert.equal(payload.driver_years[0].revenue_growth_rate, 0.10)
  assert.equal(payload.driver_years[0].ebit_margin, 0.20)
  assert.equal(payload.driver_years[0].tax_rate, 0.25)
  assert.equal(payload.driver_years[0].da_pct_of_revenue, 0.04)
  assert.equal(payload.driver_years[0].capex_pct_of_revenue, 0.05)
  assert.equal(payload.driver_years[0].nwc_investment_pct_of_revenue_change, 0.10)
  assert.equal(payload.wacc, 0.09)
  assert.equal(payload.terminal_growth_rate, 0.025)
  assert.equal(payload.net_debt, 200)
  assert.equal(payload.diluted_shares_outstanding, 100)
})

// --- driverInputsError: completeness is enforced separately from plausibility ---

const COMPLETE_YEAR = {
  revenueGrowthRate: '8',
  ebitMargin: '20',
  taxRate: '25',
  daPctOfRevenue: '4',
  capexPctOfRevenue: '5',
  nwcInvestmentPct: '10',
}

const COMPLETE_SHARED = {
  wacc: '9',
  terminalGrowthRate: '2.5',
  netDebt: '200',
  dilutedSharesOutstanding: '100',
}

test('driverInputsError: a fully filled set of inputs is valid', () => {
  assert.equal(driverInputsError('1000', [COMPLETE_YEAR, COMPLETE_YEAR], COMPLETE_SHARED), null)
})

test('driverInputsError: a genuine typed zero is valid, in every field and every form', () => {
  // The whole point of the check is to separate "not filled in" from "filled in as zero".
  // 0% growth, a 0% tax rate, zero CapEx, a 0% terminal growth rate, and zero net debt are
  // all legitimate analyst assumptions - whether a given one is *computationally* acceptable
  // stays the backend's call, not this function's.
  const zeroedYear = {
    revenueGrowthRate: '0',
    ebitMargin: '0.0',
    taxRate: '0',
    daPctOfRevenue: '-0',
    capexPctOfRevenue: '0',
    nwcInvestmentPct: '0',
  }
  const zeroedShared = { wacc: '9', terminalGrowthRate: '0', netDebt: '0', dilutedSharesOutstanding: '100' }
  assert.equal(driverInputsError('0', [zeroedYear], zeroedShared), null)
})

test('driverInputsError: a blank driver cell is rejected and never treated as zero', () => {
  const message = driverInputsError('1000', [{ ...COMPLETE_YEAR, taxRate: '' }], COMPLETE_SHARED)
  assert.ok(message)
  assert.match(message, /not treated as 0/)
  assert.match(message, /Tax Rate \(Year 1\)/)
})

test('driverInputsError: whitespace-only and non-numeric values are rejected too', () => {
  assert.ok(driverInputsError('1000', [{ ...COMPLETE_YEAR, ebitMargin: '   ' }], COMPLETE_SHARED))
  assert.ok(driverInputsError('1000', [{ ...COMPLETE_YEAR, ebitMargin: 'abc' }], COMPLETE_SHARED))
  assert.ok(driverInputsError('   ', [COMPLETE_YEAR], COMPLETE_SHARED))
  assert.ok(driverInputsError('1000', [COMPLETE_YEAR], { ...COMPLETE_SHARED, wacc: 'abc' }))
})

test('driverInputsError: a missing Base Year Revenue is named specifically', () => {
  assert.match(driverInputsError('', [COMPLETE_YEAR], COMPLETE_SHARED), /Base Year Revenue/)
})

test('driverInputsError: names the year each missing cell belongs to', () => {
  const message = driverInputsError(
    '1000',
    [COMPLETE_YEAR, { ...COMPLETE_YEAR, capexPctOfRevenue: '' }],
    COMPLETE_SHARED,
  )
  assert.match(message, /CapEx \(% of Revenue\) \(Year 2\)/)
})

test('driverInputsError: an empty schedule points at the Forecast Period, not at 90 blank cells', () => {
  assert.match(driverInputsError('1000', [], COMPLETE_SHARED), /Forecast Period/)
  assert.match(driverInputsError('1000', undefined, COMPLETE_SHARED), /Forecast Period/)
})

test('driverInputsError: a wholly empty form summarizes rather than listing every field', () => {
  const message = driverInputsError('', Array.from({ length: 15 }, () => ({ ...EMPTY_DRIVER_YEAR })), {})
  assert.match(message, /and \d+ more/)
  // 1 base-year field + 4 shared + 15 years x 6 drivers = 95 missing, 5 named, 90 summarized.
  assert.match(message, /and 90 more/)
  // The four shared fields are listed before the per-year cells precisely so they stay
  // visible under the cap even when the entire table is blank.
  assert.match(message, /Terminal Growth Rate/)
})

// --- The shared assumptions buildDriverPayload also converts --------------------------------
//
// These are the dangerous ones. A blank driver cell at least produces an odd-looking schedule;
// a blank Terminal Growth Rate or Net Debt coerces to a value the backend accepts as entirely
// valid (0% terminal growth, $0 net debt), so nothing downstream ever objects and the analyst
// gets a confident, wrong number instead of an error.

test('driverInputsError: a blank Terminal Growth Rate is rejected, not silently valued at 0%', () => {
  const message = driverInputsError('1000', [COMPLETE_YEAR], { ...COMPLETE_SHARED, terminalGrowthRate: '' })
  assert.ok(message)
  assert.match(message, /Terminal Growth Rate/)
})

test('driverInputsError: a blank Net Debt is rejected, not silently valued at $0', () => {
  const message = driverInputsError('1000', [COMPLETE_YEAR], { ...COMPLETE_SHARED, netDebt: '' })
  assert.ok(message)
  assert.match(message, /Net Debt/)
})

test('driverInputsError: an entered zero Terminal Growth or Net Debt stays valid', () => {
  // The distinction that makes the two tests above meaningful: 0% terminal growth and $0 net
  // debt are real, common assumptions. Rejecting them would be as wrong as coercing a blank.
  assert.equal(
    driverInputsError('1000', [COMPLETE_YEAR], { ...COMPLETE_SHARED, terminalGrowthRate: '0', netDebt: '0' }),
    null,
  )
})

test('driverInputsError: a blank WACC or Diluted Shares is rejected', () => {
  assert.match(driverInputsError('1000', [COMPLETE_YEAR], { ...COMPLETE_SHARED, wacc: '' }), /WACC/)
  assert.match(
    driverInputsError('1000', [COMPLETE_YEAR], { ...COMPLETE_SHARED, dilutedSharesOutstanding: '' }),
    /Diluted Shares Outstanding/,
  )
})

test('driverInputsError: a missing sharedForm entirely is incomplete, not a crash', () => {
  const message = driverInputsError('1000', [COMPLETE_YEAR], undefined)
  assert.ok(message)
  assert.match(message, /WACC/)
})

// --- buildDriverPayload enforces the invariant itself ---------------------------------------

test('buildDriverPayload: throws rather than coercing a blank driver cell to 0', () => {
  assert.throws(
    () => buildDriverPayload('1000', [{ ...COMPLETE_YEAR, taxRate: '' }], COMPLETE_SHARED),
    /Tax Rate \(Year 1\)/,
  )
})

test('buildDriverPayload: throws rather than coercing a blank Terminal Growth Rate to 0%', () => {
  assert.throws(
    () => buildDriverPayload('1000', [COMPLETE_YEAR], { ...COMPLETE_SHARED, terminalGrowthRate: '' }),
    /Terminal Growth Rate/,
  )
})

test('buildDriverPayload: throws rather than coercing a blank Net Debt to $0', () => {
  assert.throws(
    () => buildDriverPayload('1000', [COMPLETE_YEAR], { ...COMPLETE_SHARED, netDebt: '' }),
    /Net Debt/,
  )
})

test('buildDriverPayload: still builds a payload when a real zero is entered', () => {
  const payload = buildDriverPayload('1000', [COMPLETE_YEAR], {
    ...COMPLETE_SHARED,
    terminalGrowthRate: '0',
    netDebt: '0',
  })
  assert.equal(payload.terminal_growth_rate, 0)
  assert.equal(payload.net_debt, 0)
})

// --- The scenario-comparison guard ---------------------------------------------------------
//
// These exercise driverInputsError against the exact saved-scenario shapes DcfValuation's
// handleCompare feeds it (the scenario's own driverForm plus s.data itself as the shared
// form), which is the predicate that decides whether a scenario is valued or rejected before
// any request is made. The React wiring itself is not covered - this project has no
// component-testing dependency (see decisions.md).

const compareGuard = (scenario) =>
  driverInputsError(
    scenario.data.driverForm?.baseYearRevenue ?? '',
    scenario.data.driverForm?.driverYears ?? [],
    scenario.data,
  )

const driverScenario = (overrides = {}) => ({
  name: 'Scenario',
  data: {
    forecastMode: 'driver',
    ...COMPLETE_SHARED,
    driverForm: { baseYearRevenue: '1000', driverYears: [COMPLETE_YEAR] },
    ...overrides,
  },
})

test('comparison guard: a complete saved driver scenario passes', () => {
  assert.equal(compareGuard(driverScenario()), null)
})

test('comparison guard: an incomplete saved draft is rejected instead of valued as 0', () => {
  // The case this exists for: a half-filled "Downside" idea saved as a draft, which would
  // otherwise be valued with tax/D&A/CapEx/NWC all at 0% and compare as *higher* than Base.
  const scenario = driverScenario({
    driverForm: {
      baseYearRevenue: '1000',
      driverYears: [{ ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '3', ebitMargin: '12' }],
    },
  })
  const message = compareGuard(scenario)
  assert.ok(message)
  assert.match(message, /not treated as 0/)
  assert.match(message, /Tax Rate \(Year 1\)/)
})

test('comparison guard: a scenario missing a shared assumption is rejected too', () => {
  assert.match(compareGuard(driverScenario({ terminalGrowthRate: '' })), /Terminal Growth Rate/)
  assert.match(compareGuard(driverScenario({ netDebt: '' })), /Net Debt/)
})

test('comparison guard: a scenario saved with no driverForm at all is rejected, not crashed on', () => {
  assert.ok(compareGuard({ name: 'Legacy', data: { forecastMode: 'driver' } }))
})
