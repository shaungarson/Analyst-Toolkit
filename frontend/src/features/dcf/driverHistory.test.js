import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  driverHistory,
  formatSeedValue,
  referenceBasisLabel,
  NWC_MATERIALITY_FLOOR_PCT,
  NWC_NET_GROSS_MOVEMENT_FLOOR,
} from './driverHistory.js'
import { COSTCO_COMPANY_DATA } from './costcoDemo.js'

// A minimal clean period. Every test below starts from these and breaks exactly one thing, so
// a failure names the rule that broke rather than the fixture.
const period = (overrides) => ({
  fiscal_year_end: '2025-12-31',
  revenue: 1000,
  ebit: 200,
  pretax_income: 190,
  income_tax_expense: 47.5,
  effective_tax_rate: 0.25,
  depreciation_and_amortization: 50,
  capital_expenditures: 80,
  change_in_nwc: 10,
  ...overrides,
})

// Periods arrive newest-first, exactly as CompanyData delivers them.
const threeCleanPeriods = {
  periods: [
    period({ fiscal_year_end: '2025-12-31', revenue: 1210, ebit: 242, change_in_nwc: 22, effective_tax_rate: 0.26 }),
    period({ fiscal_year_end: '2024-12-31', revenue: 1100, ebit: 220, change_in_nwc: 20, effective_tax_rate: 0.25 }),
    period({ fiscal_year_end: '2023-12-31', revenue: 1000, ebit: 200, change_in_nwc: 18, effective_tax_rate: 0.24 }),
  ],
}

// --- Normalization: which statistic each driver uses, and over how many observations --------

test('driverHistory: level ratios use every period, year-over-year drivers use one fewer', () => {
  const { drivers } = driverHistory(threeCleanPeriods)
  // EBIT margin, tax, D&A and CapEx are single-period ratios: three periods, three observations.
  assert.equal(drivers.ebitMargin.observations.length, 3)
  assert.equal(drivers.taxRate.observations.length, 3)
  assert.equal(drivers.daPctOfRevenue.observations.length, 3)
  assert.equal(drivers.capexPctOfRevenue.observations.length, 3)
  // Revenue growth and NWC investment need a prior year: three periods, two observations.
  assert.equal(drivers.revenueGrowthRate.observations.length, 2)
  assert.equal(drivers.nwcInvestmentPct.observations.length, 2)
})

test('driverHistory: observations come back oldest-first for chronological display', () => {
  const { drivers } = driverHistory(threeCleanPeriods)
  assert.deepEqual(
    drivers.ebitMargin.observations.map((o) => o.fiscalYearEnd),
    ['2023-12-31', '2024-12-31', '2025-12-31'],
  )
})

test('driverHistory: the reference statistic is the median, not the latest observation', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 1000, capital_expenditures: 300 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 1000, capital_expenditures: 100 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 1000, capital_expenditures: 110 }),
    ],
  }
  const capex = driverHistory(data).drivers.capexPctOfRevenue
  // Observations are 11%, 10%, 30%; the median is 11%, and the latest (30%) does not win.
  assert.equal(capex.reference, 11)
  assert.equal(capex.referenceStatistic, 'median')
})

test('driverHistory: an even observation count averages the two middle values', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 1000, ebit: 400 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 1000, ebit: 300 }),
    ],
  }
  assert.equal(driverHistory(data).drivers.ebitMargin.reference, 35)
})

test('driverHistory: tax uses the backend-resolved book effective rate, never a recomputation', () => {
  // income_tax_expense / pretax_income here would be 50%, but effective_tax_rate says 25% -
  // the resolved field wins, because it is the one the backend documented and guarded.
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', pretax_income: 100, income_tax_expense: 50, effective_tax_rate: 0.25 }),
      period({ fiscal_year_end: '2024-12-31', pretax_income: 100, income_tax_expense: 50, effective_tax_rate: 0.25 }),
    ],
  }
  assert.equal(driverHistory(data).drivers.taxRate.reference, 25)
})

// --- Missing and unusable data ---------------------------------------------------------------

test('driverHistory: no company data at all returns every driver empty and unseedable', () => {
  const { drivers, periodCount } = driverHistory(null)
  assert.equal(periodCount, 0)
  for (const driver of Object.values(drivers)) {
    assert.equal(driver.seedable, false)
    assert.equal(driver.reference, null)
    assert.equal(driver.observations.length, 0)
  }
})

