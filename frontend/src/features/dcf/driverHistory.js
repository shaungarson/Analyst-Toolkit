// Historical evidence for the six Driver-Based DCF drivers, and the seeding rules that turn
// that evidence into a reviewable starting schedule. Pure functions only - no React, no
// network, no valuation arithmetic. The backend stays the sole authority on projecting a
// schedule into cash flows; nothing here reproduces `project_driver_years`.
//
// Everything in this module is expressed in PERCENT (whole numbers - 8 means 8%), matching
// the driver table's own inputs, so a seeded value can be written straight into driverYears
// without a second unit conversion. `buildDriverPayload` remains the one place percentages
// become fractions.

// Fiscal-period fields this module reads, all already present on CompanyData.periods.
// `effective_tax_rate` is the backend's own resolved book rate (income tax expense over
// pre-tax income, null whenever pre-tax income isn't positive) - never recomputed here.

// A near-flat revenue year makes ΔNWC ÷ ΔRevenue a small-denominator artifact rather than a
// measurement, so such a year is excluded from the NWC statistic entirely. Guarding only
// against an exactly-zero denominator (the v1 behaviour) is not enough: a 0.1% revenue move
// produces a finite but meaningless ratio.
export const NWC_MATERIALITY_FLOOR_PCT = 2

// Below this many usable observations a driver is never seeded - a single observation is not
// evidence of a run rate, and this project's own review found copying one across to be the
// worst-performing of the candidate seeding rules.
const MIN_OBSERVATIONS = 2

// Exactly this many usable observations still seeds, but says so on the row.
export const THIN_OBSERVATIONS = 2

// The book effective tax rate is applied to EBIT as a cash-tax proxy. Where pre-tax income
// and EBIT diverge materially (net interest), the book rate over pre-tax income is a poorer
// proxy for tax on EBIT, so the row says so. A disclosure, not a substitution - this app has
// no jurisdiction data and inventing a statutory rate would be exactly the kind of silent
// economic judgement CLAUDE.md's Financial Validation Principle warns against.
const TAX_EBIT_DIVERGENCE_THRESHOLD = 0.1

// An NWC history whose spread exceeds this multiple of its own aggregate is treated as
// unstable and refused for seeding. Costco - the most stable name in this repo - spans
// 14.4pp against a -3.26% aggregate (4.4x) and is correctly refused; its CapEx spans 0.29pp
// against 1.82% (0.16x) and is not.
const NWC_INSTABILITY_SPREAD_MULTIPLE = 2

// The aggregate ratio divides a sum of working-capital flows by a sum of revenue changes, so
// its denominator is only meaningful when those revenue changes point the same way. If revenue
// rose in some years and fell in others they partly cancel, and the surviving net can be a
// small residue of much larger gross movements - which inflates the aggregate without
// tripping the spread test, because the spread is compared against that same inflated figure.
// Worked example: +1000 revenue with +100 of NWC (10%) followed by -990 with -80 (8.1%) gives
// two near-identical yearly ratios and a spread of 1.9pp, but sums to 20/10 = a 200% aggregate.
// So the denominator is checked before the ratios are, on two counts: direction must not
// reverse, and the net cumulative change must be at least this share of the gross annual
// movements. The second is implied by the first whenever the check runs (same-signed deltas
// make |sum| equal sum-of-|delta| exactly), and is enforced rather than assumed so the
// guarantee does not depend on the sign test's own implementation.
const NWC_NET_GROSS_MOVEMENT_FLOOR = 0.9

export const DRIVER_FIELDS = [
  'revenueGrowthRate',
  'ebitMargin',
  'taxRate',
  'daPctOfRevenue',
  'capexPctOfRevenue',
  'nwcInvestmentPct',
]

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

// Median, not mean: with at most five observations a single acquisition year, COVID year, or
// restructuring charge would otherwise set the whole forecast. Even-count medians average the
// two middle values, the standard convention.
function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// An empty driver record - used for every driver when there is no company data at all, so
// callers never have to null-check an individual driver's shape.
function emptyDriver() {
  return {
    observations: [],
    excluded: [],
    reference: null,
    referenceStatistic: null,
    reliability: 'insufficient',
    seedable: false,
    note: 'No sourced history available.',
  }
}

