// Pure helpers for Driver-Based DCF's per-year driver table: resizing the year array to the
// shared forecast length, the "type once, override any year" broadcast workflow, building
// the API payload, and the read-only "Last Actual" historical reference row. No React here -
// all state lives in DcfValuation.jsx; these functions only transform plain data.

export const EMPTY_DRIVER_YEAR = {
  revenueGrowthRate: '',
  ebitMargin: '',
  taxRate: '',
  daPctOfRevenue: '',
  capexPctOfRevenue: '',
  nwcInvestmentPct: '',
}

// Resizes driverYears to exactly targetLength, preserving every existing year's values.
// Growing clones the last existing row (or EMPTY_DRIVER_YEAR if there isn't one yet) into
// each new trailing year - a reasonable starting point the analyst can then edit, not a
// guess at what they'd want. Shrinking truncates from the end, never touching earlier years.
export function resizeDriverYears(driverYears, targetLength) {
  const n = Math.max(0, Math.floor(targetLength) || 0)
  if (n === driverYears.length) return driverYears
  if (n < driverYears.length) return driverYears.slice(0, n)
  const template = driverYears.length > 0 ? driverYears[driverYears.length - 1] : EMPTY_DRIVER_YEAR
  const added = Array.from({ length: n - driverYears.length }, () => ({ ...template }))
  return [...driverYears, ...added]
}

// "Type once, override any year": overwrites `field` on every year with `value`. A one-time
// broadcast action, not a live-bound default - the analyst can freely edit any individual
// year afterward without the broadcast fighting them, since nothing tracks "was this
// broadcast" after the fact.
export function broadcastDriverField(driverYears, field, value) {
  return driverYears.map((year) => ({ ...year, [field]: value }))
}

// Analyst-facing names for each driver field, used by driverInputsError to say exactly which
// cells are missing. Unit-free on purpose - the table's own row labels (DriverScheduleBuilder)
// carry the "(%)" / "(%/yr)" suffixes that make sense above a column of inputs but only add
// noise inside a sentence listing what's blank.
export const DRIVER_FIELD_LABELS = {
  revenueGrowthRate: 'Revenue Growth',
  ebitMargin: 'EBIT Margin',
  taxRate: 'Tax Rate',
  daPctOfRevenue: 'D&A (% of Revenue)',
  capexPctOfRevenue: 'CapEx (% of Revenue)',
  nwcInvestmentPct: 'NWC Investment (% of Δ Revenue)',
}

// True only when a cell holds a number the analyst actually entered. Deliberately not
// `Number(v)` on its own: Number('') and Number('   ') are both 0, which is exactly how a
// blank cell would otherwise reach the API as a deliberate 0% assumption and be valued as
// one. A genuinely typed zero ('0', '0.0', '-0') stays valid - the point is to separate
// "not filled in" from "filled in as zero", never to reject zero itself.
function isFilledNumber(value) {
  if (value == null) return false
  const trimmed = String(value).trim()
  if (trimmed === '') return false
  return Number.isFinite(Number(trimmed))
}

// How many missing cells to name before summarizing the rest - an empty 15-year schedule has
// 90 of them, and a message listing all 90 is no more actionable than one listing five.
const MAX_LISTED_MISSING = 5

// The shared assumption fields buildDriverPayload also converts. These live outside the
// driver table but reach the API through the same Number() coercion, so a blank one is
// exactly as dangerous: a missing Terminal Growth Rate becomes 0%, and a missing Net Debt
// becomes $0 - both of which the backend accepts as entirely valid inputs, so nothing
// downstream would ever catch them. That produces a confident, wrong valuation rather than
// an error, which is the worst of the available outcomes.
export const SHARED_FIELD_LABELS = {
  wacc: 'WACC',
  terminalGrowthRate: 'Terminal Growth Rate',
  netDebt: 'Net Debt',
  dilutedSharesOutstanding: 'Diluted Shares Outstanding',
}

// Returns a specific, analyst-readable message naming what still needs filling in, or null
// when every value buildDriverPayload converts is present and numeric. A non-null result is a
// hard stop *before* any request is made - a blank input is a missing assumption, not a zero,
// and the backend deliberately has no bound left that would catch one (per CLAUDE.md's
// Financial Validation Principle, the removed hard bounds were the right thing to remove;
// completeness is a different question from economic plausibility, and only the first is
// decided here - whether a genuinely entered value is computationally acceptable stays the
// backend's call).
//
// Covers exactly the set buildDriverPayload converts, no more and no less: Base Year Revenue,
// the four shared assumptions, and every driver cell. Shared fields are listed before the
// per-year cells so they stay visible within the cap even when the whole table is empty.
export function driverInputsError(baseYearRevenue, driverYears, sharedForm) {
  if (!Array.isArray(driverYears) || driverYears.length === 0) {
    return 'Set a Forecast Period (years) above, then fill in the driver schedule before running a valuation.'
  }
  const missing = []
  if (!isFilledNumber(baseYearRevenue)) missing.push('Base Year Revenue')
  for (const [field, label] of Object.entries(SHARED_FIELD_LABELS)) {
    if (!isFilledNumber(sharedForm?.[field])) missing.push(label)
  }
  driverYears.forEach((year, i) => {
    for (const [field, label] of Object.entries(DRIVER_FIELD_LABELS)) {
      if (!isFilledNumber(year?.[field])) missing.push(`${label} (Year ${i + 1})`)
    }
  })
  if (missing.length === 0) return null

  const shown = missing.slice(0, MAX_LISTED_MISSING)
  const remainder = missing.length - shown.length
  const list = remainder > 0 ? `${shown.join(', ')}, and ${remainder} more` : shown.join(', ')
  return `The driver inputs are incomplete - a blank field is not treated as 0. Fill in: ${list}.`
}

