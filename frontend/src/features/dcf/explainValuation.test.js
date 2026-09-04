import { test } from 'node:test'
import assert from 'node:assert/strict'
import { explainValuation } from './explainValuation.js'

const RESULTS = {
  enterprise_value: 100_000_000,
  pv_terminal_value: 82_000_000,
  equity_value: 95_000_000,
  value_per_share: 41.2,
}

const SENSITIVITY = {
  terminal_growth_rates: [0.02, 0.025, 0.03],
  rows: [
    { wacc: 0.07, value_per_share_by_growth: [30.0, 35.0, null] },
    { wacc: 0.075, value_per_share_by_growth: [28.4, 41.2, 55.0] },
    { wacc: 0.08, value_per_share_by_growth: [null, 40.0, 61.9] },
  ],
}

const REVERSE_SOLVED = {
  status: 'solved',
  implied_fcf_growth_rate: 0.307,
  reconciled_value_per_share: 943.88,
  floor_value_per_share: -50,
}

const HISTORICAL_CAGR = {
  cagr: 0.091,
  oldestFiscalYearEnd: '2021-08-29',
  newestFiscalYearEnd: '2025-08-31',
}

const FULL_INPUT = {
  showActiveResults: true,
  activeResults: RESULTS,
  activeSensitivity: SENSITIVITY,
  showReverseResult: true,
  reverseResult: REVERSE_SOLVED,
  historicalFcfCagr: HISTORICAL_CAGR,
  fcfGrowthRate: '8',
  forecastYears: '5',
}

test('full data: returns all three observations', () => {
  const obs = explainValuation(FULL_INPUT)
  assert.equal(obs.length, 3)
  assert.deepEqual(
    obs.map((o) => o.id),
    ['price-implied-growth-gap', 'terminal-value-share', 'sensitivity-range']
  )
})

test('diagnostic 1: reports exact percentage-point gaps, no qualitative bands', () => {
  const obs = explainValuation(FULL_INPUT)
  const text = obs[0].text
  assert.match(text, /30\.7%\/yr/)
  // 30.7 - 8.0 = 22.7pp above the analyst case
  assert.match(text, /22\.7 percentage points above the 8\.0%\/yr case/)
  // 30.7 - 9.1 = 21.6pp above historical
  assert.match(text, /21\.6 percentage points above the FY2021–FY2025 historical UFCF CAGR \(9\.1%\/yr\)/)
  assert.doesNotMatch(text, /material|moderate|roughly|somewhat/i)
})

test('diagnostic 1: below case/historical reports "below", not a signed number', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    reverseResult: { ...REVERSE_SOLVED, implied_fcf_growth_rate: 0.02 },
  })
  assert.match(obs[0].text, /below the 8\.0%\/yr case/)
  assert.match(obs[0].text, /below the .* historical UFCF CAGR/)
})

test('diagnostic 1: exact equality with the analyst case reports a match, not "above"/"below"', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    reverseResult: { ...REVERSE_SOLVED, implied_fcf_growth_rate: 0.08 }, // exactly 8.0%, == fcfGrowthRate
  })
  const text = obs[0].text
  assert.match(text, /matches the 8\.0%\/yr case to displayed precision/)
  assert.doesNotMatch(text, /8\.0%\/yr case (above|below)/)
  // Historical clause is unaffected - still a real gap (8.0 vs 9.1).
  assert.match(text, /below the FY2021–FY2025 historical UFCF CAGR/)
})

test('diagnostic 1: exact equality with historical CAGR reports a match, not "above"/"below"', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    reverseResult: { ...REVERSE_SOLVED, implied_fcf_growth_rate: 0.091 }, // exactly 9.1%, == historical CAGR
  })
  const text = obs[0].text
  assert.match(text, /matches the FY2021–FY2025 historical UFCF CAGR \(9\.1%\/yr\) to displayed precision/)
  assert.doesNotMatch(text, /historical UFCF CAGR \(9\.1%\/yr\) (above|below)/)
  // Analyst-case clause is unaffected - still a real gap (9.1 vs 8.0).
  assert.match(text, /above the 8\.0%\/yr case/)
})

