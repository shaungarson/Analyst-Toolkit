// Pure helpers for the history-to-forecast continuity chart.
//
// The question this chart answers is whether the forecast is a plausible continuation of what
// the company actually reported - so it plots NOMINAL figures on both sides. Discounting is
// the composition chart's question; mixing the two would make a forecast look like it decays
// when it is only being discounted.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * Historical actuals for one metric, oldest first, paired with fiscal-year labels.
 *
 * `periods` arrives newest-first (the API and demo-snapshot convention). Periods missing this
 * metric are dropped entirely rather than carried as nulls: a gap inside a bar chart is
 * meaningful, but a gap in the run-up to a forecast handoff just pushes the boundary around.
 * Each metric is therefore gated on its own usable observations - a company can report revenue
 * for a period whose unlevered FCF could not be constructed.
 */
export function historicalSeries(periods, key) {
  if (!Array.isArray(periods)) return []
  return [...periods]
    .reverse()
    .filter((p) => isNum(p?.[key]) && typeof p?.fiscal_year_end === 'string')
    .map((p) => ({ label: `FY${p.fiscal_year_end.slice(2, 4)}`, value: p[key], actual: true }))
}

/**
 * Forecast values for one metric, oldest first, using whatever labels the caller supplies -
 * real fiscal years (FY2027E) where the sourced period supports one unambiguously, generic
 * Year 1…N where it does not. Same rule, and the same helper, the Driver Schedule uses.
 */
export function forecastSeries(forecast, key, labels) {
  if (!Array.isArray(forecast)) return []
  return forecast.map((row, i) => ({
    label: labels?.[i] ?? `Year ${row.year ?? i + 1}`,
    value: isNum(row?.[key]) ? row[key] : null,
    actual: false,
  }))
}

/**
 * One metric's full series, or null when there is no handoff to draw.
 *
 * **The gate is one usable actual plus at least one forecast value.** Not two actuals: the
 * two-period minimum belongs to HistoricalTrendCharts, which draws a historical *trend* and
 * genuinely needs two points to have one. A handoff needs only a point to hand off from.
 */
export function continuitySeries({ periods, forecast, historicalKey, forecastKey, labels }) {
  const actuals = historicalSeries(periods, historicalKey)
  const projected = forecastSeries(forecast, forecastKey, labels)
  const usableForecast = projected.filter((p) => p.value !== null)
  if (actuals.length < 1 || usableForecast.length < 1) return null

  return {
    points: [...actuals, ...projected],
    actualCount: actuals.length,
    forecastCount: projected.length,
    // Where the divider sits, as a fraction of the whole series - the boundary between the
    // last reported year and the first projected one.
    boundaryIndex: actuals.length,
  }
}