// Classifies a driver once its usable observations are known. Shared by every driver except
// NWC investment, which layers its own stability checks on top (see below).
function classify(observations, reference, statistic) {
  if (observations.length < MIN_OBSERVATIONS || reference == null) {
    return {
      reference: observations.length > 0 ? reference : null,
      referenceStatistic: observations.length > 0 ? statistic : null,
      reliability: 'insufficient',
      seedable: false,
      note:
        observations.length === 0
          ? 'No usable observations in the sourced history.'
          : 'Only one usable observation - a single year is not a run rate. Enter this driver manually.',
    }
  }
  return {
    reference,
    referenceStatistic: statistic,
    reliability: observations.length === THIN_OBSERVATIONS ? 'thin' : 'ok',
    seedable: true,
    note:
      observations.length === THIN_OBSERVATIONS
        ? 'Only two usable observations - a thin basis for a forecast.'
        : null,
  }
}

// Refusal notes deliberately say only WHY the evidence is unreliable and WHAT to do next.
// They do not restate the consequence: buildBaseForecast lists them under a "Not used as a
// starting point" heading, and the driver row carries the same caption beside its benchmark,
// so a note repeating it made one fact appear three times on a single screen.
// One "level" ratio per period: numerator over that same period's revenue, as a percent.
// Used for EBIT margin, D&A, and CapEx. A period is excluded (with a stated reason, so the
// UI can show what was dropped rather than silently shrinking the sample) when revenue isn't
// a positive finite number or the numerator is missing.
function levelRatioObservations(periods, field, { rejectNegative = false } = {}) {
  const observations = []
  const excluded = []
  for (const period of periods) {
    const numerator = period?.[field]
    const revenue = period?.revenue
    if (!isFiniteNumber(numerator)) {
      excluded.push({ fiscalYearEnd: period?.fiscal_year_end ?? null, reason: 'not reported' })
      continue
    }
    if (!isFiniteNumber(revenue) || revenue <= 0) {
      excluded.push({ fiscalYearEnd: period?.fiscal_year_end ?? null, reason: 'revenue not positive' })
      continue
    }
    // A negative sourced CapEx is a filer-side sign anomaly (this app's SEC mapping uses
    // PaymentsToAcquirePropertyPlantAndEquipment, which is reported positive). Excluded and
    // named - never silently sign-flipped into a plausible-looking positive.
    if (rejectNegative && numerator < 0) {
      excluded.push({ fiscalYearEnd: period?.fiscal_year_end ?? null, reason: 'negative value reported' })
      continue
    }
    const value = (numerator / revenue) * 100
    if (!Number.isFinite(value)) {
      excluded.push({ fiscalYearEnd: period?.fiscal_year_end ?? null, reason: 'ratio not finite' })
      continue
    }
    observations.push({ fiscalYearEnd: period.fiscal_year_end, value })
  }
  return { observations, excluded }
}

// Year-over-year revenue growth, one observation per consecutive pair. `periods` arrives
// newest-first, so pair i is period i against period i+1.
function revenueGrowthObservations(periods) {
  const observations = []
  const excluded = []
  for (let i = 0; i < periods.length - 1; i += 1) {
    const current = periods[i]
    const prior = periods[i + 1]
    if (!isFiniteNumber(current?.revenue) || !isFiniteNumber(prior?.revenue) || prior.revenue <= 0) {
      excluded.push({ fiscalYearEnd: current?.fiscal_year_end ?? null, reason: 'revenue missing or prior year not positive' })
      continue
    }
    const value = ((current.revenue - prior.revenue) / prior.revenue) * 100
    if (!Number.isFinite(value)) {
      excluded.push({ fiscalYearEnd: current.fiscal_year_end, reason: 'growth not finite' })
      continue
    }
    observations.push({ fiscalYearEnd: current.fiscal_year_end, value })
  }
  return { observations, excluded }
}