test('diagnostic 1: a difference that only rounds to 0.0 (not exactly zero) still reports a match', () => {
  // impliedPct = 8.04, analystPct = 8.0 -> diff = 0.04, which displays as "0.0" at one
  // decimal - the wording must follow what's actually displayed, not the unrounded diff.
  const obsAbove = explainValuation({
    ...FULL_INPUT,
    reverseResult: { ...REVERSE_SOLVED, implied_fcf_growth_rate: 0.0804 },
  })
  assert.match(obsAbove[0].text, /matches the 8\.0%\/yr case to displayed precision/)

  // Same rounding boundary from the other side: impliedPct = 7.96 -> diff = -0.04.
  const obsBelow = explainValuation({
    ...FULL_INPUT,
    reverseResult: { ...REVERSE_SOLVED, implied_fcf_growth_rate: 0.0796 },
  })
  assert.match(obsBelow[0].text, /matches the 8\.0%\/yr case to displayed precision/)
})

test('diagnostic 1: missing historical CAGR drops that clause, keeps analyst-case comparison', () => {
  const obs = explainValuation({ ...FULL_INPUT, historicalFcfCagr: null })
  assert.equal(obs.length, 3)
  assert.match(obs[0].text, /8\.0%\/yr case/)
  assert.doesNotMatch(obs[0].text, /historical/)
})

test('diagnostic 1: missing analyst case (blank field) keeps historical comparison only', () => {
  const obs = explainValuation({ ...FULL_INPUT, fcfGrowthRate: '' })
  assert.equal(obs.length, 3)
  assert.doesNotMatch(obs[0].text, /case/)
  assert.match(obs[0].text, /historical UFCF CAGR/)
})

test('diagnostic 1: omitted entirely when both comparisons are unavailable', () => {
  const obs = explainValuation({ ...FULL_INPUT, historicalFcfCagr: null, fcfGrowthRate: '' })
  assert.equal(obs.find((o) => o.id === 'price-implied-growth-gap'), undefined)
  assert.equal(obs.length, 2)
})

test('diagnostic 1: an unreliable historical CAGR is not used as a benchmark', () => {
  // Coca-Cola's UFCF CAGR reads -42.4%/yr because FY2025 absorbed $9.27B of working capital.
  // Citing price-implied growth as "130 percentage points above" that presents a
  // working-capital artifact as the analytical anchor. The analyst's own case does not depend
  // on working-capital history, so only the historical clause is withheld.
  const obs = explainValuation({ ...FULL_INPUT, historicalFcfCagrUnreliable: true })

  assert.equal(obs.length, 3)
  assert.match(obs[0].text, /8\.0%\/yr case/)
  assert.doesNotMatch(obs[0].text, /historical/)
})

test('diagnostic 1: omitted entirely when the unreliable CAGR was the only comparison', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    historicalFcfCagrUnreliable: true,
    fcfGrowthRate: '',
  })
  assert.equal(obs.find((o) => o.id === 'price-implied-growth-gap'), undefined)
  assert.equal(obs.length, 2)
})

test('diagnostic 1: a reliable historical CAGR is still used, so the flag is not always-on', () => {
  const obs = explainValuation({ ...FULL_INPUT, historicalFcfCagrUnreliable: false })
  assert.match(obs[0].text, /historical UFCF CAGR/)
})

test('diagnostic 1: omitted when reverse status is target_below_floor', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    reverseResult: { status: 'target_below_floor', implied_fcf_growth_rate: null, reconciled_value_per_share: null, floor_value_per_share: -50 },
  })
  assert.equal(obs.find((o) => o.id === 'price-implied-growth-gap'), undefined)
})

test('diagnostic 1: omitted when reverse status is not_bracketed', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    reverseResult: { status: 'not_bracketed', implied_fcf_growth_rate: null, reconciled_value_per_share: null, floor_value_per_share: -50 },
  })
  assert.equal(obs.find((o) => o.id === 'price-implied-growth-gap'), undefined)
})

