const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

// A geometric CAGR between the oldest and newest available period for `field` (e.g.
// "unlevered_fcf" or "revenue") - endpoint-based by definition, the same convention real
// equity research uses, so an interior dip or spike doesn't disqualify it. Elapsed time is
// computed from the actual fiscal_year_end dates, not periods.length - 1: a company's fiscal
// calendar can shift by a few days year to year (Costco's 52/53-week calendar is a real
// example already in this codebase), so "5 periods" isn't reliably "4 years" to the day.
// Returns null - never a misleading number - when either endpoint is missing, zero, or
// negative (a negative or zero base/end value has no real-valued geometric growth rate), or
// when the endpoints' fiscal dates don't leave any positive elapsed time between them (e.g.
// a single period, or two periods dated identically). No minimum span - such as a full
// year - is enforced beyond that; a sub-year gap between real fiscal dates still computes.
export function historicalCagr(periods, field) {
  if (!periods || periods.length < 2) return null

  const newest = periods[0]
  const oldest = periods[periods.length - 1]
  const newestValue = newest?.[field]
  const oldestValue = oldest?.[field]
  if (newestValue == null || oldestValue == null || newestValue <= 0 || oldestValue <= 0) {
    return null
  }

  const newestDate = new Date(newest.fiscal_year_end)
  const oldestDate = new Date(oldest.fiscal_year_end)
  const years = (newestDate - oldestDate) / MS_PER_YEAR
  if (!(years > 0)) return null

  return {
    cagr: (newestValue / oldestValue) ** (1 / years) - 1,
    oldestFiscalYearEnd: oldest.fiscal_year_end,
    newestFiscalYearEnd: newest.fiscal_year_end,
  }
}
