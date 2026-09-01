import { compactCurrency } from '../../lib/format'

// Pure CSS, no chart library - matches the same convention as ValueBridge (proportional
// div-width bars) and the sensitivity heatmap (background-tinted cells). Height is fixed in
// px; every horizontal position is a percentage, so the chart is fluid at any column width
// (narrow desktop Step 1 column, full-width mobile) without a breakpoint of its own.
const PLOT_HEIGHT_PX = 44
const MIN_BAR_PX = 2
const MIN_BAR_PCT = (MIN_BAR_PX / PLOT_HEIGHT_PX) * 100

const METRICS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'unlevered_fcf', label: 'Unlevered FCF' },
]

// Evenly spaced bar-center positions (0-100%) for n periods - shared by both metric charts
// and the year-label strip below them, so all three line up on the same fiscal-year grid.
function slotPercents(count) {
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100)
}

// Bar geometry as CSS top/height percentages within the plot, extending away from the
// zero baseline in the correct direction - up for positive, down for negative, a small
// centered tick for exactly zero (so a real zero value still reads as "present," not as
// nothing). `value` is never null here; null periods are filtered out before this is
// called, which is what keeps a missing year from ever rendering as a zero-height bar.
function barStyle(value, domainMin, domainMax) {
  const range = domainMax - domainMin || 1
  const baselinePct = ((domainMax - 0) / range) * 100
  if (value === 0) {
    return { top: `calc(${baselinePct}% - ${MIN_BAR_PX / 2}px)`, height: `${MIN_BAR_PX}px` }
  }
  const valueTopPct = ((domainMax - value) / range) * 100
  if (value > 0) {
    const heightPct = Math.max(baselinePct - valueTopPct, MIN_BAR_PCT)
    return { top: `${baselinePct - heightPct}%`, height: `${heightPct}%` }
  }
  const heightPct = Math.max(valueTopPct - baselinePct, MIN_BAR_PCT)
  return { top: `${baselinePct}%`, height: `${heightPct}%` }
}

// One metric's mini chart. Falls back to plain text rather than a chart when fewer than
// two fiscal years actually have a value for this metric - a single bar (or none) isn't a
// trend, and a chart implying one would be actively misleading.
function MiniBarChart({ label, values, fiscalYears, slotPcts, barWidthPct }) {
  const usable = values.filter((v) => v !== null)

  if (usable.length < 2) {
    return (
      <div className="trend-chart-block">
        <div className="trend-chart-head">
          <span className="trend-chart-title">{label}</span>
        </div>
        <p className="trend-chart-empty">Not enough history to chart.</p>
      </div>
    )
  }

  const domainMin = Math.min(0, ...usable)
  const domainMax = Math.max(0, ...usable)
  const range = domainMax - domainMin || 1
  const baselinePct = ((domainMax - 0) / range) * 100

  // Not hover-only: this is the chart's real accessible label (role="img" + aria-label),
  // read by assistive tech regardless of pointer input. The SVG-free markup underneath is
  // aria-hidden so its bars aren't announced a second time as unlabeled generic content.
  const summary = values
    .map((v, i) => `${fiscalYears[i]} ${v === null ? 'n/a' : compactCurrency(v)}`)
    .join(', ')

  return (
    <div className="trend-chart-block">
      <div className="trend-chart-head">
        <span className="trend-chart-title">{label}</span>
        <span className="trend-chart-range">
          {compactCurrency(Math.min(...usable))} to {compactCurrency(Math.max(...usable))}
        </span>
      </div>
      <div
        className="trend-chart-plot"
        role="img"
        aria-label={`${label} by fiscal year: ${summary}`}
      >
        <div className="trend-chart-baseline" style={{ top: `${baselinePct}%` }} aria-hidden="true" />
        {values.map((v, i) =>
          v === null ? null : (
            <div
              key={fiscalYears[i]}
              className={v < 0 ? 'trend-chart-bar trend-chart-bar--negative' : 'trend-chart-bar'}
              style={{ left: `${slotPcts[i]}%`, width: `${barWidthPct}%`, ...barStyle(v, domainMin, domainMax) }}
              title={`FY ${fiscalYears[i]}: ${compactCurrency(v)}`}
              aria-hidden="true"
            />
          ),
        )}
      </div>
    </div>
  )
}

// Two stacked mini charts (Revenue, Unlevered FCF) sharing one fiscal-year timeline -
// deliberately not a dual-axis chart, since Revenue and UFCF are different orders of
// magnitude and a shared scale would visually flatten UFCF into a nearly straight line.
// Reads only `periods`, already present on `companyData` for both a live ticker load and
// the embedded Costco demo - no network request of its own. Renders nothing at all below
// two periods, matching the same threshold the "N-yr history" toggle already uses.
function HistoricalTrendCharts({ periods }) {
  if (periods.length < 2) return null

  // periods is newest-first (the API/demo-snapshot convention); charts read left-to-right
  // oldest-to-newest, so the array is reversed once here for every consumer below.
  const chronological = [...periods].reverse()
  const fiscalYears = chronological.map((p) => p.fiscal_year_end.slice(0, 4))
  const slotPcts = slotPercents(chronological.length)
  const barWidthPct = (100 / chronological.length) * 0.55

  return (
    <div className="trend-charts">
      {METRICS.map(({ key, label }) => (
        <MiniBarChart
          key={key}
          label={label}
          values={chronological.map((p) => (p[key] === null || p[key] === undefined ? null : p[key]))}
          fiscalYears={fiscalYears}
          slotPcts={slotPcts}
          barWidthPct={barWidthPct}
        />
      ))}
      <div className="trend-chart-year-strip" aria-hidden="true">
        {fiscalYears.map((y, i) => (
          <span key={y} className="trend-chart-year-label" style={{ left: `${slotPcts[i]}%` }} title={y}>
            &rsquo;{y.slice(2)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default HistoricalTrendCharts
