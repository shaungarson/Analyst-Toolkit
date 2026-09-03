import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compactCurrency } from '../../lib/format.js'
import {
  COSTCO_COMPANY_DATA,
  COSTCO_DEMO_NWC_INVESTMENT_PCT,
  COSTCO_DRIVER_BASE_CASE,
  COSTCO_MARKET_CAP_DATE,
  COSTCO_MARKET_CAP_SOURCE_LABEL,
  COSTCO_MARKET_CAP_SOURCE_URL,
  COSTCO_SHARED_ASSUMPTIONS,
} from './costcoDemo.js'
import { driverHistory, formatSeedValue } from './driverHistory.js'
import { buildDriverPayload, driverInputsError } from './driverSchedule.js'

test('company name is the clean legal name, not the raw SEC registrant string', () => {
  assert.equal(COSTCO_COMPANY_DATA.profile.company_name, 'Costco Wholesale Corporation')
  assert.doesNotMatch(COSTCO_COMPANY_DATA.profile.company_name, /\/NEW|CORP\b/)
})

test('classification renders as exactly "Membership Warehouses · Nasdaq Global Select Market"', () => {
  const { sector, industry, exchange } = COSTCO_COMPANY_DATA.profile
  // Mirrors CompanyHeader.jsx's own join so this test breaks if that rendering rule ever
  // changes, not just if the profile data does.
  const classification = [sector, industry, exchange].filter(Boolean).join(' · ')
  assert.equal(classification, 'Membership Warehouses · Nasdaq Global Select Market')
})

