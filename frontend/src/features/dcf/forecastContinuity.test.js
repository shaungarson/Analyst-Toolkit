import { test } from 'node:test'
import assert from 'node:assert/strict'

import { continuitySeries, forecastSeries, historicalSeries } from './forecastContinuity.js'

// Newest-first, as the API and the demo snapshot deliver them.
const PERIODS = [
  { fiscal_year_end: '2025-08-31', revenue: 275, unlevered_fcf: 6.4 },
  { fiscal_year_end: '2024-09-01', revenue: 254, unlevered_fcf: 5.9 },
  { fiscal_year_end: '2023-09-03', revenue: 242, unlevered_fcf: 4.1 },
]
const FORECAST = [
  { year: 1, revenue: 295, fcf: 7.0 },
  { year: 2, revenue: 314, fcf: 7.5 },
]
const LABELS = ['FY2026E', 'FY2027E']

// --- historicalSeries ---------------------------------------------------------------------

test('history is returned oldest-first, whatever order it arrives in', () => {
  const s = historicalSeries(PERIODS, 'revenue')
  assert.deepEqual(s.map((p) => p.label), ['FY23', 'FY24', 'FY25'])
  assert.deepEqual(s.map((p) => p.value), [242, 254, 275])
  assert.ok(s.every((p) => p.actual))
})

test('a period missing the metric is dropped, never carried as a zero', () => {
  const periods = [...PERIODS, { fiscal_year_end: '2022-08-28', revenue: 227, unlevered_fcf: null }]
  assert.equal(historicalSeries(periods, 'revenue').length, 4)
  assert.equal(historicalSeries(periods, 'unlevered_fcf').length, 3)
  assert.ok(!historicalSeries(periods, 'unlevered_fcf').some((p) => p.value === 0))
})

test('absent or malformed history yields nothing rather than throwing', () => {
  assert.deepEqual(historicalSeries(undefined, 'revenue'), [])
  assert.deepEqual(historicalSeries([{ revenue: 5 }], 'revenue'), [])
})

// --- forecastSeries -----------------------------------------------------------------------

test('forecast rows take the supplied fiscal-year labels', () => {
  const s = forecastSeries(FORECAST, 'fcf', LABELS)
  assert.deepEqual(s.map((p) => p.label), LABELS)
  assert.ok(s.every((p) => !p.actual))
})

test('forecast rows fall back to generic year labels when none are supplied', () => {
  assert.deepEqual(forecastSeries(FORECAST, 'fcf', undefined).map((p) => p.label), ['Year 1', 'Year 2'])
})

test('a metric a mode does not project becomes gaps, not zeros', () => {
  // Quick DCF's forecast rows carry no revenue at all.
  const s = forecastSeries([{ year: 1, fcf: 7 }], 'revenue', ['FY2026E'])
  assert.equal(s[0].value, null)
})

// --- continuitySeries ---------------------------------------------------------------------

test('one reported observation plus forecast is enough to draw a handoff', () => {
  // Deliberately below the two-period minimum HistoricalTrendCharts applies: that threshold
  // belongs to a historical *trend*, which needs two points to have one. A handoff needs only
  // a point to hand off from.
  const s = continuitySeries({
    periods: [PERIODS[0]],
    forecast: FORECAST,
    historicalKey: 'unlevered_fcf',
    forecastKey: 'fcf',
    labels: LABELS,
  })
  assert.notEqual(s, null)
  assert.equal(s.actualCount, 1)
  assert.equal(s.boundaryIndex, 1)
  assert.deepEqual(s.points.map((p) => p.label), ['FY25', 'FY2026E', 'FY2027E'])
})

test('the boundary sits between the last reported year and the first forecast year', () => {
  const s = continuitySeries({
    periods: PERIODS,
    forecast: FORECAST,
    historicalKey: 'revenue',
    forecastKey: 'revenue',
    labels: LABELS,
  })
  assert.equal(s.boundaryIndex, 3)
  assert.ok(s.points.slice(0, 3).every((p) => p.actual))
  assert.ok(s.points.slice(3).every((p) => !p.actual))
})

test('no reported observation means no handoff to draw', () => {
  assert.equal(
    continuitySeries({ periods: [], forecast: FORECAST, historicalKey: 'revenue', forecastKey: 'revenue', labels: LABELS }),
    null,
  )
  assert.equal(
    continuitySeries({ periods: undefined, forecast: FORECAST, historicalKey: 'revenue', forecastKey: 'revenue', labels: LABELS }),
    null,
  )
})

test('no usable forecast value means no handoff either', () => {
  // Quick mode against revenue: history exists, projection does not.
  assert.equal(
    continuitySeries({
      periods: PERIODS,
      forecast: [{ year: 1, fcf: 7 }],
      historicalKey: 'revenue',
      forecastKey: 'revenue',
      labels: ['FY2026E'],
    }),
    null,
  )
})

test('the two metrics gate independently of one another', () => {
  // Revenue reported for every period, unlevered FCF for none - revenue draws, UFCF does not.
  const periods = PERIODS.map((p) => ({ ...p, unlevered_fcf: null }))
  const shared = { periods, forecast: FORECAST, labels: LABELS }
  assert.notEqual(
    continuitySeries({ ...shared, historicalKey: 'revenue', forecastKey: 'revenue' }),
    null,
  )
  assert.equal(
    continuitySeries({ ...shared, historicalKey: 'unlevered_fcf', forecastKey: 'fcf' }),
    null,
  )
})

test('negative values are carried through rather than filtered as unusable', () => {
  const s = continuitySeries({
    periods: [{ fiscal_year_end: '2025-08-31', unlevered_fcf: -3.2 }],
    forecast: [{ year: 1, fcf: -1.1 }],
    historicalKey: 'unlevered_fcf',
    forecastKey: 'fcf',
    labels: ['FY2026E'],
  })
  assert.deepEqual(s.points.map((p) => p.value), [-3.2, -1.1])
})