test('driverHistory: a single period yields no seedable driver - one year is not a run rate', () => {
  const { drivers } = driverHistory({ periods: [period({})] })
  for (const driver of Object.values(drivers)) {
    assert.equal(driver.seedable, false)
  }
  // The level ratios did produce one observation each; they are simply refused as too thin.
  assert.equal(drivers.ebitMargin.observations.length, 1)
  assert.equal(drivers.ebitMargin.reliability, 'insufficient')
  assert.match(drivers.ebitMargin.note, /single year is not a run rate/)
})

test('driverHistory: exactly two usable observations seed, but are flagged as thin', () => {
  const { drivers } = driverHistory({
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 1000, ebit: 200 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 1000, ebit: 220 }),
    ],
  })
  assert.equal(drivers.ebitMargin.seedable, true)
  assert.equal(drivers.ebitMargin.reliability, 'thin')
  assert.match(drivers.ebitMargin.note, /two usable observations/)
})

test('driverHistory: a missing field blanks only its own driver, never a sibling', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', depreciation_and_amortization: null }),
      period({ fiscal_year_end: '2024-12-31', depreciation_and_amortization: null }),
      period({ fiscal_year_end: '2023-12-31', depreciation_and_amortization: null }),
    ],
  }
  const { drivers } = driverHistory(data)
  assert.equal(drivers.daPctOfRevenue.seedable, false)
  assert.equal(drivers.daPctOfRevenue.observations.length, 0)
  assert.equal(drivers.daPctOfRevenue.excluded.length, 3)
  // CapEx and margin, which share the same periods, are entirely unaffected.
  assert.equal(drivers.capexPctOfRevenue.seedable, true)
  assert.equal(drivers.ebitMargin.seedable, true)
})

test('driverHistory: a non-positive revenue period is excluded with a stated reason', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 0 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 1000 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 1000 }),
    ],
  }
  const margin = driverHistory(data).drivers.ebitMargin
  assert.equal(margin.observations.length, 2)
  assert.equal(margin.excluded.length, 1)
  assert.match(margin.excluded[0].reason, /revenue not positive/)
})

test('driverHistory: a negative reported CapEx is excluded and named, never sign-flipped', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', capital_expenditures: -80 }),
      period({ fiscal_year_end: '2024-12-31', capital_expenditures: 80 }),
      period({ fiscal_year_end: '2023-12-31', capital_expenditures: 80 }),
    ],
  }
  const capex = driverHistory(data).drivers.capexPctOfRevenue
  assert.equal(capex.observations.length, 2)
  assert.ok(capex.observations.every((o) => o.value > 0))
  assert.match(capex.excluded[0].reason, /negative value reported/)
})

test('driverHistory: an undefined effective tax rate is excluded, not read as zero', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', effective_tax_rate: null }),
      period({ fiscal_year_end: '2024-12-31', effective_tax_rate: 0.25 }),
      period({ fiscal_year_end: '2023-12-31', effective_tax_rate: 0.25 }),
    ],
  }
  const tax = driverHistory(data).drivers.taxRate
  assert.equal(tax.observations.length, 2)
  assert.equal(tax.reference, 25)
  assert.match(tax.excluded[0].reason, /effective rate undefined/)
})

test('driverHistory: a zero prior revenue never produces Infinity growth', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 1100 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 0 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 900 }),
    ],
  }
  const growth = driverHistory(data).drivers.revenueGrowthRate
  // The 1100-over-zero pair is dropped entirely rather than becoming Infinity; the
  // zero-over-900 pair is a perfectly real -100% observation and survives.
  assert.ok(growth.observations.every((o) => Number.isFinite(o.value)))
  assert.equal(growth.observations.length, 1)
  assert.equal(growth.observations[0].value, -100)
  assert.match(growth.excluded[0].reason, /prior year not positive/)
  // One observation is never enough to seed from.
  assert.equal(growth.seedable, false)
})

