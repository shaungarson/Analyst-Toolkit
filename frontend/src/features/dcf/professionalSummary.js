import { DRIVER_FIELD_LABELS } from './driverSchedule.js'

// Pure derivations behind the DCF Professional Summary - a compact, print-oriented decision
// artifact. Everything here reads values the workspace has already computed or received; nothing
// re-runs a valuation, re-derives a ratio, or calls an endpoint. That is the same discipline
// explainValuation.js follows, and for the same reason: a summary that recomputes is a second
// implementation that can disagree with the first.
//
// The summary serves BOTH forecast modes from one component. That is not a convenience - the two
// result payloads are the same shape (enterprise_value, equity_value, value_per_share,
// terminal_value, pv_terminal_value, terminal_growth_warnings) because both modes hand their
// schedule to one valuation core. They differ in exactly two places: the assumptions that produced
// the schedule, and which warning list is populated.

const TIER_SEVERITY = { extreme: 2, high: 1, caution: 0 }

/** Highest-severity-first, stable within a tier. Mirrors the backend's own _TIER_SEVERITY. */
function byTierDescending(a, b) {
  return (TIER_SEVERITY[b.tier] ?? -1) - (TIER_SEVERITY[a.tier] ?? -1)
}

/**
 * Every result-specific warning the active run produced, most severe first.
 *
 * Deliberately not filtered or capped. The Analysis Outputs milestone established that
 * result-specific warnings stay visible in every state, and a printed artifact is exactly where
 * silently dropping one would do the most damage - the reader has no workspace to check against.
 * If that makes the summary run to a second page, it runs to a second page.
 *
 * Driver warnings carry a forecast year; the other two lists do not. `year` is passed through
 * untouched so the renderer can say which year without this module inventing a label for it.
 */
export function materialWarnings(results) {
  if (!results) return []
  const lists = [
    results.terminal_growth_warnings,
    results.fcf_growth_warnings,
    results.driver_warnings,
  ]
  const all = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const w of list) {
      if (w) all.push({ id: w.id, tier: w.tier, explanation: w.explanation, year: w.year ?? null })
    }
  }
  return all.sort(byTierDescending)
}

/**
 * The extremes of the WACC x terminal-growth grid, across VALID cells only.
 *
 * Cells where WACC is at or below terminal growth are null - outside Gordon Growth's valid range -
 * and including them would either crash on a null or, worse, report a bound the model never
 * produced. Returns null when the grid has no valid cell at all.
 *
 * This is a *tested range*: the span of values the grid actually computed. It is not a confidence
 * interval, a distribution, or a probability statement, and the renderer must not present it as
 * one - the grid tests a rectangle of assumptions someone chose, and says nothing about how likely
 * any corner is.
 */
export function sensitivityRange(sensitivity) {
  const growthRates = sensitivity?.terminal_growth_rates
  const rows = sensitivity?.rows
  if (!Array.isArray(growthRates) || !Array.isArray(rows)) return null

  let low = null
  let high = null
  let validCells = 0
  for (const row of rows) {
    const values = row?.value_per_share_by_growth
    if (!Array.isArray(values)) continue
    values.forEach((value, i) => {
      if (value == null || !Number.isFinite(value)) return
      validCells += 1
      const cell = { valuePerShare: value, wacc: row.wacc, terminalGrowth: growthRates[i] }
      if (low === null || value < low.valuePerShare) low = cell
      if (high === null || value > high.valuePerShare) high = cell
    })
  }
  if (validCells === 0) return null
  return { low, high, validCells }
}

const isFilledNumber = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))

/**
 * A truthful one-line characterisation of one driver's forecast path.
 *
 * Derived from the ACTUAL per-year values, with the row mode carried only as a label. Describing a
 * Custom row as "Custom (5 years)" would conceal every intermediate assumption in it, and reading
 * a Flat/Fade row from its mode rather than its cells would misreport a row whose values no longer
 * match the mode that generated them.
 *
 * - every year equal        -> { shape: 'flat', start }
 * - otherwise               -> { shape: 'path', start, end, min, max }
 *
 * `min`/`max` are always reported for a path, because a row that starts at 8% and ends at 2% can
 * still peak at 14% in between, and the endpoints alone would hide it.
 */