// The book effective tax rate the backend already resolved, per period. Nothing is derived
// here - a period where pre-tax income wasn't positive already carries a null rate, and is
// excluded rather than being turned into a fabricated number.
function taxRateObservations(periods) {
  const observations = []
  const excluded = []
  for (const period of periods) {
    const rate = period?.effective_tax_rate
    if (!isFiniteNumber(rate)) {
      excluded.push({
        fiscalYearEnd: period?.fiscal_year_end ?? null,
        reason: 'effective rate undefined (pre-tax income not positive, or not reported)',
      })
      continue
    }
    observations.push({ fiscalYearEnd: period.fiscal_year_end, value: rate * 100 })
  }
  return { observations, excluded }
}

// ΔNWC ÷ ΔRevenue, one observation per consecutive pair, subject to the materiality floor.
// Both figures are flows: `change_in_nwc` is the period's dollar change in net working
// capital (already labelled "Δ NWC" in Sourced Historical Data), never a balance-sheet NWC
// level, and ΔRevenue is the same period's revenue change - flow over flow, matching the
// driver input's own definition.
function nwcObservations(periods) {
  const observations = []
  const excluded = []
  for (let i = 0; i < periods.length - 1; i += 1) {
    const current = periods[i]
    const prior = periods[i + 1]
    const fiscalYearEnd = current?.fiscal_year_end ?? null
    if (!isFiniteNumber(current?.change_in_nwc)) {
      excluded.push({ fiscalYearEnd, reason: 'Δ NWC not reported' })
      continue
    }
    if (!isFiniteNumber(current?.revenue) || !isFiniteNumber(prior?.revenue) || prior.revenue <= 0) {
      excluded.push({ fiscalYearEnd, reason: 'revenue missing or prior year not positive' })
      continue
    }
    const deltaRevenue = current.revenue - prior.revenue
    const movementPct = Math.abs(deltaRevenue / prior.revenue) * 100
    if (movementPct < NWC_MATERIALITY_FLOOR_PCT) {
      excluded.push({
        fiscalYearEnd,
        reason: `revenue moved ${movementPct.toFixed(1)}% - below the ${NWC_MATERIALITY_FLOOR_PCT}% floor, so the ratio is a small-denominator artifact`,
      })
      continue
    }
    const value = (current.change_in_nwc / deltaRevenue) * 100
    if (!Number.isFinite(value)) {
      excluded.push({ fiscalYearEnd, reason: 'ratio not finite' })
      continue
    }
    observations.push({
      fiscalYearEnd,
      value,
      changeInNwc: current.change_in_nwc,
      deltaRevenue,
    })
  }
  return { observations, excluded }
}

// NWC investment gets its own classifier. Two differences from every other driver:
//
// 1. The reference statistic is the AGGREGATE ΣΔNWC ÷ ΣΔRevenue over the window, not a
//    median of the yearly ratios. This is a ratio of two flows, and aggregating numerator
//    and denominator weights each year by how much revenue actually moved, so a small-Δ year
//    can't dominate. On the Costco snapshot in this repo the three candidates diverge
//    materially (-3.26% aggregate, -5.25% median, -8.41% latest), which is precisely why the
//    choice is stated rather than defaulted.
//
// 2. Seeding is REFUSED outright on an unstable history, rather than downgraded to a caution.
//    Two triggers: the observations change sign (the company both consumed and released
//    working capital as it grew, so no single ratio describes it), or their spread exceeds a
//    multiple of the aggregate's own magnitude. A refused row is left blank with the evidence
//    still shown - never silently backfilled with the latest observation or a zero.
export { NWC_NET_GROSS_MOVEMENT_FLOOR }

// The Driver-mode call to action appended to an NWC note. Split out from the reason itself so
// another surface can state why the history was downgraded without also telling the analyst to
// edit a driver row that only exists in Driver-Based mode - see baseYearRepresentativeness.js.
// `note` remains exactly the string Driver mode has always rendered.
const NWC_DRIVER_ACTION = 'Review the observations and enter your own assumption.'

const withReason = (reason, rest, action = NWC_DRIVER_ACTION) => ({
  ...rest,
  reason,
  note: action ? `${reason} ${action}` : reason,
})

