import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_DRIVER_YEAR,
  applyRowMode,
  buildBaseForecast,
  buildDriverPayload,
  clearAllDriverRows,
  defaultRowModes,
  driverInputsError,
  fadeValues,
  forecastYearLabels,
  normalizeRowModes,
  resizeDriverYearsWithModes,
  setFadeEndpoint,
  setFlatValue,
  shouldResetDriverSchedule,
} from './driverSchedule.js'
import { driverHistory, formatSeedValue } from './driverHistory.js'
import { COSTCO_COMPANY_DATA } from './costcoDemo.js'

const years = (n) => Array.from({ length: n }, () => ({ ...EMPTY_DRIVER_YEAR }))
const read = (schedule, field) => schedule.map((y) => y[field])

// --- Fade interpolation: endpoints exact, intermediates on the straight line ----------------

test('fadeValues: the two endpoints are exactly what was typed, never re-rounded', () => {
  const result = fadeValues('7.4615', '2.5', 4)
  assert.equal(result[0], '7.4615')
  assert.equal(result[3], '2.5')
})

test('fadeValues: intermediate years sit on the straight line between the endpoints', () => {
  assert.deepEqual(fadeValues('8', '2', 4), ['8', '6', '4', '2'])
  assert.deepEqual(fadeValues('10', '0', 5), ['10', '7.5', '5', '2.5', '0'])
})

test('fadeValues: an upward fade works the same way as a downward one', () => {
  assert.deepEqual(fadeValues('2', '8', 3), ['2', '5', '8'])
})

test('fadeValues: equal endpoints produce a flat line, not an error', () => {
  assert.deepEqual(fadeValues('7.46', '7.46', 3), ['7.46', '7.46', '7.46'])
})

test('fadeValues: a two-year forecast is just the two endpoints', () => {
  assert.deepEqual(fadeValues('8', '2', 2), ['8', '2'])
})

test('fadeValues: a one-year forecast is a degenerate fade - the target has nowhere to land', () => {
  assert.deepEqual(fadeValues('8', '2', 1), ['8'])
})

test('fadeValues: a blank or non-numeric endpoint yields blanks, never NaN', () => {
  assert.deepEqual(fadeValues('', '2', 3), ['', '', ''])
  assert.deepEqual(fadeValues('8', 'abc', 3), ['', '', ''])
  assert.deepEqual(fadeValues('8', '2', 0), [])
})

test('fadeValues: interpolation never leaks floating-point noise into an input', () => {
  for (const value of fadeValues('10', '3', 7)) {
    assert.ok(!value.includes('99999'), `unexpected float noise in ${value}`)
    assert.ok(Number.isFinite(Number(value)))
  }
})

// --- Flat and Fade generation over the shared schedule ---------------------------------------

test('setFlatValue: writes one value to every year and touches no other driver', () => {
  const schedule = setFlatValue(
    [
      { ...EMPTY_DRIVER_YEAR, ebitMargin: '20' },
      { ...EMPTY_DRIVER_YEAR, ebitMargin: '21' },
    ],
    'capexPctOfRevenue',
    '5',
  )
  assert.deepEqual(read(schedule, 'capexPctOfRevenue'), ['5', '5'])
  assert.deepEqual(read(schedule, 'ebitMargin'), ['20', '21'])
})

test('setFadeEndpoint: editing the start re-interpolates while leaving the target alone', () => {
  let schedule = setFlatValue(years(5), 'revenueGrowthRate', '5')
  schedule = setFadeEndpoint(schedule, 'revenueGrowthRate', 'end', '1')
  schedule = setFadeEndpoint(schedule, 'revenueGrowthRate', 'start', '9')
  assert.deepEqual(read(schedule, 'revenueGrowthRate'), ['9', '7', '5', '3', '1'])
})

test('setFadeEndpoint: editing the target re-interpolates while leaving the start alone', () => {
  let schedule = setFlatValue(years(3), 'revenueGrowthRate', '6')
  schedule = setFadeEndpoint(schedule, 'revenueGrowthRate', 'end', '2')
  assert.deepEqual(read(schedule, 'revenueGrowthRate'), ['6', '4', '2'])
})

