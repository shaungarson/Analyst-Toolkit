// Where enterprise value comes from: the present value of each explicit forecast year, and
// the present value of terminal value.
//
// This module owns the ONE rule for reporting terminal value's contribution to enterprise
// value. Both the composition chart and Explain This Valuation read it from here, so the two
// can never state different things about the same number - which they previously did, the
// observation suppressing exactly the out-of-range case the chart exists to show.

const isFinite_ = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * Terminal value's and the explicit period's contributions to enterprise value.
 *
 * **The rule.** A percentage contribution is reported whenever enterprise value is finite and
 * strictly positive - *including* contributions above 100% or below 0%, which are real
 * whenever the explicit period's own present value is negative (a reinvestment-heavy forecast
 * reaches this with every driver in a normal range). Where enterprise value is zero, negative
 * or non-finite, **no percentage is claimed at all**: a share of nothing is not a smaller
 * share, and a share of a negative denominator inverts the intuitive reading rather than
 * describing it.
 *
 * **Contribution language, not "the remaining X%".** At 118% terminal and −18% explicit,
 * "the remaining" is simply false. Both halves are stated as contributions instead, which
 * stays true across the whole sign range.
 *
 * **The explicit aggregate is `enterprise_value − pv_terminal_value`, never the sum of the
 * per-year present values.** The backend rounds each forecast row's `present_value` and
 * `enterprise_value` independently from the unrounded figures, so summing the rows can miss
 * enterprise value by a few cents and the two contributions would not reconcile to exactly
 * 100%. Deriving the aggregate from the same two rounded numbers the rest of the UI shows
 * makes the reconciliation exact by construction. The per-year rows are still what the annual
 * bars plot - they are the detail, not the total.
 *
 * Returns null when there is nothing well-defined to report.
 */
export function valueContribution(results) {
  if (!results) return null
  const ev = results.enterprise_value
  const pvTv = results.pv_terminal_value
  if (!isFinite_(ev) || !isFinite_(pvTv)) return null

  const explicit = ev - pvTv
  const reportable = ev > 0

  return {
    enterpriseValue: ev,
    terminalValue: pvTv,
    explicitValue: explicit,
    // Null rather than a number wherever a percentage would be meaningless. Callers must
    // handle this - it is the whole point of the rule.
    terminalPct: reportable ? (pvTv / ev) * 100 : null,
    explicitPct: reportable ? (explicit / ev) * 100 : null,
    reportable,
  }
}

/**
 * Geometry for the aggregate contribution reading, as signed percentages of enterprise value
 * laid out on one axis with a real zero line.
 *
 * Deliberately NOT a clamped 100% stack. A conventional stack can only render two
 * same-signed parts summing to the whole, so it would have to either clip −18% to zero or
 * rescale 118% down to fit - both of which draw a picture that is not the number. Instead the
 * axis spans the full signed range actually present, both segments are drawn from the zero
 * line in the direction of their own sign, and a mixed-sign case therefore *looks* mixed.
 *
 * Returns null when no percentage may be claimed.
 */
export function contributionGeometry(contribution) {
  if (!contribution || !contribution.reportable) return null

  const parts = [
    { key: 'explicit', pct: contribution.explicitPct, value: contribution.explicitValue },
    { key: 'terminal', pct: contribution.terminalPct, value: contribution.terminalValue },
  ]
  // The axis always contains 0 and 100, so a plain 0-100 case is drawn at full width and a
  // mixed-sign case extends the axis rather than compressing the parts into it.
  const lo = Math.min(0, ...parts.map((p) => p.pct))
  const hi = Math.max(100, ...parts.map((p) => p.pct))
  const span = hi - lo || 1
  const zeroPct = ((0 - lo) / span) * 100

  return {
    zeroPct,
    axisMin: lo,
    axisMax: hi,
    parts: parts.map((part) => {
      const from = Math.min(0, part.pct)
      const to = Math.max(0, part.pct)
      return {
        ...part,
        leftPct: ((from - lo) / span) * 100,
        widthPct: (Math.abs(to - from) / span) * 100,
        negative: part.pct < 0,
      }
    }),
  }
}

/**
 * The per-year present values the annual bars plot, oldest forecast year first. Rows are
 * returned as given - no re-derivation, no re-rounding, and no substitution of a computed
 * value for one the backend already reported.
 */
export function annualPresentValues(results) {
  if (!results || !Array.isArray(results.forecast)) return []
  return results.forecast.map((row) => ({
    year: row.year,
    presentValue: isFinite_(row.present_value) ? row.present_value : null,
    fcf: isFinite_(row.fcf) ? row.fcf : null,
  }))
}