test('diagnostic 1: omitted when showReverseResult is false (stale, loading, or no result)', () => {
  const obs = explainValuation({ ...FULL_INPUT, showReverseResult: false })
  assert.equal(obs.find((o) => o.id === 'price-implied-growth-gap'), undefined)
  // Independent invalidation: forward-dependent diagnostics are unaffected.
  assert.equal(obs.length, 2)
  assert.ok(obs.find((o) => o.id === 'terminal-value-share'))
  assert.ok(obs.find((o) => o.id === 'sensitivity-range'))
})

test('diagnostic 2: states both contributions, no sensitivity claim', () => {
  const obs = explainValuation(FULL_INPUT)
  const text = obs.find((o) => o.id === 'terminal-value-share').text
  assert.match(text, /Terminal value contributes 82% of enterprise value/)
  assert.match(text, /explicit 5-year forecast period contributes 18%/)
  assert.doesNotMatch(text, /sensitiv/i)
  // "The remaining X%" is false as soon as a contribution goes negative, so the wording is
  // symmetrical across the whole sign range instead.
  assert.doesNotMatch(text, /remaining/i)
})

test('diagnostic 2: explicit-period length is read from forecastYears, not hardcoded', () => {
  const obs = explainValuation({ ...FULL_INPUT, forecastYears: '7' })
  assert.match(obs.find((o) => o.id === 'terminal-value-share').text, /7-year forecast period/)
})

test('diagnostic 2: omitted when enterprise_value is zero', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    activeResults: { ...RESULTS, enterprise_value: 0 },
  })
  assert.equal(obs.find((o) => o.id === 'terminal-value-share'), undefined)
})

test('diagnostic 2: omitted when enterprise_value is negative', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    activeResults: { ...RESULTS, enterprise_value: -5_000_000 },
  })
  assert.equal(obs.find((o) => o.id === 'terminal-value-share'), undefined)
})

test('diagnostic 2: omitted when enterprise_value is non-finite', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    activeResults: { ...RESULTS, enterprise_value: Infinity },
  })
  assert.equal(obs.find((o) => o.id === 'terminal-value-share'), undefined)
})

test('diagnostic 2: reports a negative terminal contribution rather than suppressing it', () => {
  // pv_terminal_value below zero against a positive enterprise value: real, and previously
  // hidden. -1M / 100M = -1%, leaving the explicit period contributing 101%.
  const obs = explainValuation({
    ...FULL_INPUT,
    activeResults: { ...RESULTS, pv_terminal_value: -1_000_000 },
  })
  const text = obs.find((o) => o.id === 'terminal-value-share').text
  assert.match(text, /Terminal value contributes -1% of enterprise value/)
  assert.match(text, /contributes 101%/)
})

test('diagnostic 2: reports a contribution above 100% rather than suppressing it', () => {
  // Negative explicit-period PV: enterprise_value = pv_fcfs + pv_terminal_value, so a
  // sufficiently negative pv_fcfs makes pv_terminal_value exceed enterprise_value. This is
  // the reinvestment-heavy case an ordinary-looking forecast reaches, and it is exactly the
  // finding the composition chart exists to surface - so it is stated, not hidden.
  const obs = explainValuation({
    ...FULL_INPUT,
    activeResults: { ...RESULTS, enterprise_value: 50_000_000, pv_terminal_value: 59_000_000 },
  })
  const text = obs.find((o) => o.id === 'terminal-value-share').text
  assert.match(text, /Terminal value contributes 118% of enterprise value/)
  assert.match(text, /contributes -18%/)
})

test('diagnostic 2: the two contributions always sum to 100% of enterprise value', () => {
  // Derived from enterprise_value - pv_terminal_value rather than from the forecast rows,
  // which the backend rounds independently of enterprise_value.
  for (const [ev, pvTv] of [[100_000_000, 82_000_000], [50_000_000, 59_000_000], [100_000_000, -1_000_000]]) {
    const obs = explainValuation({
      ...FULL_INPUT,
      activeResults: { ...RESULTS, enterprise_value: ev, pv_terminal_value: pvTv },
    })
    const text = obs.find((o) => o.id === 'terminal-value-share').text
    const pcts = [...text.matchAll(/(-?\d+)%/g)].map((m) => Number(m[1]))
    assert.equal(pcts.length, 2)
    assert.equal(pcts[0] + pcts[1], 100)
  }
})

