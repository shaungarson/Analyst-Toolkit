import {
  ENDPOINT_WARNING_LABELS,
  TORNADO_DRIVER_LABELS,
  barGeometry,
  formatWarningYears,
  summarizeTestedPath,
  tornadoScale,
} from './driverTornado'

// Built as a real <table> with a bar column rather than as a standalone graphic, which is
// how the sensitivity heatmap already works here. The consequence that matters: every
// endpoint value, delta and newly-triggered warning is real text in a real cell, so nothing
// is hover-only, the native table structure IS the accessible presentation (row header,
// column headers, cells - no parallel visually-hidden summary duplicating what the table
// already announces), and the whole thing survives print with its data intact. Only the bars
// are aria-hidden: they are a second reading of the numbers beside them, not the data.
//
// Bars are positioned in CSS percentages against a track whose zero line sits at the plot's
// centre, the same library-free approach as HistoricalTrendCharts and ValueBridge. No SVG, no
// animation, and no shared charting layer - see driverTornado.js on why this stays
// chart-specific until a second chart proves what is actually reusable.

const dollars = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// Signed, so a delta always reads as a movement rather than as a level.
const signedDollars = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dollars(Math.abs(v))}`

// A standardized shift can move a driver into territory the model itself warns about - a
// company whose D&A runs under 1% of revenue has a negative D&A percentage at -1pp. The
// endpoint is valued and shown rather than clamped or skipped, so it has to carry the
// warning visibly: tier, short name and affected years are all real text, with the engine's
// full sentence available as supplementary detail rather than as the only channel.
function EndpointWarnings({ warnings }) {
  if (warnings.length === 0) return null
  return (
    <span className="tornado-endpoint-warnings">
      {warnings.map((warning) => (
        <span
          key={warning.id}
          className={`tornado-endpoint-warning tornado-endpoint-warning--${warning.tier}`}
          title={warning.explanation}
        >
          <span className="tornado-endpoint-warning-tier">{warning.tier}</span>
          <span className="tornado-endpoint-warning-text">
            {ENDPOINT_WARNING_LABELS[warning.id] ?? warning.id} ({formatWarningYears(warning.years)})
          </span>
        </span>
      ))}
    </span>
  )
}

function EndpointCell({ value, delta, newWarnings }) {
  if (value === null || value === undefined) {
    return (
      <td className="tornado-endpoint tornado-endpoint--null">
        <span className="tornado-endpoint-value">n/a</span>
        <span className="tornado-endpoint-delta">not computable</span>
      </td>
    )
  }
  return (
    <td className={newWarnings.length > 0 ? 'tornado-endpoint tornado-endpoint--warned' : 'tornado-endpoint'}>
      <span className="tornado-endpoint-value">{dollars(value)}</span>
      <span
        className={
          delta > 0
            ? 'tornado-endpoint-delta value-positive'
            : delta < 0
              ? 'tornado-endpoint-delta value-negative'
              : 'tornado-endpoint-delta'
        }
      >
        {delta === 0 ? 'no change' : signedDollars(delta)}
      </span>
      <EndpointWarnings warnings={newWarnings} />
    </td>
  )
}

// One driver's two tested endpoints, drawn in their own half-height lanes. Two lanes rather
// than one bar spanning endpoint to endpoint, because the two endpoints can legitimately
// land on the same side of base - a single spanning bar would either hide that or draw the
// two on top of each other. Each lane's direction comes from the sign of its own delta.
function BarCell({ row, maxAbs, pp }) {
  const lanes = [
    { key: 'down', label: `−${pp}`, delta: row.down_delta },
    { key: 'up', label: `+${pp}`, delta: row.up_delta },
  ]
  return (
    <td className="tornado-bars" aria-hidden="true">
      <div className="tornado-track">
        <div className="tornado-zero-line" />
        {lanes.map(({ key, label, delta }) => {
          const bar = barGeometry(delta, maxAbs)
          return (
            <div key={key} className={`tornado-lane tornado-lane--${key}`}>
              <span className="tornado-lane-label">{label}</span>
              {/* The bar is positioned against this plot area rather than the whole lane,
                  so a bar reaching the far left of the scale can never cover the lane's own
                  label - the label sits in its own gutter beside the plot, not on top of
                  it. The track's zero line is offset by the same gutter width to stay
                  aligned with these plots. */}
              <div className="tornado-lane-plot">
                {bar && (
                  <div
                    className={`tornado-bar tornado-bar--${bar.direction}`}
                    style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </td>
  )
}

/**
 * Standardized ±1pp sensitivity for the six operating drivers, one at a time, every other
 * driver and every valuation assumption held at the base case. Renders the backend's row
 * order as given - the ordering rule (complete rows by descending tested range, then
 * one-sided rows by available delta, then neither) is decided and tested server-side rather
 * than re-derived here.
 */
function DriverTornadoChart({ tornado }) {
  if (!tornado || tornado.rows.length === 0) return null

  const { rows, shift, base_value_per_share: baseValue } = tornado
  const maxAbs = tornadoScale(rows)
  const pp = `${(shift * 100).toFixed(0)}pp`
  const anyWarned = rows.some(
    (row) => row.down_new_warnings.length > 0 || row.up_new_warnings.length > 0,
  )

  return (
    <div className="tornado">
      <h3 id="driver-tornado-heading">
        Driver Sensitivity: Value per Share at &plusmn;{pp} per Driver
      </h3>
      <p className="tornado-base">
        Base case {dollars(baseValue)}/share. Each row shifts one driver by &plusmn;{pp} in
        every forecast year, holding all other drivers, WACC, terminal growth, net debt and
        share count constant.
      </p>

      <div className="table-wrap">
        <table className="tornado-table" aria-labelledby="driver-tornado-heading">
          <thead>
            <tr>
              <th scope="col">Driver</th>
              <th scope="col" className="tornado-bars-head">
                Change from base
              </th>
              <th scope="col">&minus;{pp}</th>
              <th scope="col">+{pp}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.driver} className={row.complete ? undefined : 'tornado-row--incomplete'}>
                <th scope="row" className="tornado-driver">
                  <span className="tornado-driver-name">
                    {TORNADO_DRIVER_LABELS[row.driver] ?? row.driver}
                    {!row.complete && (
                      <span className="tornado-incomplete-badge" title="One direction could not be computed">
                        incomplete
                      </span>
                    )}
                  </span>
                  <span className="tornado-driver-path">
                    {summarizeTestedPath(row.base_path, shift)}
                  </span>
                </th>
                <BarCell row={row} maxAbs={maxAbs} pp={pp} />
                <EndpointCell
                  value={row.down_value_per_share}
                  delta={row.down_delta}
                  newWarnings={row.down_new_warnings}
                />
                <EndpointCell
                  value={row.up_value_per_share}
                  delta={row.up_delta}
                  newWarnings={row.up_new_warnings}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {anyWarned && (
        <p className="assumptions">
          A marked endpoint is one where the standardized shift moves that driver into
          territory the model itself flags &mdash; a company whose D&amp;A runs under 1% of
          revenue, for instance, has a negative D&amp;A percentage at &minus;{pp}. Those
          endpoints are valued and shown as tested, never clamped to a more comfortable value
          or quietly dropped, since substituting a different assumption than the stated
          &plusmn;{pp} would make the whole comparison unreliable. Warnings the base case
          already raises are not repeated here.
        </p>
      )}

      <p className="assumptions">
        Rows are ranked by the spread across the base value and both tested endpoints, not by
        the distance between the endpoints alone &mdash; the two agree whenever the endpoints
        straddle the base case, but a driver whose two directions both move value the same way
        would otherwise be ranked as though it moved nothing. That case is real rather than
        hypothetical: NWC investment is a percentage of the year-over-year <em>change</em> in
        revenue, so in a declining-revenue year a higher percentage releases cash instead of
        consuming it.
      </p>
      <p className="assumptions">
        All six drivers are shifted in every forecast year. Revenue growth still stands apart,
        because it compounds the revenue base into each later year &mdash; and so into the
        final year terminal value is built from &mdash; while the other rate drivers apply to
        each year&rsquo;s own revenue without carrying forward. A &plusmn;{pp} shift is also not
        the same proportional move for every driver, so each row shows the assumption it
        actually tested. This is a standardized mechanical sensitivity, not a probability, a
        confidence interval, or an estimate of how uncertain any assumption is.
      </p>
      <p className="assumptions">
        This ranking covers operating drivers only. WACC and terminal growth are tested
        separately in the grid below.
      </p>
    </div>
  )
}

export default DriverTornadoChart