function classifyNwc(observations) {
  if (observations.length < MIN_OBSERVATIONS) {
    return {
      reference: null,
      referenceStatistic: null,
      reliability: 'insufficient',
      seedable: false,
      ...(observations.length === 0
        ? withReason(
            'No usable observations - Δ NWC or a material revenue change is missing from the sourced history.',
            {},
            null
          )
        : withReason(
            'Only one usable observation - too thin to establish a working-capital run rate.',
            {},
            'Enter this driver manually.'
          )),
    }
  }

  const deltas = observations.map((o) => o.deltaRevenue)
  const sumDeltaNwc = observations.reduce((total, o) => total + o.changeInNwc, 0)
  const sumDeltaRevenue = deltas.reduce((total, d) => total + d, 0)
  const grossDeltaRevenue = deltas.reduce((total, d) => total + Math.abs(d), 0)

  // Denominator integrity is settled before the ratios are looked at: a compromised
  // denominator makes the aggregate itself meaningless, so saying "too dispersed" about it
  // would describe the wrong problem. No reference is reported in either case - an inflated
  // aggregate is not evidence of anything, and displaying one would invite exactly the
  // copy-across this refusal exists to prevent. The annual observations are still shown.
  if (Math.min(...deltas) < 0 && Math.max(...deltas) > 0) {
    return {
      reference: null,
      referenceStatistic: null,
      reliability: 'unstable',
      seedable: false,
      ...withReason(
        'Revenue rose in some years and fell in others, so the cumulative revenue change is a residue of larger movements in both directions and an aggregate ratio against it is not meaningful.',
        {}
      ),
    }
  }
  if (sumDeltaRevenue === 0 || !Number.isFinite(sumDeltaRevenue)) {
    return {
      reference: null,
      referenceStatistic: null,
      reliability: 'insufficient',
      seedable: false,
      ...withReason('Revenue changes over the window net to zero, so an aggregate ratio is undefined.', {}, null),
    }
  }
  if (Math.abs(sumDeltaRevenue) < NWC_NET_GROSS_MOVEMENT_FLOOR * grossDeltaRevenue) {
    return {
      reference: null,
      referenceStatistic: null,
      reliability: 'unstable',
      seedable: false,
      ...withReason(
        `Net cumulative revenue change is only ${((Math.abs(sumDeltaRevenue) / grossDeltaRevenue) * 100).toFixed(0)}% of the gross annual movements, so the aggregate denominator is a small residue and the ratio it produces is not meaningful.`,
        {}
      ),
    }
  }

  const aggregate = (sumDeltaNwc / sumDeltaRevenue) * 100
  if (!Number.isFinite(aggregate)) {
    return {
      reference: null,
      referenceStatistic: null,
      reliability: 'insufficient',
      seedable: false,
      ...withReason('The aggregate working-capital ratio is not a finite number.', {}, null),
    }
  }

  const values = observations.map((o) => o.value)
  const spread = Math.max(...values) - Math.min(...values)
  const signFlips = Math.min(...values) < 0 && Math.max(...values) > 0
  if (signFlips) {
    return {
      reference: aggregate,
      referenceStatistic: 'aggregate',
      reliability: 'unstable',
      seedable: false,
      ...withReason(
        'History changes sign - working capital was both consumed and released as revenue grew, so no single ratio describes it.',
        {}
      ),
    }
  }
  if (spread > NWC_INSTABILITY_SPREAD_MULTIPLE * Math.abs(aggregate)) {
    return {
      reference: aggregate,
      referenceStatistic: 'aggregate',
      reliability: 'unstable',
      seedable: false,
      ...withReason(
        `History spans ${spread.toFixed(1)}pp against an aggregate of ${aggregate.toFixed(1)}%, so the aggregate is not representative.`,
        {}
      ),
    }
  }
  return {
    reference: aggregate,
    referenceStatistic: 'aggregate',
    reliability: observations.length === THIN_OBSERVATIONS ? 'thin' : 'ok',
    seedable: true,
    ...(observations.length === THIN_OBSERVATIONS
      ? withReason('Only two usable observations - a thin basis for a working-capital assumption.', {}, null)
      : { reason: null, note: null }),
  }
}

