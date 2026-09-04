import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  baseYearCaution,
  historicalCagrQualification,
  nwcEvidenceIsUnreliable,
  workingCapitalMovement,
} from './baseYearRepresentativeness.js'
import { driverHistory } from './driverHistory.js'
import { COSTCO_COMPANY_DATA } from './costcoDemo.js'

// Real reported periods, newest-first, from the deployed API on 2026-09-04 (SEC EDGAR sourced).
// Only the fields the working-capital verdict reads are carried. Costco comes from the frozen
// demo snapshot already in the repo rather than a second copy of the same company.
const KO = {
  periods: [
    { fiscal_year_end: '2025-12-31', revenue: 47_941_000_000, change_in_nwc: 9_269_000_000 },
    { fiscal_year_end: '2024-12-31', revenue: 47_061_000_000, change_in_nwc: -5_823_000_000 },
    { fiscal_year_end: '2023-12-31', revenue: 45_754_000_000, change_in_nwc: -244_000_000 },
    { fiscal_year_end: '2022-12-31', revenue: 43_004_000_000, change_in_nwc: -2_054_000_000 },
    { fiscal_year_end: '2021-12-31', revenue: 38_655_000_000, change_in_nwc: -617_000_000 },
  ],
}
const MSFT = {
  periods: [
    { fiscal_year_end: '2026-06-30', revenue: 331_839_000_000, change_in_nwc: 12_922_000_000 },
    { fiscal_year_end: '2025-06-30', revenue: 281_724_000_000, change_in_nwc: -2_807_000_000 },
    { fiscal_year_end: '2024-06-30', revenue: 245_122_000_000, change_in_nwc: -12_939_000_000 },
    { fiscal_year_end: '2023-06-30', revenue: 211_915_000_000, change_in_nwc: 1_499_000_000 },
    { fiscal_year_end: '2022-06-30', revenue: 198_270_000_000, change_in_nwc: -893_000_000 },
  ],
}
const NVDA = {
  periods: [
    { fiscal_year_end: '2026-01-25', revenue: 215_938_000_000, change_in_nwc: 64_967_000_000 },
    { fiscal_year_end: '2025-01-26', revenue: 130_497_000_000, change_in_nwc: 9_889_000_000 },
    { fiscal_year_end: '2024-01-28', revenue: 60_922_000_000, change_in_nwc: 4_516_000_000 },
    { fiscal_year_end: '2023-01-29', revenue: 26_974_000_000, change_in_nwc: 1_178_000_000 },
    { fiscal_year_end: '2022-01-30', revenue: 26_914_000_000, change_in_nwc: 1_718_000_000 },
  ],
}

const cautionFor = (data) =>
  baseYearCaution({
    history: driverHistory(data),
    latestPeriod: data.periods[0],
    badgeType: 'sourced',
  })

// --- the sign of ΔNWC, stated as cash ------------------------------------------------------

test('a positive change in net working capital reads as an investment', () => {
  const movement = workingCapitalMovement(9_269_000_000)
  assert.equal(movement.direction, 'investment')
  assert.match(movement.label, /working-capital investment/)
  assert.match(movement.label, /9\.27B/)
})

test('a negative change in net working capital reads as a release', () => {
  const movement = workingCapitalMovement(-5_823_000_000)
  assert.equal(movement.direction, 'release')
  assert.match(movement.label, /working-capital release/)
  // The magnitude is stated unsigned - "a -$5.82B release" would negate itself. (The only
  // hyphen in the label is the one in "working-capital".)
  assert.match(movement.label, /5\.82B/)
  assert.ok(!/-\s*\$/.test(movement.label), movement.label)
  assert.equal(movement.amount, 5_823_000_000)
})

test('no movement is described when the figure is zero, missing or non-finite', () => {
  for (const value of [0, null, undefined, NaN, Infinity]) {
    assert.equal(workingCapitalMovement(value), null, String(value))
  }
})