test('diagnostic 3: reports downside/upside in dollars and percent, relative to base', () => {
  const obs = explainValuation(FULL_INPUT)
  const text = obs.find((o) => o.id === 'sensitivity-range').text
  assert.match(text, /\$41\.20/) // base
  assert.match(text, /\$28\.40/) // grid min
  assert.match(text, /\$61\.90/) // grid max
  // downside = 41.20 - 28.40 = 12.80; 12.80 / 41.20 = 31.07% -> 31%
  assert.match(text, /\$12\.80 \/ 31% downside/)
  // upside = 61.90 - 41.20 = 20.70; 20.70 / 41.20 = 50.24% -> 50%
  assert.match(text, /\$20\.70 \/ 50% upside/)
  assert.doesNotMatch(text, /highly sensitive|low sensitivity/i)
})

test('diagnostic 3: filters null cells before computing the range', () => {
  const obs = explainValuation(FULL_INPUT)
  const text = obs.find((o) => o.id === 'sensitivity-range').text
  // 30.0 and 35.0 are real cells lower than 28.4 would need to beat - confirms nulls don't
  // become NaN/0 and corrupt the min/max.
  assert.doesNotMatch(text, /NaN/)
})

test('diagnostic 3: omitted when every grid cell is null', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    activeSensitivity: {
      terminal_growth_rates: [0.02, 0.025, 0.03],
      rows: [{ wacc: 0.07, value_per_share_by_growth: [null, null, null] }],
    },
  })
  assert.equal(obs.find((o) => o.id === 'sensitivity-range'), undefined)
})

test('diagnostic 3: omitted when activeSensitivity is null', () => {
  const obs = explainValuation({ ...FULL_INPUT, activeSensitivity: null })
  assert.equal(obs.find((o) => o.id === 'sensitivity-range'), undefined)
})

test('diagnostic 3: non-positive base value per share drops percent, keeps dollar figures', () => {
  const obs = explainValuation({
    ...FULL_INPUT,
    activeResults: { ...RESULTS, value_per_share: 0 },
  })
  const text = obs.find((o) => o.id === 'sensitivity-range').text
  assert.match(text, /\$28\.40 to \$61\.90/)
  assert.match(text, /isn't a usable positive reference/)
  assert.doesNotMatch(text, /%/)
})

test('showActiveResults false: diagnostics 2 and 3 omitted, diagnostic 1 unaffected', () => {
  const obs = explainValuation({ ...FULL_INPUT, showActiveResults: false })
  assert.equal(obs.length, 1)
  assert.equal(obs[0].id, 'price-implied-growth-gap')
})

test('everything unavailable: returns an empty array', () => {
  const obs = explainValuation({
    showActiveResults: false,
    activeResults: null,
    activeSensitivity: null,
    showReverseResult: false,
    reverseResult: null,
    historicalFcfCagr: null,
    fcfGrowthRate: '',
    forecastYears: '',
  })
  assert.deepEqual(obs, [])
})

// --- Driver-Based DCF: no new branching in explainValuation itself ------------------------
//
// Driver mode never populates a reverse result (Reverse DCF is Quick-only), so it always
// calls this with showReverseResult: false / reverseResult: null - exactly the shape below.
// DriverDCFResults shares enterprise_value/pv_terminal_value/equity_value/value_per_share
// with DCFResults, and driver_dcf_sensitivity returns the same {terminal_growth_rates, rows}
// shape as dcf_sensitivity, so diagnostics 2 and 3 need no Driver-specific code path here at
// all - this test is the proof of that design claim, not just a demonstration.

test('driver mode shape: diagnostics 2 and 3 present, diagnostic 1 never appears without a reverse result', () => {
  const obs = explainValuation({
    showActiveResults: true,
    activeResults: RESULTS,
    activeSensitivity: SENSITIVITY,
    showReverseResult: false,
    reverseResult: null,
    historicalFcfCagr: null,
    fcfGrowthRate: '', // blank in Driver mode - Quick-only field
    forecastYears: '5',
  })
  assert.deepEqual(
    obs.map((o) => o.id),
    ['terminal-value-share', 'sensitivity-range'],
  )
})
