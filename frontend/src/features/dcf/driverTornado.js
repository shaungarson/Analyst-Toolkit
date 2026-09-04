// Pure presentation helpers for the Driver-Based sensitivity tornado. Deliberately
// chart-specific rather than a general charting layer: this is the app's first bespoke SVG-
// free ranked-bar chart, and a second chart hasn't yet proved what would actually be shared.
// Extract a common layer when there is a real second consumer, not before.
//
// Nothing here re-derives a valuation. Every number is read from the /api/dcf/driver-tornado
// response, which computes its own base case alongside the twelve perturbations - the
// frontend never reconstructs or re-rounds a base value per share to measure deltas against.

// Backend driver keys -> the same row labels the schedule builder already uses, so the chart
// and the input grid can never disagree about what a driver is called.
export const TORNADO_DRIVER_LABELS = {
  revenue_growth_rate: 'Revenue Growth',
  ebit_margin: 'EBIT Margin',
  tax_rate: 'Tax Rate',
  da_pct_of_revenue: 'D&A (% of Revenue)',
  capex_pct_of_revenue: 'CapEx (% of Revenue)',
  nwc_investment_pct_of_revenue_change: 'NWC Investment (% of Δ Revenue)',
}

// Percentages here are driver rates (a fraction of 1), formatted to two decimals to match
// the schedule builder's own cells rather than format.js's generic `percent`. Exported
// because the growth x margin grid describes the same driver paths in the same terms - a
// deliberately narrow shared formatter, not the start of a general charting layer.
export const formatDriverRate = (v) => `${(v * 100).toFixed(2)}%`
const rate = formatDriverRate

const EPSILON = 1e-9

/**
 * Describes the driver path that was actually tested, in the only terms that are true for
 * that path's shape. A single "base -> perturbed" pair is meaningful only for a genuinely
 * flat row; a Fade or Custom row has no single base value to perturb, so it gets its real
 * path summarized instead and relies on the chart's own "±1pp is applied to every forecast
 * year" disclosure. Never invents a representative value (an average or a first year) to
 * stand in for a varying schedule.
 */
export function summarizeTestedPath(path, shift) {
  if (!Array.isArray(path) || path.length === 0) return ''

  const first = path[0]
  const last = path[path.length - 1]
  const isFlat = path.every((v) => Math.abs(v - first) < EPSILON)
  if (isFlat) {
    return `Flat ${rate(first)} · tested ${rate(first - shift)} and ${rate(first + shift)}`
  }

  const years = `${path.length} years`
  const nonIncreasing = path.every((v, i) => i === 0 || v <= path[i - 1] + EPSILON)
  const nonDecreasing = path.every((v, i) => i === 0 || v >= path[i - 1] - EPSILON)
  if (nonIncreasing || nonDecreasing) {
    return `${rate(first)} → ${rate(last)} over ${years}`
  }
  // A Custom row can move both directions, where "first → last" would imply a trend the
  // schedule doesn't have. Report the range instead of a direction that isn't there.
  return `Varies ${rate(Math.min(...path))}–${rate(Math.max(...path))} over ${years}`
}

/**
 * The largest absolute delta anywhere in the chart. Every row is drawn against this one
 * shared scale, so bar lengths are comparable across rows - which is the entire point of
 * ranking them. Returns 0 when nothing is computable or every delta is exactly zero.
 */
export function tornadoScale(rows) {
  const magnitudes = rows
    .flatMap((row) => [row.down_delta, row.up_delta])
    .filter((d) => d !== null && d !== undefined && Number.isFinite(d))
    .map(Math.abs)
  return magnitudes.length ? Math.max(...magnitudes) : 0
}

// A bar this short is still visibly present. A delta that is genuinely zero renders no bar
// at all rather than a minimum-width one - "this driver moved nothing" and "this driver
// moved a little" must not look identical, the same rule the historical trend charts apply
// to a zero versus a missing value.
const MIN_BAR_PCT = 0.6

/**
 * Bar geometry as CSS percentages within a track whose zero line sits at the centre (50%).
 * Positive deltas extend right, negative left. Returns null when there is no bar to draw -
 * a null (uncomputable) side, a zero delta, or a degenerate scale.
 *
 * Note what this deliberately does NOT do: it never assumes the -1pp bar goes left and the
 * +1pp bar goes right. Each bar's direction comes from the sign of its own delta, so the
 * two endpoints of one driver can legitimately point the same way - which happens for real
 * in this engine (NWC investment in a declining-revenue year, revenue growth against a
 * negative-revenue year, or any driver sitting on the max(EBIT, 0) tax kink).
 */
export function barGeometry(delta, maxAbs) {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return null
  if (maxAbs <= 0 || delta === 0) return null

  const halfWidthPct = (Math.abs(delta) / maxAbs) * 50
  const widthPct = Math.max(halfWidthPct, MIN_BAR_PCT)
  return delta > 0
    ? { leftPct: 50, widthPct, direction: 'up' }
    : { leftPct: 50 - widthPct, widthPct, direction: 'down' }
}

// Short, human names for the driver warnings a perturbed endpoint can newly introduce. The
// backend's own `explanation` is a full sentence meant to be read on its own; these are the
// compact form that fits beside a number in a table cell.
export const ENDPOINT_WARNING_LABELS = {
  non_positive_base_year_revenue: 'Non-positive base year revenue',
  tax_rate_outside_0_100_percent: 'Tax rate outside 0-100%',
  negative_da_percent: 'Negative D&A %',
  negative_capex_percent: 'Negative CapEx %',
  zero_revenue_lock: 'Revenue locked at zero',
  negative_revenue: 'Negative revenue',
  non_positive_terminal_year_fcf: 'Non-positive final-year FCF',
}

/**
 * Which forecast years a newly introduced warning affects, compressed for display. A flat
 * driver row trips its warning in every year at once, so the common case has to read as one
 * short range rather than a list. Year 0 denotes the base year, never "year zero".
 */
export function formatWarningYears(years) {
  if (!Array.isArray(years) || years.length === 0) return ''
  if (years.length === 1) return years[0] === 0 ? 'base year' : `yr ${years[0]}`
  if (years.includes(0)) {
    return `yrs ${years.map((y) => (y === 0 ? 'base year' : y)).join(', ')}`
  }
  const contiguous = years.every((y, i) => i === 0 || y === years[i - 1] + 1)
  return contiguous
    ? `yrs ${years[0]}-${years[years.length - 1]}`
    : `yrs ${years.join(', ')}`
}