// --- The terminal-growth target is a one-time copy, never a live binding ----------------------

test('terminal-growth target: copying it in, then editing the start, leaves the target put', () => {
  // The UI action is setFadeEndpoint(..., 'end', terminalGrowthRate) - a plain value copy.
  let schedule = setFlatValue(years(4), 'revenueGrowthRate', '7.46')
  schedule = setFadeEndpoint(schedule, 'revenueGrowthRate', 'end', '2.5')
  assert.equal(schedule[3].revenueGrowthRate, '2.5')

  schedule = setFadeEndpoint(schedule, 'revenueGrowthRate', 'start', '12')
  assert.equal(schedule[3].revenueGrowthRate, '2.5', 'the copied target must not move')
})

test('terminal-growth target: a later terminal-growth value does not reach back into the schedule', () => {
  let schedule = setFlatValue(years(3), 'revenueGrowthRate', '8')
  schedule = setFadeEndpoint(schedule, 'revenueGrowthRate', 'end', '2.5')
  const afterCopy = read(schedule, 'revenueGrowthRate')

  // Nothing in the schedule references the terminal growth field, so a subsequent change to
  // it - modelled here by simply not calling anything - cannot mutate revenue growth. The
  // only path back in is another explicit click, which is a fresh setFadeEndpoint call.
  assert.deepEqual(read(schedule, 'revenueGrowthRate'), afterCopy)
  schedule = setFadeEndpoint(schedule, 'revenueGrowthRate', 'end', '3')
  assert.equal(schedule[2].revenueGrowthRate, '3')
})

// --- Mode switching -----------------------------------------------------------------------------

test('applyRowMode: switching to Custom changes no values at all', () => {
  const schedule = [
    { ...EMPTY_DRIVER_YEAR, ebitMargin: '20' },
    { ...EMPTY_DRIVER_YEAR, ebitMargin: '25' },
    { ...EMPTY_DRIVER_YEAR, ebitMargin: '18' },
  ]
  assert.equal(applyRowMode(schedule, 'ebitMargin', 'custom'), schedule)
})

test('applyRowMode: switching to Flat broadcasts year one across the schedule', () => {
  const schedule = [
    { ...EMPTY_DRIVER_YEAR, ebitMargin: '20' },
    { ...EMPTY_DRIVER_YEAR, ebitMargin: '25' },
    { ...EMPTY_DRIVER_YEAR, ebitMargin: '18' },
  ]
  assert.deepEqual(read(applyRowMode(schedule, 'ebitMargin', 'flat'), 'ebitMargin'), ['20', '20', '20'])
})

test('applyRowMode: switching to Fade keeps both existing endpoints and straightens the middle', () => {
  const schedule = [
    { ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '10' },
    { ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '99' },
    { ...EMPTY_DRIVER_YEAR, revenueGrowthRate: '2' },
  ]
  assert.deepEqual(read(applyRowMode(schedule, 'revenueGrowthRate', 'fade'), 'revenueGrowthRate'), ['10', '6', '2'])
})

test('applyRowMode: a still-blank row is left blank rather than being filled with anything', () => {
  const schedule = years(3)
  assert.equal(applyRowMode(schedule, 'taxRate', 'flat'), schedule)
  assert.equal(applyRowMode(schedule, 'taxRate', 'fade'), schedule)
})

// --- Manual overrides survive ---------------------------------------------------------------------

test('manual overrides: a Custom row is never rewritten by another row s mode', () => {
  let schedule = years(4)
  schedule = setFlatValue(schedule, 'ebitMargin', '20')
  // The analyst hand-edits capex year by year, in Custom mode.
  schedule = schedule.map((y, i) => ({ ...y, capexPctOfRevenue: String(3 + i) }))
  // Another row's fade runs afterwards.
  schedule = setFadeEndpoint(setFlatValue(schedule, 'revenueGrowthRate', '8'), 'revenueGrowthRate', 'end', '2')

  assert.deepEqual(read(schedule, 'capexPctOfRevenue'), ['3', '4', '5', '6'])
  assert.deepEqual(read(schedule, 'ebitMargin'), ['20', '20', '20', '20'])
})

