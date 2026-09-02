import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historicalCagr } from './historicalGrowth.js'

// Periods are newest-first, matching the real API/costcoDemo.js shape.
const COSTCO_LIKE_PERIODS = [
  { fiscal_year_end: '2025-08-31', unlevered_fcf: 6448333056, revenue: 275235000000 },
  { fiscal_year_end: '2024-09-01', unlevered_fcf: 4804853696, revenue: 254453000000 },
  { fiscal_year_end: '2023-09-03', unlevered_fcf: 5437000000, revenue: 242290000000 },
  { fiscal_year_end: '2022-08-28', unlevered_fcf: 2810000000, revenue: 226954000000 },
  { fiscal_year_end: '2021-08-29', unlevered_fcf: 4660000000, revenue: 195929000000 },
]

test('historicalCagr: uses actual elapsed fiscal-date span, not periods.length - 1', () => {
  const result = historicalCagr(COSTCO_LIKE_PERIODS, 'unlevered_fcf')
  // 2021-08-29 to 2025-08-31 is ~4.005 years, not exactly 4 - the point of using real dates.
  const expectedYears = (new Date('2025-08-31') - new Date('2021-08-29')) / (365.25 * 24 * 60 * 60 * 1000)
  const expectedCagr = (6448333056 / 4660000000) ** (1 / expectedYears) - 1
  assert.ok(Math.abs(result.cagr - expectedCagr) < 1e-9)
  assert.equal(result.oldestFiscalYearEnd, '2021-08-29')
  assert.equal(result.newestFiscalYearEnd, '2025-08-31')
})

test('historicalCagr: positive growth over a clean span returns a positive rate', () => {
  const result = historicalCagr(COSTCO_LIKE_PERIODS, 'revenue')
  assert.ok(result.cagr > 0 && result.cagr < 0.15)
})

test('historicalCagr: null when the newest endpoint is missing', () => {
  const periods = [{ fiscal_year_end: '2025-08-31', unlevered_fcf: null }, ...COSTCO_LIKE_PERIODS.slice(1)]
  assert.equal(historicalCagr(periods, 'unlevered_fcf'), null)
})

test('historicalCagr: null when the oldest endpoint is zero', () => {
  const periods = [...COSTCO_LIKE_PERIODS.slice(0, -1), { fiscal_year_end: '2021-08-29', unlevered_fcf: 0 }]
  assert.equal(historicalCagr(periods, 'unlevered_fcf'), null)
})

test('historicalCagr: null when the newest endpoint is negative', () => {
  const periods = [{ ...COSTCO_LIKE_PERIODS[0], unlevered_fcf: -1000 }, ...COSTCO_LIKE_PERIODS.slice(1)]
  assert.equal(historicalCagr(periods, 'unlevered_fcf'), null)
})

test('historicalCagr: an interior dip (Costco FY2022) does not disqualify the endpoint CAGR', () => {
  // FY2022's real dip (2.81B, well below neighboring years) sits in the middle of the
  // range, not at either endpoint - CAGR is endpoint-based by definition and must still
  // compute normally.
  const result = historicalCagr(COSTCO_LIKE_PERIODS, 'unlevered_fcf')
  assert.ok(result !== null)
})

test('historicalCagr: null with fewer than two periods', () => {
  assert.equal(historicalCagr([COSTCO_LIKE_PERIODS[0]], 'unlevered_fcf'), null)
  assert.equal(historicalCagr([], 'unlevered_fcf'), null)
  assert.equal(historicalCagr(null, 'unlevered_fcf'), null)
})

test('historicalCagr: a 2-period span computes a 1-ish-year CAGR, not multiplied by period count', () => {
  const twoPeriods = [COSTCO_LIKE_PERIODS[0], COSTCO_LIKE_PERIODS[1]]
  const result = historicalCagr(twoPeriods, 'unlevered_fcf')
  const expectedYears = (new Date('2025-08-31') - new Date('2024-09-01')) / (365.25 * 24 * 60 * 60 * 1000)
  const expectedCagr = (6448333056 / 4804853696) ** (1 / expectedYears) - 1
  assert.ok(Math.abs(result.cagr - expectedCagr) < 1e-9)
})