export function driverPathSummary(driverYears, field, rowMode) {
  if (!Array.isArray(driverYears) || driverYears.length === 0) return null
  const raw = driverYears.map((year) => year?.[field])
  if (!raw.every(isFilledNumber)) return null

  const values = raw.map(Number)
  const start = values[0]
  const end = values[values.length - 1]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const label = DRIVER_FIELD_LABELS[field] ?? field

  if (min === max) {
    return { field, label, mode: rowMode ?? null, shape: 'flat', start, end: start, min, max, years: values.length }
  }
  return { field, label, mode: rowMode ?? null, shape: 'path', start, end, min, max, years: values.length }
}

/** All six drivers, in the canonical order the schedule itself uses. */
export function driverPathSummaries(driverYears, rowModes) {
  return Object.keys(DRIVER_FIELD_LABELS)
    .map((field) => driverPathSummary(driverYears, field, rowModes?.[field]))
    .filter(Boolean)
}

/**
 * How many of the latest period's fields came from where - the provenance context that has to
 * survive once the page is separated from the live workspace and its Sources inspector.
 *
 * A count, not an inspector: the reader of a printed page cannot click a tag, and reproducing
 * per-field detail would defeat the artifact. What they can act on is "these figures are SEC-
 * sourced except two that fell back to a market-data provider", plus the filing period and a
 * pointer to the filings themselves.
 */
export function provenanceSummary(companyData) {
  const latest = companyData?.periods?.[0]
  if (!latest?.provenance) return null

  const counts = { reported: 0, combined: 0, calculated: 0, fallback: 0 }
  for (const entry of Object.values(latest.provenance)) {
    if (entry?.status && entry.status in counts) counts[entry.status] += 1
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  if (total === 0) return null

  return {
    counts,
    total,
    fiscalYearEnd: latest.fiscal_year_end ?? null,
    periodSource: latest.source ?? null,
    fundamentalsProvider: companyData?.source?.fundamentals_provider ?? null,
    marketDataProvider: companyData?.source?.market_data_provider ?? null,
    secFilingsUrl: companyData?.profile?.sec_filings_url ?? null,
  }
}

/**
 * The model's value against the reference price, or null when no usable price exists.
 *
 * Available in BOTH modes and computed identically, because it is arithmetic over two numbers
 * rather than anything mode-specific. This is deliberately the whole of Driver mode's price
 * comparison: Quick DCF additionally solves for the growth rate that reconciles the price, and
 * Driver mode has no single scalar to solve for. The Revenue Growth x EBIT Margin grid was
 * considered as a Driver-mode analogue and rejected - it varies two of six drivers, so bracketing
 * a price on it would describe what the price implies about those two while silently holding the
 * other four fixed, which is a claim the surface cannot support.
 */
export function referenceComparison({ referencePrice, referencePriceDate, valuePerShare }) {
  const price = Number(referencePrice)
  if (!Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(valuePerShare)) return null
  const asOf = String(referencePriceDate ?? '').trim()
  if (!asOf) return null

  const impliedPct = (valuePerShare / price - 1) * 100
  return {
    price,
    asOf,
    impliedPct,
    direction: impliedPct >= 0 ? 'upside' : 'downside',
  }
}

/**
 * How the solved price-implied growth rate compares with the analyst's own FCF growth
 * assumption, as a signed percentage-point clause - or null when no analyst rate is usable.
 *
 * Always relevant when both exist, unlike the historical CAGR comparison, which is withheld
 * whenever working-capital history makes that CAGR an unreliable benchmark. The analyst's own
 * assumption is the thing the reader is actually being asked to judge, so a summary that reports
 * a price-implied rate without it leaves the comparison to be done in the reader's head.
 *
 * "matches ... to displayed precision" rather than "0.0 percentage points above", derived from
 * the same one-decimal rounding the artifact prints, so wording and figure cannot disagree - the
 * same rule explainValuation.js applies.
 */
export function analystGrowthComparison(impliedPct, analystRate) {
  const analystPct = Number(analystRate)
  if (analystRate === '' || analystRate == null || !Number.isFinite(analystPct)) return null
  if (!Number.isFinite(impliedPct)) return null

  const diff = impliedPct - analystPct
  const rounded = Math.abs(diff).toFixed(1)
  const assumption = `the ${analystPct.toFixed(2)}%/yr assumption in this valuation`
  if (rounded === '0.0') return `matches ${assumption} to displayed precision`
  return `is ${rounded} percentage points ${diff >= 0 ? 'above' : 'below'} ${assumption}`
}
