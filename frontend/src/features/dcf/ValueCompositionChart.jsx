import { compactCurrency } from '../../lib/format'
import { barStyle, baselinePercent, signedDomain, slotPercents } from './barGeometry.js'
import { annualPresentValues, contributionGeometry, valueContribution } from './valueComposition.js'

// Two readings, deliberately not one scale. Terminal value is routinely 70-90% of enterprise
// value, so annual present values and the terminal figure differ by an order of magnitude:
// drawn together, the five annual bars collapse into slivers and the annual breakdown - the
// only thing this chart adds over the existing terminal-value observation - becomes
// decorative. The same reasoning HistoricalTrendCharts already applies to Revenue vs UFCF.
//
//   1. Annual present values, on their own signed scale.
//   2. The aggregate explicit-vs-terminal contribution to enterprise value, on a signed axis.
//
// Reading 2 is NOT a clamped 100% stack. A stack can only draw two same-signed parts summing
// to the whole, so a -18% / 118% case would have to be clipped or rescaled - drawing a
// picture that is not the number. The axis spans the signed range actually present and each
// segment runs from the zero line in its own direction, so a mixed-sign case looks mixed.
//
// Values are visible text beside every bar, not only an aria-label or a title: "readable
// without hover" has to hold for sighted users too.

const PLOT_HEIGHT_PX = 72