test('manual overrides: a Custom row survives a resize that regenerates the generated rows', () => {
  let schedule = years(4)
  schedule = setFlatValue(schedule, 'ebitMargin', '20')
  schedule = setFadeEndpoint(setFlatValue(schedule, 'revenueGrowthRate', '8'), 'revenueGrowthRate', 'end', '2')
  schedule = schedule.map((y, i) => ({ ...y, capexPctOfRevenue: String(3 + i) }))

  const modes = { ...defaultRowModes(), ebitMargin: 'flat', revenueGrowthRate: 'fade', capexPctOfRevenue: 'custom' }
  const grown = resizeDriverYearsWithModes(schedule, 6, modes)
  // The first four hand-typed capex years are exactly as they were; only the two new years
  // are filled, by the existing clone-the-last-year rule.
  assert.deepEqual(read(grown, 'capexPctOfRevenue'), ['3', '4', '5', '6', '6', '6'])
})

// --- Forecast-length changes ------------------------------------------------------------------------

test('resizeDriverYearsWithModes: a Fade row re-interpolates instead of plateauing when grown', () => {
  let schedule = setFlatValue(years(3), 'revenueGrowthRate', '8')
  schedule = setFadeEndpoint(schedule, 'revenueGrowthRate', 'end', '2')
  const modes = { ...defaultRowModes(), revenueGrowthRate: 'fade' }

  const grown = resizeDriverYearsWithModes(schedule, 5, modes)
  // Endpoints preserved, the whole line redrawn across five years - not '8','5','2','2','2'.
  assert.deepEqual(read(grown, 'revenueGrowthRate'), ['8', '6.5', '5', '3.5', '2'])
})

test('resizeDriverYearsWithModes: a Fade row keeps its target when the forecast is shortened', () => {
  let schedule = setFlatValue(years(6), 'revenueGrowthRate', '10')
  schedule = setFadeEndpoint(schedule, 'revenueGrowthRate', 'end', '0')
  const modes = { ...defaultRowModes(), revenueGrowthRate: 'fade' }

  const shrunk = resizeDriverYearsWithModes(schedule, 3, modes)
  assert.deepEqual(read(shrunk, 'revenueGrowthRate'), ['10', '5', '0'])
})

test('resizeDriverYearsWithModes: a Flat row stays flat across a resize in either direction', () => {
  const schedule = setFlatValue(years(3), 'taxRate', '24.55')
  const modes = { ...defaultRowModes(), taxRate: 'flat' }
  assert.deepEqual(read(resizeDriverYearsWithModes(schedule, 7, modes), 'taxRate'), Array(7).fill('24.55'))
  assert.deepEqual(read(resizeDriverYearsWithModes(schedule, 2, modes), 'taxRate'), ['24.55', '24.55'])
})

test('resizeDriverYearsWithModes: a Custom row keeps the existing clone-the-last-year behaviour', () => {
  const schedule = [
    { ...EMPTY_DRIVER_YEAR, taxRate: '20' },
    { ...EMPTY_DRIVER_YEAR, taxRate: '30' },
  ]
  assert.deepEqual(read(resizeDriverYearsWithModes(schedule, 4, defaultRowModes()), 'taxRate'), ['20', '30', '30', '30'])
})

test('resizeDriverYearsWithModes: growing from an empty schedule produces blank years, not guesses', () => {
  const grown = resizeDriverYearsWithModes([], 3, defaultRowModes())
  assert.equal(grown.length, 3)
  assert.deepEqual(grown[0], EMPTY_DRIVER_YEAR)
})

test('resizeDriverYearsWithModes: shrinking to zero years yields an empty schedule', () => {
  assert.deepEqual(resizeDriverYearsWithModes(setFlatValue(years(3), 'taxRate', '25'), 0, defaultRowModes()), [])
})

