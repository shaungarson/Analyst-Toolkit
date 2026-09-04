// The signed-baseline bar geometry shared by this module's charts. Extracted from
// HistoricalTrendCharts.jsx once a third consumer existed, and deliberately no wider than
// that: this is four pure functions about positioning a bar against a zero line, not a
// charting layer. Everything chart-specific - scales, labels, tone classes, what a bar means -
// stays with its own chart, exactly as driverTornado.js's note said it should.
//
// Pure CSS percentages, no SVG and no library, matching ValueBridge, the sensitivity heatmap
// and the tornado.

const DEFAULT_PLOT_HEIGHT_PX = 44
const DEFAULT_MIN_BAR_PX = 2

/**
 * Evenly spaced bar-centre positions (0-100%) for n slots. Shared by a chart's bars and its
 * label strip so both land on the same grid.
 */
export function slotPercents(count) {
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100)
}

/**
 * The plotted domain for a set of values, always including zero so the baseline is real
 * rather than implied. Nulls are ignored - a missing observation is a gap, never a zero.
 * Returns { min, max } with min <= 0 <= max.
 */
export function signedDomain(values) {
  const usable = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v))
  return { min: Math.min(0, ...usable, 0), max: Math.max(0, ...usable, 0) }
}

/** Where the zero line sits, as a percentage from the top of the plot. */
export function baselinePercent(domainMin, domainMax) {
  const range = domainMax - domainMin || 1
  return ((domainMax - 0) / range) * 100
}

/**
 * Bar geometry as CSS top/height percentages within the plot, extending away from the zero
 * baseline in the correct direction - up for positive, down for negative, and a small centred
 * tick for exactly zero, so a real zero still reads as "present" rather than as nothing.
 *
 * `value` must not be null: a missing observation is filtered out before this is called,
 * which is what keeps a gap from rendering as a zero-height bar in the wrong place.
 */
export function barStyle(value, domainMin, domainMax, options = {}) {
  const { minBarPx = DEFAULT_MIN_BAR_PX, plotHeightPx = DEFAULT_PLOT_HEIGHT_PX } = options
  const minBarPct = (minBarPx / plotHeightPx) * 100
  const range = domainMax - domainMin || 1
  const basePct = baselinePercent(domainMin, domainMax)

  if (value === 0) {
    return { top: `calc(${basePct}% - ${minBarPx / 2}px)`, height: `${minBarPx}px` }
  }
  const valueTopPct = ((domainMax - value) / range) * 100
  if (value > 0) {
    const heightPct = Math.max(basePct - valueTopPct, minBarPct)
    return { top: `${basePct - heightPct}%`, height: `${heightPct}%` }
  }
  const heightPct = Math.max(valueTopPct - basePct, minBarPct)
  return { top: `${basePct}%`, height: `${heightPct}%` }
}