test('market cap formats to the dated $418.60B figure and discloses a non-live, non-SEC source', () => {
  assert.equal(compactCurrency(COSTCO_COMPANY_DATA.profile.market_capitalization), '$418.60B')
  assert.equal(COSTCO_MARKET_CAP_DATE, '2026-08-31')
  assert.match(COSTCO_MARKET_CAP_SOURCE_URL, /^https:\/\/stockanalysis\.com\//)
  assert.ok(COSTCO_MARKET_CAP_SOURCE_LABEL)
})

// --- Costco Driver Base Case: extending the demo into Driver-Based mode ------------------

test('COSTCO_DRIVER_BASE_CASE: base year revenue is the frozen latest-period figure', () => {
  assert.equal(COSTCO_DRIVER_BASE_CASE.baseYearRevenue, '275235000000')
  assert.equal(Number(COSTCO_DRIVER_BASE_CASE.baseYearRevenue), COSTCO_COMPANY_DATA.periods[0].revenue)
})

test('COSTCO_DRIVER_BASE_CASE: five drivers match the same reference values driverHistory() documents', () => {
  const { drivers } = driverHistory(COSTCO_COMPANY_DATA)
  const year1 = COSTCO_DRIVER_BASE_CASE.driverYears[0]
  assert.equal(year1.ebitMargin, formatSeedValue(drivers.ebitMargin.reference))
  assert.equal(year1.taxRate, formatSeedValue(drivers.taxRate.reference))
  assert.equal(year1.daPctOfRevenue, formatSeedValue(drivers.daPctOfRevenue.reference))
  assert.equal(year1.capexPctOfRevenue, formatSeedValue(drivers.capexPctOfRevenue.reference))
  assert.equal(year1.revenueGrowthRate, formatSeedValue(drivers.revenueGrowthRate.reference))
})

test('COSTCO_DRIVER_BASE_CASE: EBIT margin, tax, D&A and CapEx are Flat - identical across all five years', () => {
  const flatFields = ['ebitMargin', 'taxRate', 'daPctOfRevenue', 'capexPctOfRevenue']
  for (const field of flatFields) {
    const values = COSTCO_DRIVER_BASE_CASE.driverYears.map((y) => y[field])
    assert.deepEqual(new Set(values), new Set([values[0]]), `${field} should hold one Flat value across every year`)
    assert.equal(COSTCO_DRIVER_BASE_CASE.rowModes[field], 'flat')
  }
})

test('COSTCO_DRIVER_BASE_CASE: revenue growth Fades from the historical median to the 2.5% terminal target', () => {
  assert.equal(COSTCO_DRIVER_BASE_CASE.rowModes.revenueGrowthRate, 'fade')
  const values = COSTCO_DRIVER_BASE_CASE.driverYears.map((y) => y.revenueGrowthRate)
  assert.deepEqual(values, ['7.46', '6.22', '4.98', '3.74', '2.5'])
  assert.equal(values[4], COSTCO_SHARED_ASSUMPTIONS.terminalGrowthRate)
})

test('COSTCO_DRIVER_BASE_CASE: NWC Investment is the explicit -3% Flat demo assumption, never seeded', () => {
  assert.equal(COSTCO_DEMO_NWC_INVESTMENT_PCT, '-3')
  assert.equal(COSTCO_DRIVER_BASE_CASE.rowModes.nwcInvestmentPct, 'flat')
  const values = COSTCO_DRIVER_BASE_CASE.driverYears.map((y) => y.nwcInvestmentPct)
  assert.deepEqual(values, ['-3', '-3', '-3', '-3', '-3'])
  assert.equal('nwcInvestmentPct' in COSTCO_DRIVER_BASE_CASE.seededFields, false)

  // The value is deliberately close to, but not equal to, the frozen history's own refused
  // aggregate - a rounded judgment call, not the historical figure presented as reliable.
  const nwcDriver = driverHistory(COSTCO_COMPANY_DATA).drivers.nwcInvestmentPct
  assert.equal(nwcDriver.seedable, false)
  assert.equal(formatSeedValue(nwcDriver.reference), '-3.26')
})

test('COSTCO_DRIVER_BASE_CASE: exactly the five historically-supported drivers are badged Seeded', () => {
  assert.deepEqual(new Set(Object.keys(COSTCO_DRIVER_BASE_CASE.seededFields)), new Set([
    'revenueGrowthRate',
    'ebitMargin',
    'taxRate',
    'daPctOfRevenue',
    'capexPctOfRevenue',
  ]))
})

test('COSTCO_DRIVER_BASE_CASE: complete enough to run immediately - no missing-cell error', () => {
  const sharedForm = { ...COSTCO_SHARED_ASSUMPTIONS, netDebt: '-8017000000', dilutedSharesOutstanding: '444803000' }
  assert.equal(driverInputsError(COSTCO_DRIVER_BASE_CASE.baseYearRevenue, COSTCO_DRIVER_BASE_CASE.driverYears, sharedForm), null)
  // buildDriverPayload throws on any incompleteness - reaching a payload at all is itself
  // part of the proof, on top of the explicit driverInputsError check above.
  const payload = buildDriverPayload(COSTCO_DRIVER_BASE_CASE.baseYearRevenue, COSTCO_DRIVER_BASE_CASE.driverYears, sharedForm)
  assert.equal(payload.driver_years.length, 5)
  assert.equal(payload.base_year_revenue, 275235000000)
})

test('COSTCO_DRIVER_BASE_CASE: deterministic - re-deriving it from the frozen snapshot reproduces it exactly', () => {
  // Re-runs the exact same pipeline COSTCO_DRIVER_BASE_CASE was built from (see costcoDemo.js)
  // against the same frozen COSTCO_COMPANY_DATA, rather than re-importing the module (which
  // Node would just return the cached singleton for) - a genuine independent recomputation,
  // not a reference-equality tautology.
  const history = driverHistory(COSTCO_COMPANY_DATA)
  assert.equal(formatSeedValue(history.drivers.ebitMargin.reference), COSTCO_DRIVER_BASE_CASE.driverYears[0].ebitMargin)
  assert.equal(formatSeedValue(history.drivers.taxRate.reference), COSTCO_DRIVER_BASE_CASE.driverYears[0].taxRate)
  assert.equal(formatSeedValue(history.drivers.daPctOfRevenue.reference), COSTCO_DRIVER_BASE_CASE.driverYears[0].daPctOfRevenue)
  assert.equal(formatSeedValue(history.drivers.capexPctOfRevenue.reference), COSTCO_DRIVER_BASE_CASE.driverYears[0].capexPctOfRevenue)
  assert.equal(formatSeedValue(history.drivers.revenueGrowthRate.reference), COSTCO_DRIVER_BASE_CASE.driverYears[0].revenueGrowthRate)
})