// --- Fiscal-year labels ------------------------------------------------------------------------------

test('forecastYearLabels: an August fiscal year-end labels forecasts FY+1 onward', () => {
  const result = forecastYearLabels(COSTCO_COMPANY_DATA, 3)
  assert.deepEqual(result.labels, ['FY2026E', 'FY2027E', 'FY2028E'])
  assert.equal(result.usesFiscalYears, true)
  assert.equal(result.basis, 'Fiscal years ending August')
})

test('forecastYearLabels: a December fiscal year-end is labelled by its own calendar year', () => {
  const result = forecastYearLabels({ periods: [{ fiscal_year_end: '2025-12-31' }] }, 2)
  assert.deepEqual(result.labels, ['FY2026E', 'FY2027E'])
})

test('forecastYearLabels: a January year-end falls back to generic labels rather than guessing', () => {
  // Two large retailers with near-identical January year-ends label the same fiscal year
  // differently from one another, so no fiscal-year label is inferred at all.
  const result = forecastYearLabels({ periods: [{ fiscal_year_end: '2025-01-31' }] }, 3)
  assert.deepEqual(result.labels, ['Year 1', 'Year 2', 'Year 3'])
  assert.equal(result.usesFiscalYears, false)
  assert.equal(result.basis, null)
})

test('forecastYearLabels: February through May year-ends also fall back', () => {
  for (const month of ['02', '03', '04', '05']) {
    const result = forecastYearLabels({ periods: [{ fiscal_year_end: `2025-${month}-28` }] }, 1)
    assert.deepEqual(result.labels, ['Year 1'], `month ${month} should not be labelled`)
  }
})

test('forecastYearLabels: a June year-end is unambiguous and is labelled', () => {
  assert.equal(forecastYearLabels({ periods: [{ fiscal_year_end: '2025-06-30' }] }, 1).labels[0], 'FY2026E')
})

test('forecastYearLabels: no company, no periods, or a malformed date all fall back safely', () => {
  assert.deepEqual(forecastYearLabels(null, 2).labels, ['Year 1', 'Year 2'])
  assert.deepEqual(forecastYearLabels({ periods: [] }, 2).labels, ['Year 1', 'Year 2'])
  assert.deepEqual(forecastYearLabels({ periods: [{ fiscal_year_end: 'August 2025' }] }, 2).labels, ['Year 1', 'Year 2'])
  assert.deepEqual(forecastYearLabels({ periods: [{ fiscal_year_end: null }] }, 1).labels, ['Year 1'])
})

test('forecastYearLabels: a zero-length forecast produces no labels', () => {
  assert.deepEqual(forecastYearLabels(COSTCO_COMPANY_DATA, 0).labels, [])
})

// --- Initialize Forecast -------------------------------------------------------------------------------

test('buildBaseForecast: seeds Costco s five usable drivers and refuses working capital', () => {
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const { driverYears, rowModes, seededFields, refusals } = buildBaseForecast(history, 5, formatSeedValue)

  assert.deepEqual(Object.keys(seededFields).sort(), [
    'capexPctOfRevenue',
    'daPctOfRevenue',
    'ebitMargin',
    'revenueGrowthRate',
    'taxRate',
  ])
  assert.equal(refusals.length, 1)
  assert.equal(refusals[0].field, 'nwcInvestmentPct')
  assert.match(refusals[0].note, /changes sign/)

  // Revenue growth initializes in Fade mode; everything else Flat.
  assert.equal(rowModes.revenueGrowthRate, 'fade')
  assert.equal(rowModes.ebitMargin, 'flat')
  assert.equal(rowModes.taxRate, 'flat')
  assert.equal(rowModes.daPctOfRevenue, 'flat')
  assert.equal(rowModes.capexPctOfRevenue, 'flat')

  assert.deepEqual(read(driverYears, 'ebitMargin'), Array(5).fill('3.43'))
  assert.deepEqual(read(driverYears, 'capexPctOfRevenue'), Array(5).fill('1.83'))
})