// --- the trigger ---------------------------------------------------------------------------

test('only an unreliable working-capital verdict triggers anything', () => {
  const withReliability = (reliability) => ({
    periodCount: 5,
    drivers: { nwcInvestmentPct: { reliability, reason: 'because' } },
  })
  assert.equal(nwcEvidenceIsUnreliable(withReliability('ok')), false)
  for (const reliability of ['unstable', 'thin', 'insufficient']) {
    assert.equal(nwcEvidenceIsUnreliable(withReliability(reliability)), true, reliability)
  }
})

test('no loaded company produces no caution and no qualification', () => {
  const empty = driverHistory(null)
  assert.equal(baseYearCaution({ history: empty, latestPeriod: null, badgeType: 'sourced' }), null)
  assert.equal(historicalCagrQualification(empty), null)
})

// --- the caution is aimed at the seed, not at the analyst's own figure ---------------------

test('the caution disappears once the analyst edits the base year', () => {
  const history = driverHistory(KO)
  const latestPeriod = KO.periods[0]

  assert.ok(baseYearCaution({ history, latestPeriod, badgeType: 'sourced' }))
  for (const badgeType of ['adjusted', 'analyst', null, undefined]) {
    assert.equal(
      baseYearCaution({ history, latestPeriod, badgeType }),
      null,
      `badge ${String(badgeType)} must not carry a warning aimed at the automatic seed`
    )
  }
})

test('the caution carries the reason without the Driver-mode call to action', () => {
  const caution = cautionFor(KO)

  assert.match(caution.reason, /so the aggregate is not representative/)
  // That instruction refers to a driver row Quick DCF does not have.
  assert.ok(!/Review the observations/.test(caution.reason))
  assert.ok(!/enter your own assumption/.test(caution.reason))
  // Driver mode's own note is untouched.
  assert.match(driverHistory(KO).drivers.nwcInvestmentPct.note, /Review the observations/)
})

test('the caution names the year and the working-capital movement behind it', () => {
  const caution = cautionFor(KO)

  assert.match(caution.headline, /FY2025/)
  assert.match(caution.headline, /9\.27B working-capital investment/)
  assert.equal(caution.movement.direction, 'investment')
})

test('the caution never asserts the reported figure is wrong', () => {
  const caution = cautionFor(KO)
  const prose = `${caution.headline} ${caution.reason}`
  for (const forbidden of [/incorrect/i, /\bwrong\b/i, /\berror\b/i, /overstat/i, /understat/i]) {
    assert.ok(!forbidden.test(prose), `${forbidden} must not appear: ${prose}`)
  }
})

test('a company with no usable ΔNWC still gets a caution, without inventing a movement', () => {
  const noNwc = {
    periods: KO.periods.map((p) => ({ ...p, change_in_nwc: null })),
  }
  const caution = cautionFor(noNwc)

  assert.ok(caution, 'insufficient evidence is itself a representativeness risk')
  assert.equal(caution.movement, null)
  assert.match(caution.headline, /may not be a representative starting point/)
})

// --- the historical CAGR qualification -----------------------------------------------------

const historyWith = (reliability) => ({
  periodCount: 5,
  drivers: { nwcInvestmentPct: { reliability, reason: 'because' } },
})

test('the CAGR is qualified, not hidden, when working-capital history is unreliable', () => {
  const qualification = historicalCagrQualification(driverHistory(KO))

  assert.match(qualification, /working-capital timing/i)
  assert.ok(!/hidden|omitted|removed/i.test(qualification))
})

test('the qualification names the tier it actually found', () => {
  // "Unreliable" was accurate for one of these three and overstated the other two: a thin
  // history is genuinely usable - Driver mode seeds from it - and an insufficient one is an
  // absence of evidence rather than evidence that misleads.
  assert.match(historicalCagrQualification(historyWith('unstable')), /^Working-capital history is unstable for this company, /)
  assert.match(historicalCagrQualification(historyWith('thin')), /^Only two usable working-capital observations provide limited evidence, /)
  assert.match(historicalCagrQualification(historyWith('insufficient')), /^Working-capital history is too limited to assess, /)
})

