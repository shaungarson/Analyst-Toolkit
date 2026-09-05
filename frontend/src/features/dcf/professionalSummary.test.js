import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  driverPathSummaries,
  driverPathSummary,
  materialWarnings,
  provenanceSummary,
  referenceComparison,
  sensitivityRange,
} from './professionalSummary.js'

// --- warnings: every material one survives, most severe first ------------------------------

test('warnings from all three lists are collected, never dropped', () => {
  const out = materialWarnings({
    terminal_growth_warnings: [{ id: 'narrow_wacc_terminal_growth_spread', tier: 'high', explanation: 'a' }],
    driver_warnings: [
      { id: 'negative_da_percent', tier: 'caution', explanation: 'b', year: 3 },
      { id: 'negative_revenue', tier: 'extreme', explanation: 'c', year: 5 },
    ],
  })

  assert.equal(out.length, 3)
  assert.deepEqual(out.map((w) => w.tier), ['extreme', 'high', 'caution'])
  // The forecast year is passed through untouched for the ones that carry it.
  assert.equal(out.find((w) => w.id === 'negative_revenue').year, 5)
  assert.equal(out.find((w) => w.id === 'narrow_wacc_terminal_growth_spread').year, null)
})

test('Quick and Driver warning lists are both honoured by the same call', () => {
  const quick = materialWarnings({ fcf_growth_warnings: [{ id: 'zero_explicit_period_fcf', tier: 'caution', explanation: 'q' }] })
  const driver = materialWarnings({ driver_warnings: [{ id: 'zero_revenue_lock', tier: 'caution', explanation: 'd', year: 1 }] })

  assert.equal(quick.length, 1)
  assert.equal(driver.length, 1)
})

test('a run with no warnings returns an empty list rather than null', () => {
  assert.deepEqual(materialWarnings({ terminal_growth_warnings: [], driver_warnings: [] }), [])
  assert.deepEqual(materialWarnings(null), [])
})

test('warnings are never capped, however many a run produces', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    id: 'negative_da_percent', tier: 'caution', explanation: `y${i}`, year: i + 1,
  }))
  assert.equal(materialWarnings({ driver_warnings: many }).length, 25)
})

// --- sensitivity: valid cells only, and it is a tested range -------------------------------

const GRID = {
  terminal_growth_rates: [0.015, 0.02, 0.025],
  rows: [
    { wacc: 0.075, value_per_share_by_growth: [10, 12, 15] },
    { wacc: 0.085, value_per_share_by_growth: [8, 9, 11] },
    // WACC at or below terminal growth is outside Gordon Growth's valid range.
    { wacc: 0.02, value_per_share_by_growth: [7, null, null] },
  ],
}

test('the range spans valid cells only and names the corners that produced it', () => {
  const range = sensitivityRange(GRID)

  assert.equal(range.low.valuePerShare, 7)
  assert.equal(range.low.wacc, 0.02)
  assert.equal(range.low.terminalGrowth, 0.015)
  assert.equal(range.high.valuePerShare, 15)
  assert.equal(range.high.terminalGrowth, 0.025)
  assert.equal(range.validCells, 7, 'the two null cells must not be counted')
})

test('a grid with no valid cell yields no range rather than a bound the model never produced', () => {
  assert.equal(
    sensitivityRange({ terminal_growth_rates: [0.02], rows: [{ wacc: 0.01, value_per_share_by_growth: [null] }] }),
    null
  )
  assert.equal(sensitivityRange(null), null)
  assert.equal(sensitivityRange({}), null)
})

test('non-finite cells are treated as invalid, not as extremes', () => {
  const range = sensitivityRange({
    terminal_growth_rates: [0.02, 0.025],
    rows: [{ wacc: 0.08, value_per_share_by_growth: [Infinity, 12] }],
  })
  assert.equal(range.validCells, 1)
  assert.equal(range.low.valuePerShare, 12)
  assert.equal(range.high.valuePerShare, 12)
})

// --- driver paths: truthful, including the interior of a Custom row ------------------------

const years = (values) => values.map((v) => ({ revenueGrowthRate: String(v) }))

test('a row whose every year is equal reads as flat', () => {
  const path = driverPathSummary(years([4.5, 4.5, 4.5]), 'revenueGrowthRate', 'flat')

  assert.equal(path.shape, 'flat')
  assert.equal(path.start, 4.5)
  assert.equal(path.min, 4.5)
  assert.equal(path.max, 4.5)
})