test('buildBaseForecast: the Fade default invents no terminal target - both endpoints are the history', () => {
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const { driverYears } = buildBaseForecast(history, 5, formatSeedValue)
  // Fade mode, but a flat line until the analyst sets their own target: the history contains
  // no terminal growth assumption, so none is fabricated.
  assert.deepEqual(read(driverYears, 'revenueGrowthRate'), Array(5).fill('7.46'))
})

test('buildBaseForecast: a refused driver is left completely blank, never zero-filled', () => {
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const { driverYears } = buildBaseForecast(history, 5, formatSeedValue)
  assert.deepEqual(read(driverYears, 'nwcInvestmentPct'), Array(5).fill(''))
})

test('buildBaseForecast: a refused driver still blocks Run Valuation through the existing guard', () => {
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const { driverYears } = buildBaseForecast(history, 3, formatSeedValue)
  const shared = { wacc: '9', terminalGrowthRate: '2.5', netDebt: '200', dilutedSharesOutstanding: '100' }
  const error = driverInputsError('275235000000', driverYears, shared)
  assert.ok(error)
  assert.match(error, /NWC Investment/)
  // And the payload builder refuses independently of any caller's pre-check.
  assert.throws(() => buildDriverPayload('275235000000', driverYears, shared), /incomplete/)
})

test('buildBaseForecast: with no company data nothing is seeded and every driver is refused', () => {
  const { driverYears, seededFields, refusals } = buildBaseForecast(driverHistory(null), 3, formatSeedValue)
  assert.deepEqual(seededFields, {})
  assert.equal(refusals.length, 6)
  assert.ok(driverYears.every((y) => Object.values(y).every((v) => v === '')))
})

test('buildBaseForecast: a seeded schedule builds a valid payload once the refused row is filled', () => {
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const { driverYears } = buildBaseForecast(history, 2, formatSeedValue)
  const completed = setFlatValue(driverYears, 'nwcInvestmentPct', '-3.26')
  const payload = buildDriverPayload('275235000000', completed, {
    wacc: '9',
    terminalGrowthRate: '2.5',
    netDebt: '200',
    dilutedSharesOutstanding: '100',
  })
  assert.equal(payload.driver_years.length, 2)
  assert.ok(Math.abs(payload.driver_years[0].ebit_margin - 0.0343) < 1e-12)
  assert.ok(Math.abs(payload.driver_years[0].nwc_investment_pct_of_revenue_change + 0.0326) < 1e-12)
})

test('buildBaseForecast: a hand-typed schedule and a seeded one produce identical payload shapes', () => {
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const { driverYears } = buildBaseForecast(history, 2, formatSeedValue)
  const seeded = setFlatValue(driverYears, 'nwcInvestmentPct', '-3.26')
  const typed = [
    { revenueGrowthRate: '7.46', ebitMargin: '3.43', taxRate: '24.55', daPctOfRevenue: '0.88', capexPctOfRevenue: '1.83', nwcInvestmentPct: '-3.26' },
    { revenueGrowthRate: '7.46', ebitMargin: '3.43', taxRate: '24.55', daPctOfRevenue: '0.88', capexPctOfRevenue: '1.83', nwcInvestmentPct: '-3.26' },
  ]
  const shared = { wacc: '9', terminalGrowthRate: '2.5', netDebt: '200', dilutedSharesOutstanding: '100' }
  assert.deepEqual(buildDriverPayload('1000', seeded, shared), buildDriverPayload('1000', typed, shared))
})

// --- Cross-company hygiene ------------------------------------------------------------------------------

test('shouldResetDriverSchedule: the same identified ticker preserves the schedule', () => {
  assert.equal(shouldResetDriverSchedule('COST', 'COST'), false)
  // Case and surrounding whitespace are not a company change.
  assert.equal(shouldResetDriverSchedule('COST', ' cost '), false)
  assert.equal(shouldResetDriverSchedule(' cost ', 'COST'), false)
})

