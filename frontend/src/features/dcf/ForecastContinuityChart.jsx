import { compactCurrency } from '../../lib/format'
import { barStyle, baselinePercent, signedDomain, slotPercents } from './barGeometry.js'
import { continuitySeries } from './forecastContinuity.js'

// Reported actuals and the analyst's forecast on one axis, with a hard break between them.
// The check this supports is the one every reviewer makes by eye: does the forecast continue
// the history, or hockey-stick off it?
//
// Nominal on both sides, deliberately - see forecastContinuity.js. Solid bars are reported
// figures, outlined bars are forecast, and the divider plus the Reported/Forecast legend mean
// the distinction never rests on fill alone - which is also what keeps it legible in print,
// where both go black.
//
// Every plotted figure is visible text in the value strip, not only an aria-label or a title:
// "readable without hover" has to hold for sighted users too.

const PLOT_HEIGHT_PX = 72

function ContinuityMetric({ label, series }) {
  const values = series.points.map((p) => p.value)
  const usable = values.filter((v) => v !== null)
  const { min, max } = signedDomain(values)
  const slots = slotPercents(series.points.length)
  const barWidthPct = (100 / series.points.length) * 0.55
  // Sits between the last actual and the first forecast slot.
  const dividerPct = (series.boundaryIndex / series.points.length) * 100

  const summary = series.points
    .map(
      (p) =>
        `${p.label} ${p.value === null ? 'n/a' : compactCurrency(p.value)}${p.actual ? '' : ' (forecast)'}`,
    )
    .join(', ')

  return (
    <div className="continuity-metric">
      <div className="continuity-subhead">
        <span className="continuity-subtitle">{label}</span>
        <span className="continuity-range">
          {compactCurrency(Math.min(...usable))} to {compactCurrency(Math.max(...usable))}
        </span>
      </div>

      {/* Below 720px the plot and its value strip scroll together inside this container, with
          a minimum width per point. The value strip is the only way a sighted user reads exact
          figures without hovering, so it must never be allowed to collide - measured at 320px,
          a ten-point series collided on 19 of 20 labels with four pushed out of bounds, and a
          five-year history against a fifteen-year forecast leaves 16px per label. Panning
          keeps every figure legible and the handoff visible, the same treatment every wide
          table here already uses. Print forces this back to visible so nothing is ever
          clipped on paper. */}
      <div className="continuity-scroll">
        <div className="continuity-track" style={{ '--point-count': series.points.length }}>
          <div
            className="continuity-plot"
            style={{ height: `${PLOT_HEIGHT_PX}px` }}
            role="img"
            aria-label={`${label}, reported then forecast: ${summary}`}
          >
            <div
              className="continuity-baseline"
              style={{ top: `${baselinePercent(min, max)}%` }}
              aria-hidden="true"
            />
            <div
              className="continuity-divider"
              style={{ left: `${dividerPct}%` }}
              aria-hidden="true"
            />
            {series.points.map((point, i) =>
              point.value === null ? null : (
                <div
                  key={`${point.label}-${i}`}
                  className={[
                    'continuity-bar',
                    point.actual ? 'continuity-bar--actual' : 'continuity-bar--forecast',
                    point.value < 0 ? 'continuity-bar--negative' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left: `${slots[i]}%`,
                    width: `${barWidthPct}%`,
                    ...barStyle(point.value, min, max, { plotHeightPx: PLOT_HEIGHT_PX }),
                  }}
                  aria-hidden="true"
                />
              ),
            )}
          </div>

          <div className="continuity-value-strip" aria-hidden="true">
            <div className="continuity-divider-strip" style={{ left: `${dividerPct}%` }} />
            {series.points.map((point, i) => (
              <span
                key={`${point.label}-${i}`}
                className="continuity-value"
                style={{ left: `${slots[i]}%` }}
              >
                <span className="continuity-value-label">{point.label}</span>
                <span
                  className={
                    point.value !== null && point.value < 0
                      ? 'continuity-value-amount value-negative'
                      : 'continuity-value-amount'
                  }
                >
                  {point.value === null ? 'n/a' : compactCurrency(point.value)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Reported history against the forecast, per metric, each gated independently.
 *
 * Unlevered FCF is available in both forecast modes - it is the only metric that exists on
 * both sides in both, since Quick DCF projects FCF directly and carries no revenue at all.
 * Revenue is added in Driver mode, where the projection builds it explicitly.
 *
 * A metric needs one usable reported observation and one forecast value to be drawn, and each
 * is checked on its own - a company can report revenue for a period whose unlevered FCF could
 * not be constructed from the filing. One observation is deliberately enough: the two-period
 * minimum belongs to HistoricalTrendCharts, which draws a historical *trend* and needs two
 * points to have one, whereas a handoff needs only a point to hand off from.
 */
function ForecastContinuityChart({ periods, results, yearLabels, forecastMode }) {
  const forecast = results?.forecast
  const metrics = [
    {
      key: 'ufcf',
      label: 'Unlevered FCF',
      series: continuitySeries({
        periods,
        forecast,
        historicalKey: 'unlevered_fcf',
        forecastKey: 'fcf',
        labels: yearLabels,
      }),
    },
  ]

  if (forecastMode === 'driver') {
    metrics.unshift({
      key: 'revenue',
      label: 'Revenue',
      series: continuitySeries({
        periods,
        forecast,
        historicalKey: 'revenue',
        forecastKey: 'revenue',
        labels: yearLabels,
      }),
    })
  }

  const drawable = metrics.filter((m) => m.series !== null)
  if (drawable.length === 0) return null

  return (
    <div className="continuity">
      <h3 id="dcf-continuity-heading">Reported History to Forecast</h3>
      <p className="continuity-intro">
        Reported figures and this forecast on one axis, so a forecast that breaks from the
        company&rsquo;s own history is visible rather than inferred. Both sides are nominal
        &mdash; these are not discounted; that is the composition view beside the Value Bridge.
      </p>
      <p className="continuity-legend">
        <span className="continuity-key continuity-key--actual" aria-hidden="true" /> Reported
        <span className="continuity-key continuity-key--forecast" aria-hidden="true" /> Forecast
      </p>
      {drawable.map(({ key, label, series }) => (
        <ContinuityMetric key={key} label={label} series={series} />
      ))}
    </div>
  )
}

export default ForecastContinuityChart