test('only the unstable tier calls the history unstable', () => {
  assert.ok(!/unstable/i.test(historicalCagrQualification(historyWith('thin'))))
  assert.ok(!/unstable/i.test(historicalCagrQualification(historyWith('insufficient'))))
  // And a thin history is never described as an absence of evidence, nor the reverse.
  assert.ok(!/too limited to assess/i.test(historicalCagrQualification(historyWith('thin'))))
  assert.ok(!/limited evidence/i.test(historicalCagrQualification(historyWith('insufficient'))))
})

test('every tier states the same consequence, so only the lead varies', () => {
  for (const reliability of ['unstable', 'thin', 'insufficient']) {
    assert.match(
      historicalCagrQualification(historyWith(reliability)),
      /, so this CAGR may reflect working-capital timing rather than the underlying business\.$/,
      reliability
    )
  }
})

test('a reliable verdict is the only one that produces no qualification', () => {
  assert.equal(historicalCagrQualification(historyWith('ok')), null)
})

test('an unrecognised verdict withholds the benchmark without inventing wording for it', () => {
  // The caution and the Explain This Valuation suppression both key off the non-`ok` test
  // rather than off this string, so a future tier is handled safely by default: no copy, but
  // the unreliable CAGR is still not used as a benchmark.
  const unknown = historyWith('some-future-tier')
  assert.equal(historicalCagrQualification(unknown), null)
  assert.equal(nwcEvidenceIsUnreliable(unknown), true)
  assert.ok(baseYearCaution({ history: unknown, latestPeriod: KO.periods[0], badgeType: 'sourced' }))
})

test('a reliable working-capital history leaves the CAGR unqualified', () => {
  assert.equal(historicalCagrQualification(driverHistory(NVDA)), null)
})

// --- real companies, pinned ----------------------------------------------------------------

test('Costco, Coca-Cola and Microsoft are cautioned; NVIDIA is not', () => {
  // The four archetypes the readiness review measured. NVIDIA is the discriminating case: its
  // latest year carries a $64.97B working-capital build, far the largest here in dollars, and is
  // still not flagged - because that build accompanies 65% revenue growth and its working-capital
  // history is consistent enough to characterise. A trigger that fired on NVIDIA too would be
  // reacting to size rather than to representativeness.
  for (const [name, data] of [['COST', COSTCO_COMPANY_DATA], ['KO', KO], ['MSFT', MSFT]]) {
    const caution = cautionFor(data)
    assert.ok(caution, `${name} must be cautioned`)
    assert.ok(caution.reason, `${name} must state why`)
    assert.ok(historicalCagrQualification(driverHistory(data)), `${name} CAGR must be qualified`)
  }

  assert.equal(cautionFor(NVDA), null, 'NVDA must not be cautioned')
  assert.equal(historicalCagrQualification(driverHistory(NVDA)), null)
})

test('the two cautioned reasons are the real ones from these filings', () => {
  // Pins the evidence, not just the boolean: if the underlying classification changes, this
  // should fail loudly rather than silently cautioning for a different reason.
  assert.match(cautionFor(KO).reason, /History spans 436\.7pp against an aggregate of -96\.6%/)
  assert.match(cautionFor(MSFT).reason, /History changes sign/)
  assert.match(cautionFor(COSTCO_COMPANY_DATA).reason, /History changes sign/)
})

test('Microsoft and Costco name their own latest working-capital movement', () => {
  assert.match(cautionFor(MSFT).headline, /FY2026 included a \$12\.92B working-capital investment/)
  assert.equal(cautionFor(MSFT).movement.direction, 'investment')

  const costco = cautionFor(COSTCO_COMPANY_DATA)
  assert.ok(costco.movement, 'the frozen demo snapshot carries a real ΔNWC')
})
