import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  annualPresentValues,
  contributionGeometry,
  valueContribution,
} from './valueComposition.js'

const results = (over = {}) => ({
  enterprise_value: 100_000_000,
  pv_terminal_value: 82_000_000,
  forecast: [
    { year: 1, fcf: 5_000_000, present_value: 4_600_000 },
    { year: 2, fcf: 5_400_000, present_value: 4_500_000 },
    { year: 3, fcf: 5_800_000, present_value: 4_400_000 },
  ],
  ...over,
})

// --- the rule -----------------------------------------------------------------------------

test('an ordinary positive case reports both contributions', () => {
  const c = valueContribution(results())
  assert.equal(c.reportable, true)
  assert.equal(c.terminalPct, 82)
  assert.equal(c.explicitPct, 18)
  assert.equal(c.explicitValue, 18_000_000)
})

test('a contribution above 100% is reported, not suppressed', () => {
  // Negative explicit-period PV: terminal value genuinely exceeds a smaller enterprise value.
  const c = valueContribution(results({ enterprise_value: 50_000_000, pv_terminal_value: 59_000_000 }))
  assert.equal(c.reportable, true)
  assert.equal(c.terminalPct, 118)
  assert.equal(c.explicitPct, -18)
  assert.equal(c.explicitValue, -9_000_000)
})

test('a contribution below 0% is reported, not suppressed', () => {
  const c = valueContribution(results({ pv_terminal_value: -1_000_000 }))
  assert.equal(c.reportable, true)
  assert.equal(c.terminalPct, -1)
  assert.equal(c.explicitPct, 101)
})

test('the two contributions always sum to exactly 100%', () => {
  for (const [ev, pvTv] of [
    [100_000_000, 82_000_000],
    [50_000_000, 59_000_000],
    [100_000_000, -1_000_000],
    [7, 3],
  ]) {
    const c = valueContribution(results({ enterprise_value: ev, pv_terminal_value: pvTv }))
    assert.ok(Math.abs(c.terminalPct + c.explicitPct - 100) < 1e-9)
  }
})

test('the explicit aggregate comes from EV minus PV(TV), not from summing the rounded rows', () => {
  // Rows deliberately do not sum to EV - PV(TV): the backend rounds each row's present_value
  // and enterprise_value independently, so only the subtraction reconciles exactly.
  const c = valueContribution(
    results({
      enterprise_value: 100_000_000,
      pv_terminal_value: 82_000_000,
      forecast: [{ year: 1, fcf: 1, present_value: 12_345 }],
    }),
  )
  assert.equal(c.explicitValue, 18_000_000)
  assert.notEqual(c.explicitValue, 12_345)
})

test('no percentage is claimed against a zero, negative or non-finite enterprise value', () => {
  for (const ev of [0, -5_000_000, Infinity, NaN]) {
    const c = valueContribution(results({ enterprise_value: ev }))
    if (c === null) continue
    assert.equal(c.reportable, false)
    assert.equal(c.terminalPct, null)
    assert.equal(c.explicitPct, null)
  }
})

test('a non-finite terminal value yields nothing at all rather than a partial claim', () => {
  assert.equal(valueContribution(results({ pv_terminal_value: NaN })), null)
  assert.equal(valueContribution(null), null)
})

test('the dollar components survive even where no percentage may be claimed', () => {
  const c = valueContribution(results({ enterprise_value: -5_000_000 }))
  assert.equal(c.reportable, false)
  assert.equal(c.enterpriseValue, -5_000_000)
  assert.equal(c.terminalValue, 82_000_000)
  assert.equal(c.explicitValue, -87_000_000)
})

// --- geometry -----------------------------------------------------------------------------

test('an ordinary case spans exactly 0 to 100 with the zero line at the left edge', () => {
  const g = contributionGeometry(valueContribution(results()))
  assert.equal(g.axisMin, 0)
  assert.equal(g.axisMax, 100)
  assert.equal(g.zeroPct, 0)
  const explicit = g.parts.find((p) => p.key === 'explicit')
  assert.equal(explicit.leftPct, 0)
  assert.equal(explicit.widthPct, 18)
  assert.equal(explicit.negative, false)
})

test('a mixed-sign case extends the axis rather than clamping to a 100% stack', () => {
  const g = contributionGeometry(
    valueContribution(results({ enterprise_value: 50_000_000, pv_terminal_value: 59_000_000 })),
  )
  // Axis runs -18..118, so neither part is clipped and neither is rescaled to fit 0..100.
  assert.equal(g.axisMin, -18)
  assert.equal(g.axisMax, 118)
  const explicit = g.parts.find((p) => p.key === 'explicit')
  const terminal = g.parts.find((p) => p.key === 'terminal')
  assert.equal(explicit.negative, true)
  // The negative part starts left of the zero line and runs up to it.
  assert.ok(explicit.leftPct < g.zeroPct)
  assert.ok(Math.abs(explicit.leftPct + explicit.widthPct - g.zeroPct) < 1e-9)
  // The positive part starts at the zero line.
  assert.ok(Math.abs(terminal.leftPct - g.zeroPct) < 1e-9)
  // 118 of a 136-wide axis.
  assert.ok(Math.abs(terminal.widthPct - (118 / 136) * 100) < 1e-9)
})

test('geometry is withheld wherever the rule withholds a percentage', () => {
  assert.equal(contributionGeometry(valueContribution(results({ enterprise_value: 0 }))), null)
  assert.equal(contributionGeometry(null), null)
})

// --- annual rows --------------------------------------------------------------------------

test('annual rows are passed through as reported, never re-derived', () => {
  const rows = annualPresentValues(results())
  assert.deepEqual(
    rows.map((r) => [r.year, r.presentValue]),
    [[1, 4_600_000], [2, 4_500_000], [3, 4_400_000]],
  )
})

test('a non-finite present value becomes a gap, never a zero', () => {
  const rows = annualPresentValues(results({ forecast: [{ year: 1, fcf: 1, present_value: NaN }] }))
  assert.equal(rows[0].presentValue, null)
})

test('a missing forecast yields no rows rather than throwing', () => {
  assert.deepEqual(annualPresentValues({}), [])
  assert.deepEqual(annualPresentValues(null), [])
})