test('shouldResetDriverSchedule: a different identified ticker resets the schedule', () => {
  assert.equal(shouldResetDriverSchedule('COST', 'AAPL'), true)
  assert.equal(shouldResetDriverSchedule('AAPL', 'COST'), true)
  assert.equal(shouldResetDriverSchedule('T', 'COST'), true)
})

test('shouldResetDriverSchedule: an unidentified current company always resets', () => {
  // Preserve only when the company on screen is POSITIVELY the same one. Two ordinary paths
  // leave a populated schedule with no company identified - a loaded scenario, and a failed
  // ticker lookup - and both previously survived into the next company.
  assert.equal(shouldResetDriverSchedule(null, 'COST'), true)
  assert.equal(shouldResetDriverSchedule(undefined, 'COST'), true)
  assert.equal(shouldResetDriverSchedule('', 'COST'), true)
  assert.equal(shouldResetDriverSchedule('   ', 'COST'), true)
})

test('shouldResetDriverSchedule: an unidentifiable incoming company also resets', () => {
  assert.equal(shouldResetDriverSchedule('COST', null), true)
  assert.equal(shouldResetDriverSchedule('COST', ''), true)
  assert.equal(shouldResetDriverSchedule(null, null), true)
})

test('cross-company reset: a loaded scenario s driver cells do not survive a ticker load', () => {
  // loadScenario restores driverForm but sets companyData to null, so the schedule sits in the
  // table with no company identified. The next successful load must clear it.
  const scenarioSchedule = [
    { revenueGrowthRate: '9', ebitMargin: '20', taxRate: '25', daPctOfRevenue: '4', capexPctOfRevenue: '5', nwcInvestmentPct: '10' },
    { revenueGrowthRate: '3', ebitMargin: '22', taxRate: '25', daPctOfRevenue: '4', capexPctOfRevenue: '6', nwcInvestmentPct: '12' },
  ]
  const loadedTicker = null // what companyData is after loadScenario

  assert.equal(shouldResetDriverSchedule(loadedTicker, 'COST'), true)
  const afterLoad = clearAllDriverRows(scenarioSchedule)
  assert.ok(
    afterLoad.every((y) => Object.values(y).every((v) => v === '')),
    'no scenario driver cell survives',
  )
  assert.equal(afterLoad.length, scenarioSchedule.length, 'the schedule keeps its length')
})

test('cross-company reset: an unidentified empty schedule resets harmlessly', () => {
  const empty = years(3)
  assert.equal(shouldResetDriverSchedule(null, 'COST'), true)
  const afterLoad = clearAllDriverRows(empty)
  assert.equal(afterLoad.length, 3)
  assert.ok(afterLoad.every((y) => Object.values(y).every((v) => v === '')))
})

test('cross-company reset: a failed lookup between two loads does not let the old schedule through', () => {
  // Sequence: COST loads and is seeded -> BADTICKER fails, which clears companyData but leaves
  // the schedule -> AAPL loads. The third step sees no identified company, so it resets.
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const seeded = buildBaseForecast(history, 3, formatSeedValue).driverYears
  assert.equal(seeded[0].ebitMargin, '3.43', 'Costco-derived value is in the schedule')

  const tickerAfterFailedLookup = null // companyData is cleared by the failed load
  assert.equal(shouldResetDriverSchedule(tickerAfterFailedLookup, 'AAPL'), true)

  const afterLoad = clearAllDriverRows(seeded)
  assert.ok(
    afterLoad.every((y) => Object.values(y).every((v) => v === '')),
    'no Costco-derived value reaches AAPL',
  )
})

test('clearAllDriverRows: blanks all six drivers in every year', () => {
  let schedule = setFlatValue(years(3), 'ebitMargin', '3.43')
  schedule = setFlatValue(schedule, 'capexPctOfRevenue', '1.83')
  schedule = setFlatValue(schedule, 'taxRate', '30')

  const cleared = clearAllDriverRows(schedule)
  assert.equal(cleared.length, 3)
  for (const year of cleared) {
    assert.deepEqual(year, EMPTY_DRIVER_YEAR)
  }
})

test('clearAllDriverRows: an empty schedule comes back unchanged', () => {
  const schedule = []
  assert.equal(clearAllDriverRows(schedule), schedule)
})