// The book-rate-versus-EBIT disclosure described at TAX_EBIT_DIVERGENCE_THRESHOLD above.
// Returns null when the latest period doesn't diverge materially, or can't be measured.
function taxProxyCaution(latestPeriod) {
  const ebit = latestPeriod?.ebit
  const pretax = latestPeriod?.pretax_income
  if (!isFiniteNumber(ebit) || !isFiniteNumber(pretax) || ebit === 0) return null
  const divergence = Math.abs(pretax - ebit) / Math.abs(ebit)
  if (divergence <= TAX_EBIT_DIVERGENCE_THRESHOLD) return null
  return `Pre-tax income differs from EBIT by ${(divergence * 100).toFixed(0)}% in the latest period, so the book effective rate is a weaker proxy for tax on EBIT here.`
}

/**
 * Builds the full historical evidence set for all six drivers from already-sourced company
 * periods. Never fetches, never fabricates: a driver with no usable observations comes back
 * empty and unseedable rather than carrying a filled-in guess.
 *
 * `observations` are returned OLDEST-FIRST (the opposite of `companyData.periods`) because
 * their only consumer renders them left-to-right as a chronological strip.
 */
export function driverHistory(companyData) {
  const periods = companyData?.periods
  const empty = {
    periodCount: 0,
    drivers: Object.fromEntries(DRIVER_FIELDS.map((field) => [field, emptyDriver()])),
  }
  if (!Array.isArray(periods) || periods.length === 0) return empty

  const built = {
    revenueGrowthRate: revenueGrowthObservations(periods),
    ebitMargin: levelRatioObservations(periods, 'ebit'),
    taxRate: taxRateObservations(periods),
    daPctOfRevenue: levelRatioObservations(periods, 'depreciation_and_amortization'),
    capexPctOfRevenue: levelRatioObservations(periods, 'capital_expenditures', { rejectNegative: true }),
    nwcInvestmentPct: nwcObservations(periods),
  }

  const drivers = {}
  for (const field of DRIVER_FIELDS) {
    const { observations, excluded } = built[field]
    const classified =
      field === 'nwcInvestmentPct'
        ? classifyNwc(observations)
        : classify(observations, median(observations.map((o) => o.value)), 'median')
    drivers[field] = {
      // Oldest-first for display; the source `periods` array is newest-first.
      observations: [...observations].reverse(),
      excluded: [...excluded].reverse(),
      ...classified,
    }
  }

  const caution = taxProxyCaution(periods[0])
  if (caution) {
    drivers.taxRate = {
      ...drivers.taxRate,
      note: drivers.taxRate.note ? `${drivers.taxRate.note} ${caution}` : caution,
    }
  }

  return { periodCount: periods.length, drivers }
}

// Seeded values are written into the same string-valued cells the analyst types into, so
// they round-trip through scenarios, comparison, and buildDriverPayload with no special
// casing anywhere. Two decimals is enough for every driver this app models (D&A at 0.87% of
// revenue is the tightest) without implying spurious precision.
export function formatSeedValue(percent) {
  if (!Number.isFinite(percent)) return ''
  return String(Math.round(percent * 100) / 100)
}

// Plain-language description of where a driver's reference statistic came from, shown in the
// Initialize Forecast plan so the analyst approves a stated method rather than a bare number.
// Periods are named by the calendar year their fiscal year ENDS in ("FYE 2021-2025") rather
// than as fiscal-year labels, which would be an inference this module has no basis to make -
// see forecastYearLabels for the same restraint applied to forecast columns.
export function referenceBasisLabel(driver) {
  if (!driver || driver.observations.length === 0) return 'no usable observations'
  if (driver.reference == null) return 'no usable reference statistic'
  const statistic = driver.referenceStatistic === 'aggregate' ? 'aggregate Sum-Delta-NWC over Sum-Delta-Revenue' : 'median'
  const years = driver.observations
    .map((o) => (typeof o.fiscalYearEnd === 'string' ? o.fiscalYearEnd.slice(0, 4) : null))
    .filter(Boolean)
  const span = years.length > 1 ? `, FYE ${years[0]}-${years[years.length - 1]}` : years.length === 1 ? `, FYE ${years[0]}` : ''
  const count = driver.observations.length
  return `${statistic} of ${count} observation${count === 1 ? '' : 's'}${span}`
}