// Converts driverForm + the shared assumption fields into the /api/dcf/driver-* request
// body. Percent fields are entered as whole numbers (e.g. "8" for 8%), matching every
// existing DCF percent input in this app - divided by 100 here, the one place that happens.
//
// Enforces completeness itself rather than trusting each caller to remember a separate
// pre-check. Callers still validate first so they can surface the message in their own UI
// before firing anything, but this throw is what actually makes "a blank never reaches
// Number()" an invariant of the function instead of a convention every future caller has to
// know about - and the failure mode it guards against is silent, not loud.
export function buildDriverPayload(baseYearRevenue, driverYears, sharedForm) {
  const incomplete = driverInputsError(baseYearRevenue, driverYears, sharedForm)
  if (incomplete) throw new Error(incomplete)
  return {
    base_year_revenue: Number(baseYearRevenue),
    driver_years: driverYears.map((year) => ({
      revenue_growth_rate: Number(year.revenueGrowthRate) / 100,
      ebit_margin: Number(year.ebitMargin) / 100,
      tax_rate: Number(year.taxRate) / 100,
      da_pct_of_revenue: Number(year.daPctOfRevenue) / 100,
      capex_pct_of_revenue: Number(year.capexPctOfRevenue) / 100,
      nwc_investment_pct_of_revenue_change: Number(year.nwcInvestmentPct) / 100,
    })),
    wacc: Number(sharedForm.wacc) / 100,
    terminal_growth_rate: Number(sharedForm.terminalGrowthRate) / 100,
    net_debt: Number(sharedForm.netDebt),
    diluted_shares_outstanding: Number(sharedForm.dilutedSharesOutstanding),
  }
}

// One ratio for the read-only "Last Actual" reference row: numerator/denominator as
// percentages of a shared base, guarded against every way this can go wrong - a missing
// input, a zero or non-finite denominator, or a non-finite result. Never fabricates, never
// divides by zero, never displays Infinity/NaN - returns null (rendered as "n/a") instead.
function safeRatioPct(numerator, denominator) {
  if (numerator == null || denominator == null) return null
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (denominator === 0) return null
  const ratio = (numerator / denominator) * 100
  return Number.isFinite(ratio) ? ratio : null
}

// The "Last Actual" row shown above the driver table for context: what the most recent two
// sourced periods imply for each driver, purely informational and never sent to the API.
// Every cell is independently guarded (see safeRatioPct) - one missing or unusable field
// never corrupts a sibling cell's figure.
//
// Delta NWC here is the sourced *flow* (`change_in_nwc`, the period's dollar change in net
// working capital, exactly as CompanySourcedData already labels it "Δ NWC") - never the
// balance-sheet NWC figure the UFCF formula's own components describe. The NWC-investment
// ratio divides that flow by the revenue flow (Δ Revenue) over the same span - flow over
// flow, matching the driver input's own definition exactly.
export function lastActualDriverReference(companyData) {
  const periods = companyData?.periods
  if (!periods || periods.length < 2) {
    return {
      revenueGrowthPct: null,
      marginPct: null,
      taxRatePct: null,
      daPct: null,
      capexPct: null,
      nwcInvestmentPct: null,
    }
  }
  const latest = periods[0]
  const prior = periods[1]
  const deltaRevenue =
    latest.revenue != null && prior.revenue != null ? latest.revenue - prior.revenue : null
  // effective_tax_rate is already a resolved ratio (income tax expense / pretax income, per
  // MODELING_CONVENTIONS.md - undefined whenever pretax income isn't positive), not something
  // this function derives itself - just guarded and converted to a percentage like every
  // other cell here.
  const taxRatePct =
    latest.effective_tax_rate != null && Number.isFinite(latest.effective_tax_rate)
      ? latest.effective_tax_rate * 100
      : null

  return {
    revenueGrowthPct: safeRatioPct(deltaRevenue, prior.revenue),
    marginPct: safeRatioPct(latest.ebit, latest.revenue),
    taxRatePct,
    daPct: safeRatioPct(latest.depreciation_and_amortization, latest.revenue),
    capexPct: safeRatioPct(latest.capital_expenditures, latest.revenue),
    nwcInvestmentPct: safeRatioPct(latest.change_in_nwc, deltaRevenue),
  }
}