test('a custom row reports start, end AND range, so an interior peak cannot hide', () => {
  // The case the range exists for: endpoints alone would report "8% to 2%" and conceal a
  // 14% year in the middle entirely.
  const path = driverPathSummary(years([8, 14, 6, 2]), 'revenueGrowthRate', 'custom')

  assert.equal(path.shape, 'path')
  assert.equal(path.start, 8)
  assert.equal(path.end, 2)
  assert.equal(path.min, 2)
  assert.equal(path.max, 14, 'the interior maximum must be reported')
  assert.equal(path.years, 4)
})

test('the description is derived from actual values, not from the row mode label', () => {
  // A row labelled 'flat' whose cells are not in fact flat must not be described as flat.
  const path = driverPathSummary(years([3, 5, 7]), 'revenueGrowthRate', 'flat')

  assert.equal(path.shape, 'path')
  assert.equal(path.mode, 'flat')
  assert.equal(path.max, 7)
})

test('an incomplete row is summarised as nothing rather than as a partial path', () => {
  assert.equal(driverPathSummary(years([4, '', 6]), 'revenueGrowthRate', 'custom'), null)
  assert.equal(driverPathSummary([], 'revenueGrowthRate', 'flat'), null)
  assert.equal(driverPathSummary(null, 'revenueGrowthRate', 'flat'), null)
})

test('all six drivers are summarised, and each carries its display label', () => {
  const driverYears = [
    { revenueGrowthRate: '5', ebitMargin: '20', taxRate: '25', daPctOfRevenue: '4', capexPctOfRevenue: '6', nwcInvestmentPct: '-3' },
    { revenueGrowthRate: '4', ebitMargin: '20', taxRate: '25', daPctOfRevenue: '4', capexPctOfRevenue: '6', nwcInvestmentPct: '-3' },
  ]
  const paths = driverPathSummaries(driverYears, { revenueGrowthRate: 'fade' })

  assert.equal(paths.length, 6)
  assert.equal(paths[0].label, 'Revenue Growth')
  assert.equal(paths.find((p) => p.field === 'nwcInvestmentPct').label, 'NWC Investment (% of Δ Revenue)')
  // A negative driver is summarised as readily as a positive one.
  assert.equal(paths.find((p) => p.field === 'nwcInvestmentPct').start, -3)
})

// --- provenance: a count that survives separation from the Sources inspector ----------------

test('provenance is summarised as counts by status, with the filing period', () => {
  const summary = provenanceSummary({
    profile: { sec_filings_url: 'https://example.invalid/filings' },
    source: { fundamentals_provider: 'sec_edgar', market_data_provider: null },
    periods: [
      {
        fiscal_year_end: '2025-08-31',
        provenance: {
          revenue: { status: 'reported' },
          ebit: { status: 'reported' },
          cash: { status: 'combined' },
          unlevered_fcf: { status: 'calculated' },
          total_debt: { status: 'fallback' },
        },
      },
    ],
  })

  assert.deepEqual(summary.counts, { reported: 2, combined: 1, calculated: 1, fallback: 1 })
  assert.equal(summary.total, 5)
  assert.equal(summary.fiscalYearEnd, '2025-08-31')
  assert.equal(summary.fundamentalsProvider, 'sec_edgar')
})

test('a manually entered valuation has no provenance to summarise', () => {
  assert.equal(provenanceSummary(null), null)
  assert.equal(provenanceSummary({ periods: [] }), null)
  assert.equal(provenanceSummary({ periods: [{ provenance: {} }] }), null)
})

// --- reference price: identical in both modes ----------------------------------------------

test('implied upside and downside are signed against the reference price', () => {
  const up = referenceComparison({ referencePrice: '80', referencePriceDate: '2026-09-04', valuePerShare: 100 })
  assert.equal(up.direction, 'upside')
  assert.ok(Math.abs(up.impliedPct - 25) < 1e-9)

  const down = referenceComparison({ referencePrice: '100', referencePriceDate: '2026-09-04', valuePerShare: 60 })
  assert.equal(down.direction, 'downside')
  assert.ok(Math.abs(down.impliedPct + 40) < 1e-9)
})

test('a comparison needs a positive price AND an as-of date', () => {
  const base = { referencePrice: '80', referencePriceDate: '2026-09-04', valuePerShare: 100 }
  assert.ok(referenceComparison(base))
  assert.equal(referenceComparison({ ...base, referencePrice: '0' }), null)
  assert.equal(referenceComparison({ ...base, referencePrice: '-5' }), null)
  assert.equal(referenceComparison({ ...base, referencePrice: '' }), null)
  assert.equal(referenceComparison({ ...base, referencePriceDate: '' }), null)
  assert.equal(referenceComparison({ ...base, referencePriceDate: '   ' }), null)
  assert.equal(referenceComparison({ ...base, valuePerShare: null }), null)
})