test('cross-company reset: a Fade row with a seeded start and an analyst target leaves nothing behind', () => {
  // This is the case per-row seed tracking could not handle. Revenue growth is seeded from
  // company A's history, then the analyst sets their own final-year target - which clears the
  // row's seed marker while Year 1 is still company A's median. A whole-schedule reset is what
  // guarantees that value cannot reappear under company B.
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const built = buildBaseForecast(history, 4, formatSeedValue)
  const edited = setFadeEndpoint(built.driverYears, 'revenueGrowthRate', 'end', '2.5')
  assert.equal(edited[0].revenueGrowthRate, '7.46', 'Year 1 is still the seeded historical median')

  const reset = clearAllDriverRows(edited)
  assert.ok(
    reset.every((y) => Object.values(y).every((v) => v === '')),
    'no cell from the previous company survives',
  )
})

// --- Scenario save/load compatibility ---------------------------------------------------------------------

test('normalizeRowModes: a scenario saved before modes existed loads every row as Custom', () => {
  const modes = normalizeRowModes(undefined)
  assert.deepEqual(modes, defaultRowModes())
  assert.ok(Object.values(modes).every((m) => m === 'custom'))
})

test('normalizeRowModes: saved modes are preserved, and unknown values fall back to Custom', () => {
  const modes = normalizeRowModes({ revenueGrowthRate: 'fade', ebitMargin: 'flat', taxRate: 'nonsense' })
  assert.equal(modes.revenueGrowthRate, 'fade')
  assert.equal(modes.ebitMargin, 'flat')
  assert.equal(modes.taxRate, 'custom')
  assert.equal(modes.capexPctOfRevenue, 'custom')
})

test('normalizeRowModes: a malformed saved value is not a crash', () => {
  assert.deepEqual(normalizeRowModes(null), defaultRowModes())
  assert.deepEqual(normalizeRowModes('fade'), defaultRowModes())
  assert.deepEqual(normalizeRowModes(42), defaultRowModes())
})

test('scenario round-trip: a saved driverForm reloads to the same schedule and modes', () => {
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const built = buildBaseForecast(history, 4, formatSeedValue)
  const saved = JSON.parse(
    JSON.stringify({
      baseYearRevenue: '275235000000',
      driverYears: built.driverYears,
      rowModes: built.rowModes,
      seededFields: built.seededFields,
    }),
  )
  assert.deepEqual(saved.driverYears, built.driverYears)
  assert.deepEqual(normalizeRowModes(saved.rowModes), built.rowModes)
  assert.deepEqual(saved.seededFields, built.seededFields)
})

test('scenario round-trip: a pre-modes scenario keeps its per-year values exactly', () => {
  // The values a legacy scenario carries may be anything at all, which is precisely why they
  // load as Custom - no mode generator gets to rewrite them.
  const legacy = [
    { revenueGrowthRate: '9', ebitMargin: '20', taxRate: '25', daPctOfRevenue: '4', capexPctOfRevenue: '5', nwcInvestmentPct: '10' },
    { revenueGrowthRate: '3', ebitMargin: '22', taxRate: '25', daPctOfRevenue: '4', capexPctOfRevenue: '6', nwcInvestmentPct: '12' },
  ]
  const modes = normalizeRowModes(undefined)
  const resized = resizeDriverYearsWithModes(legacy, 2, modes)
  assert.deepEqual(resized, legacy)
})

test('buildBaseForecast: a zero-length forecast seeds nothing rather than describing absent cells', () => {
  // Reachable in the real UI: a company loads before the analyst has set a Forecast Period,
  // so the plan is computed against an empty schedule.
  const history = driverHistory(COSTCO_COMPANY_DATA)
  const built = buildBaseForecast(history, 0, formatSeedValue)
  assert.deepEqual(built.driverYears, [])
  assert.deepEqual(built.seededFields, {})
  assert.deepEqual(built.refusals, [])
  assert.deepEqual(built.rowModes, defaultRowModes())
})