test('driverHistory: a materially divergent pre-tax income raises the cash-tax proxy caution', () => {
  const data = {
    periods: [
      // EBIT 200 against pre-tax 100: heavy net interest, so the book rate is a weak proxy
      // for tax on EBIT and the row must say so.
      period({ fiscal_year_end: '2025-12-31', ebit: 200, pretax_income: 100 }),
      period({ fiscal_year_end: '2024-12-31', ebit: 200, pretax_income: 100 }),
    ],
  }
  const tax = driverHistory(data).drivers.taxRate
  assert.match(tax.note, /Pre-tax income differs from EBIT/)
  // A disclosure, never a substitution - the rate itself is untouched and still seedable.
  assert.equal(tax.reference, 25)
  assert.equal(tax.seedable, true)
})

test('driverHistory: a small EBIT/pre-tax gap stays quiet', () => {
  // Costco's own gap is about 4% - well inside the threshold, so a normal company does not
  // get a warning it does not need.
  const tax = driverHistory(COSTCO_COMPANY_DATA).drivers.taxRate
  assert.equal(tax.note, null)
})

// --- NWC investment: aggregate statistic, materiality floor, and refusal ----------------------

test('driverHistory: NWC uses the aggregate of the flows, not a median of the yearly ratios', () => {
  const data = {
    periods: [
      // Ratios 20% and 5%; the median would be 12.5%, the aggregate is 300/2400 = 12.5%...
      // so use deliberately asymmetric years where the two genuinely differ.
      period({ fiscal_year_end: '2025-12-31', revenue: 2000, change_in_nwc: 20 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 1000, change_in_nwc: 50 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 900 }),
    ],
  }
  const nwc = driverHistory(data).drivers.nwcInvestmentPct
  // Observations: 50/100 = 50% and 20/1000 = 2%. A median would be 26%; the aggregate weights
  // by how much revenue actually moved: (50 + 20) / (100 + 1000) = 6.36%.
  assert.equal(nwc.referenceStatistic, 'aggregate')
  assert.ok(Math.abs(nwc.reference - 6.3636) < 0.001)
})

test('driverHistory: a near-flat revenue year is excluded from NWC, not merely guarded', () => {
  const data = {
    periods: [
      // Revenue moves 0.1% - a finite but meaningless denominator.
      period({ fiscal_year_end: '2025-12-31', revenue: 1001, change_in_nwc: 30 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 1000, change_in_nwc: 25 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 900 }),
    ],
  }
  const nwc = driverHistory(data).drivers.nwcInvestmentPct
  assert.equal(nwc.observations.length, 1)
  assert.match(nwc.excluded[0].reason, new RegExp(`below the ${NWC_MATERIALITY_FLOOR_PCT}% floor`))
  // Only one observation survives the floor, so seeding is refused rather than resting on it.
  assert.equal(nwc.seedable, false)
})

test('driverHistory: a sign-flipping NWC history is refused, with the evidence still shown', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 1300, change_in_nwc: -20 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 1150, change_in_nwc: 30 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 1000, change_in_nwc: -15 }),
    ],
  }
  const nwc = driverHistory(data).drivers.nwcInvestmentPct
  assert.equal(nwc.seedable, false)
  assert.equal(nwc.reliability, 'unstable')
  assert.match(nwc.note, /changes sign/)
  // Refused, but never hidden: the analyst still sees every observation.
  assert.equal(nwc.observations.length, 2)
  assert.notEqual(nwc.reference, null)
})

test('driverHistory: an over-dispersed NWC history is refused even without a sign flip', () => {
  const data = {
    periods: [
      // Ratios of 60%, 2% and 2%, but the 60% year moved revenue by only 100 against 1000
      // in the others - so the aggregate lands near 4.8% while the spread is 58pp.
      period({ fiscal_year_end: '2025-12-31', revenue: 3100, change_in_nwc: 60 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 3000, change_in_nwc: 20 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 2000, change_in_nwc: 20 }),
      period({ fiscal_year_end: '2022-12-31', revenue: 1000 }),
    ],
  }
  const nwc = driverHistory(data).drivers.nwcInvestmentPct
  assert.equal(nwc.seedable, false)
  assert.equal(nwc.reliability, 'unstable')
  assert.match(nwc.note, /too dispersed/)
})

test('driverHistory: a stable NWC history does seed', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 1300, change_in_nwc: 15 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 1150, change_in_nwc: 15 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 1000, change_in_nwc: 10 }),
      period({ fiscal_year_end: '2022-12-31', revenue: 900 }),
    ],
  }
  const nwc = driverHistory(data).drivers.nwcInvestmentPct
  // Three observations, all 10% of Δrevenue: same sign, no dispersion, enough of them.
  assert.equal(nwc.observations.length, 3)
  assert.equal(nwc.seedable, true)
  assert.equal(nwc.reliability, 'ok')
  assert.equal(nwc.reference, 10)
})

