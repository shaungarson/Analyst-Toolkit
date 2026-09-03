import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ENDPOINT_WARNING_LABELS,
  TORNADO_DRIVER_LABELS,
  barGeometry,
  formatWarningYears,
  summarizeTestedPath,
  tornadoScale,
} from './driverTornado.js'

const SHIFT = 0.01

// --- summarizeTestedPath ------------------------------------------------------------------

test('a flat row reports its single base value and both tested values', () => {
  const text = summarizeTestedPath([0.0343, 0.0343, 0.0343], SHIFT)
  assert.equal(text, 'Flat 3.43% · tested 2.43% and 4.43%')
})

test('a fading row reports its real path instead of one representative value', () => {
  const text = summarizeTestedPath([0.0746, 0.0622, 0.0498, 0.0374, 0.025], SHIFT)
  assert.equal(text, '7.46% → 2.50% over 5 years')
  // The point of the varying form: no single "base -> perturbed" pair is stated, because
  // no single base value exists for this row.
  assert.ok(!text.includes('tested'))
})

test('a rising row is summarized in its own direction', () => {
  assert.equal(summarizeTestedPath([0.02, 0.04, 0.06], SHIFT), '2.00% → 6.00% over 3 years')
})

test('a non-monotonic custom row reports a range rather than a trend it does not have', () => {
  const text = summarizeTestedPath([0.05, 0.09, 0.03, 0.07], SHIFT)
  assert.equal(text, 'Varies 3.00%–9.00% over 4 years')
})

test('a single-year schedule is treated as flat', () => {
  assert.equal(summarizeTestedPath([0.2], SHIFT), 'Flat 20.00% · tested 19.00% and 21.00%')
})

test('a negative flat driver is summarized without sign confusion', () => {
  // Costco's demo NWC assumption is negative; -3% ± 1pp is -4% and -2%.
  assert.equal(summarizeTestedPath([-0.03, -0.03], SHIFT), 'Flat -3.00% · tested -4.00% and -2.00%')
})

test('an empty or missing path produces no summary rather than throwing', () => {
  assert.equal(summarizeTestedPath([], SHIFT), '')
  assert.equal(summarizeTestedPath(undefined, SHIFT), '')
})

// --- tornadoScale -------------------------------------------------------------------------

test('the scale is the largest absolute delta across every row and both directions', () => {
  const rows = [
    { down_delta: -1.83, up_delta: 1.83 },
    { down_delta: -0.48, up_delta: 4.2 },
  ]
  assert.equal(tornadoScale(rows), 4.2)
})

test('the scale ignores uncomputable sides without discarding the row', () => {
  const rows = [
    { down_delta: -2.5, up_delta: null },
    { down_delta: null, up_delta: null },
  ]
  assert.equal(tornadoScale(rows), 2.5)
})

test('the scale is zero when nothing is computable', () => {
  assert.equal(tornadoScale([{ down_delta: null, up_delta: null }]), 0)
})

// --- barGeometry --------------------------------------------------------------------------

test('a positive delta extends right from the centre line', () => {
  const bar = barGeometry(5, 10)
  assert.deepEqual(bar, { leftPct: 50, widthPct: 25, direction: 'up' })
})

test('a negative delta extends left from the centre line', () => {
  const bar = barGeometry(-5, 10)
  assert.deepEqual(bar, { leftPct: 25, widthPct: 25, direction: 'down' })
})

test('the largest delta fills exactly half the track', () => {
  assert.equal(barGeometry(10, 10).widthPct, 50)
  assert.equal(barGeometry(-10, 10).leftPct, 0)
})

test('bar direction follows the delta sign, not which endpoint it came from', () => {
  // The same-side case the engine really produces: both endpoints of one driver move value
  // the same way, so both bars must point the same way rather than being forced apart.
  const down = barGeometry(-0.13, 0.13)
  const up = barGeometry(-0.13, 0.13)
  assert.equal(down.direction, 'down')
  assert.equal(up.direction, 'down')
})

test('an uncomputable side draws no bar', () => {
  assert.equal(barGeometry(null, 10), null)
  assert.equal(barGeometry(undefined, 10), null)
})

test('a delta of exactly zero draws no bar, distinct from a small one', () => {
  assert.equal(barGeometry(0, 10), null)
  assert.notEqual(barGeometry(0.001, 10), null)
})

test('a very small non-zero delta still renders a visible bar', () => {
  const bar = barGeometry(0.0001, 1000)
  assert.ok(bar.widthPct >= 0.6)
})

test('a degenerate scale draws no bars rather than dividing by zero', () => {
  assert.equal(barGeometry(0, 0), null)
  assert.equal(barGeometry(5, 0), null)
})

// --- formatWarningYears ---------------------------------------------------------------

test('a single affected year reads as one year, not a range', () => {
  assert.equal(formatWarningYears([2]), 'yr 2')
})

test('a flat driver row affecting every year collapses to one range', () => {
  // The common case: a flat driver trips its warning in all five forecast years at once.
  assert.equal(formatWarningYears([1, 2, 3, 4, 5]), 'yrs 1-5')
})

test('non-contiguous affected years are listed rather than implied as a range', () => {
  assert.equal(formatWarningYears([1, 3, 5]), 'yrs 1, 3, 5')
})

test('year zero reads as the base year, never as year zero', () => {
  assert.equal(formatWarningYears([0]), 'base year')
  assert.equal(formatWarningYears([0, 2]), 'yrs base year, 2')
})

test('an empty or missing year list produces no text rather than throwing', () => {
  assert.equal(formatWarningYears([]), '')
  assert.equal(formatWarningYears(undefined), '')
})

test('every warning id the backend can emit has a short label', () => {
  const ids = [
    'non_positive_base_year_revenue',
    'tax_rate_outside_0_100_percent',
    'negative_da_percent',
    'negative_capex_percent',
    'zero_revenue_lock',
    'negative_revenue',
    'non_positive_terminal_year_fcf',
  ]
  for (const id of ids) assert.ok(ENDPOINT_WARNING_LABELS[id], `missing label for ${id}`)
})

// --- driver labels ----------------------------------------------------------------------

test('every backend driver key has a label', () => {
  const keys = [
    'revenue_growth_rate',
    'ebit_margin',
    'tax_rate',
    'da_pct_of_revenue',
    'capex_pct_of_revenue',
    'nwc_investment_pct_of_revenue_change',
  ]
  for (const key of keys) assert.ok(TORNADO_DRIVER_LABELS[key], `missing label for ${key}`)
})
