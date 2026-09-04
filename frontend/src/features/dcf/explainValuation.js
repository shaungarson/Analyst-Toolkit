import { valueContribution } from './valueComposition.js'

const dollarsPerShare = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// A signed percentage-point gap as a full predicate clause ("is X.X percentage points
// above/below Y"), or, when the difference rounds to 0.0 at the same one-decimal precision
// actually displayed, "matches Y to displayed precision" instead - "0.0 percentage points
// above" would misleadingly imply a direction that isn't really there. Derived from the same
// toFixed(1) call used for display, not a separately hand-picked threshold, so the wording
// and the displayed number can never disagree with each other.
function gapClause(diff, label) {
  const rounded = Math.abs(diff).toFixed(1)
  if (rounded === '0.0') {
    return `matches ${label} to displayed precision`
  }
  return `is ${rounded} percentage points ${diff >= 0 ? 'above' : 'below'} ${label}`
}

// "Explain This Valuation": up to three deterministic observations synthesized from outputs
// the forward DCF, reverse DCF, sensitivity grid, and historical-CAGR helper already compute.
// No change to the valuation engine or methodology - only presentation-level differences,
// ratios, and ranges over already-returned numbers. Each observation gates independently on
// its own inputs' current-ness, matching the app's existing independent forward/reverse
// invalidation - this function never assumes both are current just because one is. Returns
// [] when nothing qualifies; callers should render nothing in that case, not a placeholder.
export function explainValuation({
  showActiveResults,
  activeResults,
  activeSensitivity,
  showReverseResult,
  reverseResult,
  historicalFcfCagr,
  fcfGrowthRate,
  forecastYears,
}) {
  const observations = []

  // 1. Price-implied growth vs. the analyst's own case and historical UFCF CAGR, as plain
  // percentage-point differences - no "materially/somewhat" bands. An exact number lets the
  // analyst judge materiality themselves without this app inventing a threshold to defend
  // later (see CLAUDE.md's standing lesson on economic-judgment labels dressed as something
  // more objective). Gates on showReverseResult (reverse's own current-ness) only - never on
  // the forward result's staleness, since this comparison doesn't read activeResults at all.
  if (showReverseResult && reverseResult.status === 'solved') {
    const impliedPct = reverseResult.implied_fcf_growth_rate * 100
    const analystPct = Number(fcfGrowthRate)
    const analystAvailable = fcfGrowthRate !== '' && Number.isFinite(analystPct)
    const historicalAvailable = historicalFcfCagr != null

    if (analystAvailable || historicalAvailable) {
      const parts = []
      if (analystAvailable) {
        parts.push(gapClause(impliedPct - analystPct, `the ${analystPct.toFixed(1)}%/yr case`))
      }
      if (historicalAvailable) {
        const histPct = historicalFcfCagr.cagr * 100
        const span =
          `FY${historicalFcfCagr.oldestFiscalYearEnd.slice(0, 4)}` +
          `–FY${historicalFcfCagr.newestFiscalYearEnd.slice(0, 4)}`
        parts.push(
          gapClause(impliedPct - histPct, `the ${span} historical UFCF CAGR (${histPct.toFixed(1)}%/yr)`)
        )
      }
      observations.push({
        id: 'price-implied-growth-gap',
        text: `Price-implied growth (${impliedPct.toFixed(1)}%/yr) ${parts.join(' and ')}.`,
      })
    }
  }

  // 2. Terminal value's contribution to enterprise value - states only what the ratio
  // actually supports (where the value comes from), never a sensitivity claim the ratio alone
  // can't prove. The rule itself lives in valueComposition.js, shared with the composition
  // chart so the two can never disagree about the same number.
  //
  // Previously this suppressed any share outside [0, 1] as "confusing." That hid a real and
  // informative case: when the explicit period's own present value is negative, terminal value
  // genuinely does exceed 100% of a smaller enterprise value, and a reinvestment-heavy
  // forecast reaches it with every driver in a normal range. It is now reported, in
  // contribution language - "the remaining X%" is simply false at 118% and -18%, whereas two
  // contributions stay true across the whole sign range. What is still never claimed is a
  // percentage against a zero, negative or non-finite enterprise value.
  //
  // Explicit-period length is read from forecastYears, never hardcoded.
  if (showActiveResults) {
    const contribution = valueContribution(activeResults)
    if (contribution && contribution.reportable) {
      const years = Number(forecastYears)
      const yearsLabel = Number.isFinite(years) && years > 0 ? `${years}-year` : 'explicit'
      observations.push({
        id: 'terminal-value-share',
        text:
          `Terminal value contributes ${contribution.terminalPct.toFixed(0)}% of enterprise ` +
          `value; the explicit ${yearsLabel} forecast period contributes ` +
          `${contribution.explicitPct.toFixed(0)}%.`,
      })
    }
  }

  // 3. Sensitivity range relative to the base case - downside (base to grid minimum) and
  // upside (base to grid maximum), both in dollars and, when the base value is a usable
  // positive reference, as a percent of it. No "highly sensitive" label - the numbers speak
  // for themselves. Shares forward's current-ness (activeSensitivity is fetched alongside
  // the forward result in the same Run Valuation click), plus its own check that at least one
  // grid cell is non-null (a cell is null when it falls outside Gordon Growth's convergence
  // domain).
  if (showActiveResults && activeSensitivity) {
    const gridValues = activeSensitivity.rows.flatMap((row) =>
      row.value_per_share_by_growth.filter((v) => v !== null)
    )
    if (gridValues.length > 0) {
      const gridMin = Math.min(...gridValues)
      const gridMax = Math.max(...gridValues)
      const base = activeResults.value_per_share
      // Clamped at 0: base is the grid's own center cell by construction (see
      // docs/decisions.md), so it should never fall outside [gridMin, gridMax] - this is a
      // defensive floor against float-rounding at the boundary, not an expected case.
      const downside = Math.max(0, base - gridMin)
      const upside = Math.max(0, gridMax - base)
      const baseUsable = Number.isFinite(base) && base > 0

      const text = baseUsable
        ? `Relative to the current base-case value per share (${dollarsPerShare(base)}), the ` +
          `tested WACC × terminal growth grid ranges from ${dollarsPerShare(gridMin)} ` +
          `(${dollarsPerShare(downside)} / ${((downside / base) * 100).toFixed(0)}% downside) to ` +
          `${dollarsPerShare(gridMax)} (${dollarsPerShare(upside)} / ` +
          `${((upside / base) * 100).toFixed(0)}% upside).`
        : `The tested WACC × terminal growth grid ranges from ${dollarsPerShare(gridMin)} to ` +
          `${dollarsPerShare(gridMax)} - a percent-of-base comparison isn't shown because the ` +
          `current base-case value per share isn't a usable positive reference.`

      observations.push({ id: 'sensitivity-range', text })
    }
  }

  return observations
}