test('driverHistory: NWC never falls back to the latest observation or to zero when refused', () => {
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 1300, change_in_nwc: -20 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 1150, change_in_nwc: 30 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 1000, change_in_nwc: -15 }),
    ],
  }
  const nwc = driverHistory(data).drivers.nwcInvestmentPct
  const latest = nwc.observations[nwc.observations.length - 1].value
  assert.equal(nwc.seedable, false)
  assert.notEqual(nwc.reference, latest)
  assert.notEqual(nwc.reference, 0)
})

// --- The real Costco snapshot: the reference case this methodology was calibrated against ----

test('driverHistory: the Costco snapshot seeds five drivers and refuses working capital', () => {
  const { drivers } = driverHistory(COSTCO_COMPANY_DATA)
  assert.equal(drivers.revenueGrowthRate.seedable, true)
  assert.equal(drivers.ebitMargin.seedable, true)
  assert.equal(drivers.taxRate.seedable, true)
  assert.equal(drivers.daPctOfRevenue.seedable, true)
  assert.equal(drivers.capexPctOfRevenue.seedable, true)
  // Costco's working capital both builds and releases across the window (+3.5% to -10.9% of
  // Δrevenue), so no single ratio describes it and none is invented.
  assert.equal(drivers.nwcInvestmentPct.seedable, false)
  assert.equal(drivers.nwcInvestmentPct.reliability, 'unstable')
})

test('driverHistory: the Costco reference values are the ones the methodology documents', () => {
  const { drivers } = driverHistory(COSTCO_COMPANY_DATA)
  assert.equal(formatSeedValue(drivers.revenueGrowthRate.reference), '7.46')
  assert.equal(formatSeedValue(drivers.ebitMargin.reference), '3.43')
  assert.equal(formatSeedValue(drivers.taxRate.reference), '24.55')
  assert.equal(formatSeedValue(drivers.daPctOfRevenue.reference), '0.88')
  assert.equal(formatSeedValue(drivers.capexPctOfRevenue.reference), '1.83')
  // The refused aggregate is still computed, so the analyst can see what was rejected.
  assert.equal(formatSeedValue(drivers.nwcInvestmentPct.reference), '-3.26')
})

// --- Presentation helpers ----------------------------------------------------------------------

test('formatSeedValue: rounds to two decimals and refuses a non-finite input', () => {
  assert.equal(formatSeedValue(7.4615), '7.46')
  assert.equal(formatSeedValue(-3.2634), '-3.26')
  assert.equal(formatSeedValue(0), '0')
  assert.equal(formatSeedValue(Infinity), '')
  assert.equal(formatSeedValue(NaN), '')
})

test('referenceBasisLabel: names the statistic, the count, and the fiscal-year-end span', () => {
  const { drivers } = driverHistory(COSTCO_COMPANY_DATA)
  assert.equal(referenceBasisLabel(drivers.capexPctOfRevenue), 'median of 5 observations, FYE 2021-2025')
  assert.match(referenceBasisLabel(drivers.nwcInvestmentPct), /^aggregate /)
  assert.equal(referenceBasisLabel(driverHistory(null).drivers.ebitMargin), 'no usable observations')
})

// --- NWC denominator integrity: the near-cancellation case ------------------------------------

// Revenue +1000 then -990, with working capital moving +100 then -80. Both yearly ratios are
// ordinary (10.00% and 8.08%) and only 1.9pp apart, so the spread test passes comfortably - but
// the sums are 20 over 10, a 200% aggregate. Before the denominator checks this was seedable,
// and it is the worst available failure: an absurd figure wearing a stable-looking history.
const NEAR_CANCELLATION = {
  periods: [
    period({ fiscal_year_end: '2025-12-31', revenue: 1010, change_in_nwc: -80 }),
    period({ fiscal_year_end: '2024-12-31', revenue: 2000, change_in_nwc: 100 }),
    period({ fiscal_year_end: '2023-12-31', revenue: 1000 }),
  ],
}