function AnnualPresentValues({ rows, yearLabels }) {
  const values = rows.map((r) => r.presentValue)
  const usable = values.filter((v) => v !== null)
  if (usable.length === 0) return null

  const { min, max } = signedDomain(values)
  const slots = slotPercents(rows.length)
  const barWidthPct = (100 / rows.length) * 0.55
  const summary = rows
    .map((r, i) => `${yearLabels[i]} ${r.presentValue === null ? 'n/a' : compactCurrency(r.presentValue)}`)
    .join(', ')

  return (
    <div className="composition-annual">
      <div className="composition-subhead">
        <span className="composition-subtitle">Present value by forecast year</span>
        <span className="composition-range">
          {compactCurrency(Math.min(...usable))} to {compactCurrency(Math.max(...usable))}
        </span>
      </div>
      {/* Same reasoning as the continuity chart: a fifteen-year forecast leaves ~21px per
          label at 320px, and the value strip is the without-hover channel for sighted users.
          Print forces this back to visible so nothing is ever clipped on paper. */}
      <div className="composition-scroll">
        <div className="composition-track" style={{ '--point-count': rows.length }}>
          <div
            className="composition-plot"
            style={{ height: `${PLOT_HEIGHT_PX}px` }}
            role="img"
            aria-label={`Present value by forecast year: ${summary}`}
          >
            <div
              className="composition-baseline"
              style={{ top: `${baselinePercent(min, max)}%` }}
              aria-hidden="true"
            />
            {rows.map((row, i) =>
              row.presentValue === null ? null : (
                <div
                  key={row.year}
                  className={
                    row.presentValue < 0
                      ? 'composition-bar composition-bar--negative'
                      : 'composition-bar'
                  }
                  style={{
                    left: `${slots[i]}%`,
                    width: `${barWidthPct}%`,
                    ...barStyle(row.presentValue, min, max, { plotHeightPx: PLOT_HEIGHT_PX }),
                  }}
                  aria-hidden="true"
                />
              ),
            )}
          </div>

          <div className="composition-value-strip" aria-hidden="true">
            {rows.map((row, i) => (
              <span key={row.year} className="composition-value" style={{ left: `${slots[i]}%` }}>
                <span className="composition-value-label">{yearLabels[i]}</span>
                <span
                  className={
                    row.presentValue < 0
                      ? 'composition-value-amount value-negative'
                      : 'composition-value-amount'
                  }
                >
                  {row.presentValue === null ? 'n/a' : compactCurrency(row.presentValue)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ContributionAxis({ contribution, forecastYearCount }) {
  const geometry = contributionGeometry(contribution)
  const explicitLabel =
    forecastYearCount > 0 ? `Explicit ${forecastYearCount}-year forecast` : 'Explicit forecast'

  if (!geometry) {
    // No percentage may be claimed against a zero, negative or non-finite enterprise value -
    // a share of nothing is not a smaller share. The dollar components are still stated,
    // because they are real; only the proportion is withheld.
    return (
      <div className="composition-aggregate">
        <div className="composition-subhead">
          <span className="composition-subtitle">Contribution to enterprise value</span>
        </div>
        <p className="composition-unavailable">
          Enterprise value is {compactCurrency(contribution.enterpriseValue)}, so no percentage
          contribution is stated &mdash; a proportion of a zero or negative total would invert the
          reading rather than describe it. {explicitLabel}:{' '}
          {compactCurrency(contribution.explicitValue)}; terminal value:{' '}
          {compactCurrency(contribution.terminalValue)}.
        </p>
      </div>
    )
  }

  const rows = [
    { key: 'explicit', label: explicitLabel },
    { key: 'terminal', label: 'Terminal value' },
  ]

  return (
    <div className="composition-aggregate">
      <div className="composition-subhead">
        <span className="composition-subtitle">Contribution to enterprise value</span>
        <span className="composition-range">{compactCurrency(contribution.enterpriseValue)} total</span>
      </div>
      <div className="composition-contrib">
        {rows.map(({ key, label }) => {
          const part = geometry.parts.find((p) => p.key === key)
          return (
            <div key={key} className="composition-contrib-row">
              <span className="composition-contrib-label">{label}</span>
              <div className="composition-contrib-track" aria-hidden="true">
                <div
                  className="composition-contrib-zero"
                  style={{ left: `${geometry.zeroPct}%` }}
                />
                <div
                  className={
                    part.negative
                      ? `composition-contrib-bar composition-contrib-bar--${key} composition-contrib-bar--negative`
                      : `composition-contrib-bar composition-contrib-bar--${key}`
                  }
                  style={{ left: `${part.leftPct}%`, width: `${Math.max(part.widthPct, 0.6)}%` }}
                />
              </div>
              <span className={part.negative ? 'composition-contrib-pct value-negative' : 'composition-contrib-pct'}>
                {part.pct.toFixed(0)}%
              </span>
              <span className="composition-contrib-amount">{compactCurrency(part.value)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Where enterprise value comes from, sitting directly above the Value Bridge - which begins at
 * Enterprise Value as a given and never shows what produced it. Together the two are a
 * complete chain: annual cash flows -> present values -> enterprise value -> equity value ->
 * value per share.
 *
 * Reads only figures already in the valuation response. No re-derivation of a present value,
 * and the aggregate explicit contribution comes from `enterprise_value - pv_terminal_value`
 * rather than from summing the rounded forecast rows, so the two contributions reconcile to
 * exactly 100% - see valueComposition.js.
 */
function ValueCompositionChart({ results, yearLabels }) {
  const contribution = valueContribution(results)
  if (!contribution) return null

  const rows = annualPresentValues(results)
  const labels =
    Array.isArray(yearLabels) && yearLabels.length === rows.length
      ? yearLabels
      : rows.map((r) => `Year ${r.year}`)

  return (
    <div className="composition">
      <h3 id="dcf-composition-heading">Where Enterprise Value Comes From</h3>
      {rows.length > 0 && <AnnualPresentValues rows={rows} yearLabels={labels} />}
      <ContributionAxis contribution={contribution} forecastYearCount={rows.length} />
      <p className="assumptions">
        Two readings on two scales rather than one: terminal value is typically several times
        any single forecast year&rsquo;s present value, so a shared scale would flatten the
        annual detail into slivers. The lower reading is a signed axis, not a stacked bar
        &mdash; where the explicit period&rsquo;s present value is negative, terminal value
        genuinely contributes more than 100% of enterprise value, and that is drawn as it is
        rather than clipped to fit.
      </p>
    </div>
  )
}

export default ValueCompositionChart