test('driverHistory: a near-cancelling revenue window is refused, not turned into a 200% aggregate', () => {
  const nwc = driverHistory(NEAR_CANCELLATION).drivers.nwcInvestmentPct

  // Both observations survived the per-year materiality floor and look unremarkable.
  assert.equal(nwc.observations.length, 2)
  const values = nwc.observations.map((o) => Number(o.value.toFixed(2)))
  assert.deepEqual(values.sort((a, b) => a - b), [8.08, 10])
  assert.ok(Math.max(...values) - Math.min(...values) < 2, 'the spread test alone would not object')

  // The denominator check is what catches it.
  assert.equal(nwc.seedable, false)
  assert.equal(nwc.reliability, 'unstable')
  assert.match(nwc.note, /rose in some years and fell in others/)

  // And no reference is reported at all - an inflated aggregate is not evidence, and showing
  // one would invite exactly the copy-across the refusal exists to prevent.
  assert.equal(nwc.reference, null)
  assert.equal(nwc.referenceStatistic, null)
})

test('driverHistory: the near-cancellation case still shows its underlying observations', () => {
  const nwc = driverHistory(NEAR_CANCELLATION).drivers.nwcInvestmentPct
  assert.equal(nwc.observations.length, 2)
  assert.ok(nwc.observations.every((o) => Number.isFinite(o.value)))
  assert.ok(nwc.observations.every((o) => typeof o.fiscalYearEnd === 'string'))
})

test('driverHistory: a reversal is refused even when the yearly ratios are identical', () => {
  // Same ratio both years (10%), so nothing about the ratios is suspicious - only the
  // denominator is. Sums to 20 over 10 again: a 200% aggregate from two 10% years.
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 1010, change_in_nwc: -99 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 2000, change_in_nwc: 100 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 1000 }),
    ],
  }
  const nwc = driverHistory(data).drivers.nwcInvestmentPct
  assert.equal(nwc.seedable, false)
  assert.equal(nwc.reference, null)
})

test('driverHistory: a wholly falling revenue window is fine - direction must reverse, not fall', () => {
  // Refusing every declining company would be an economic judgement, not a denominator
  // problem: a consistent decline gives a perfectly coherent denominator.
  const data = {
    periods: [
      period({ fiscal_year_end: '2025-12-31', revenue: 800, change_in_nwc: -20 }),
      period({ fiscal_year_end: '2024-12-31', revenue: 900, change_in_nwc: -20 }),
      period({ fiscal_year_end: '2023-12-31', revenue: 1000 }),
    ],
  }
  const nwc = driverHistory(data).drivers.nwcInvestmentPct
  assert.equal(nwc.observations.length, 2)
  assert.equal(nwc.seedable, true)
  // -40 / -200 = 20% of each dollar of revenue decline released from working capital.
  assert.equal(nwc.reference, 20)
})

test('driverHistory: any seedable NWC reference satisfies the net-versus-gross floor', () => {
  // The invariant the second denominator rule enforces. It is implied by the direction check
  // whenever that check runs - same-signed deltas make |sum| equal the sum of |delta| exactly -
  // so this asserts the guarantee holds rather than trying to trigger the rule independently.
  const cases = [
    COSTCO_COMPANY_DATA,
    NEAR_CANCELLATION,
    threeCleanPeriods,
    {
      periods: [
        period({ fiscal_year_end: '2025-12-31', revenue: 1300, change_in_nwc: 15 }),
        period({ fiscal_year_end: '2024-12-31', revenue: 1150, change_in_nwc: 15 }),
        period({ fiscal_year_end: '2023-12-31', revenue: 1000, change_in_nwc: 10 }),
        period({ fiscal_year_end: '2022-12-31', revenue: 900 }),
      ],
    },
  ]
  for (const data of cases) {
    const nwc = driverHistory(data).drivers.nwcInvestmentPct
    if (!nwc.seedable) continue
    const deltas = []
    const periods = data.periods
    for (let i = 0; i < periods.length - 1; i += 1) {
      const delta = periods[i].revenue - periods[i + 1].revenue
      if (Math.abs(delta / periods[i + 1].revenue) * 100 >= NWC_MATERIALITY_FLOOR_PCT) deltas.push(delta)
    }
    const net = Math.abs(deltas.reduce((t, d) => t + d, 0))
    const gross = deltas.reduce((t, d) => t + Math.abs(d), 0)
    assert.ok(net >= NWC_NET_GROSS_MOVEMENT_FLOOR * gross, `net ${net} vs gross ${gross}`)
  }
})
