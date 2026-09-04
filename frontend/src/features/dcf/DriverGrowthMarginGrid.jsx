import {
  cellTierClass,
  describeCellWarnings,
  formatShift,
  summarizeGridWarnings,
  summarizeShiftedPath,
  warningFootnotes,
} from './driverGrowthMargin'

// A real <table> with tinted cells, exactly as the WACC x terminal growth grid already
// works - same tier classes, same base-case highlight, same table-wrap scroll container. The
// consequence that matters: every value per share is real text in a real cell, so nothing is
// hover-only, the native table structure IS the accessible presentation, and the grid
// survives print with its data intact.

const dollarsPerShare = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/**
 * Value per share across revenue growth x EBIT margin, both applied as standardized parallel
 * shifts in every forecast year, with every other driver and every valuation assumption held
 * at the base case.
 *
 * This component states no direction for either axis, and that is deliberate rather than
 * cautious phrasing: whether more revenue growth raises or lowers value per share depends on
 * the margin and reinvestment the same schedule carries, and both outcomes are ordinary. The
 * cells are the finding.
 */
function DriverGrowthMarginGrid({ grid }) {
  if (!grid || grid.rows.length === 0) return null

  const {
    rows,
    step,
    ebit_margin_deltas: marginDeltas,
    base_value_per_share: baseValue,
    base_revenue_growth_path: growthPath,
    base_ebit_margin_path: marginPath,
  } = grid

  const tierClass = cellTierClass(rows)
  const warnings = summarizeGridWarnings(rows)
  const maxShift = Math.max(...marginDeltas.map(Math.abs))
  const pp = `${(step * 100).toFixed(0)}pp`
  const totalCells = rows.length * marginDeltas.length

  return (
    <div className="growth-margin">
      <h3 id="driver-growth-margin-heading">
        Driver Interaction: Value per Share by Revenue Growth &amp; EBIT Margin
      </h3>
      <p className="growth-margin-base">
        Base case {dollarsPerShare(baseValue)}/share. Each cell shifts revenue growth and EBIT
        margin by the stated amounts in every forecast year, holding all other drivers, WACC,
        terminal growth, net debt and share count constant.
      </p>

      <div className="table-wrap">
        <table className="growth-margin-table" aria-labelledby="driver-growth-margin-heading">
          <thead>
            <tr>
              <th scope="col" className="growth-margin-corner">
                <span className="growth-margin-corner-row">Revenue Growth ↓</span>
                <span className="growth-margin-corner-col">EBIT Margin →</span>
              </th>
              {marginDeltas.map((delta) => (
                <th scope="col" key={delta}>
                  {formatShift(delta)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.revenue_growth_delta}>
                <th scope="row">{formatShift(row.revenue_growth_delta)}</th>
                {row.cells.map((cell, index) => {
                  const isBaseCell =
                    row.revenue_growth_delta === 0 && marginDeltas[index] === 0
                  const tint =
                    cell.value_per_share === null ? undefined : tierClass(cell.value_per_share)
                  const classNames = [
                    isBaseCell ? 'sensitivity-base-case' : tint,
                    cell.new_warnings.length > 0 ? 'growth-margin-cell--warned' : null,
                  ].filter(Boolean)
                  const notes = warningFootnotes(cell.new_warnings, warnings)
                  return (
                    <td
                      key={marginDeltas[index]}
                      className={classNames.join(' ') || undefined}
                      // Supplementary only, and correct for this cell because it is this
                      // cell's own warning text - everything it says is already available
                      // as visible or accessible text above.
                      title={
                        cell.new_warnings.length > 0
                          ? cell.new_warnings.map((w) => w.explanation).join('\n\n')
                          : undefined
                      }
                    >
                      {cell.value_per_share === null
                        ? 'n/a'
                        : dollarsPerShare(cell.value_per_share)}
                      {notes.length > 0 && (
                        <span className="growth-margin-warn">
                          <sup aria-hidden="true">{notes.join(',')}</sup>
                          <span className="visually-hidden">
                            {' '}
                            introduces {describeCellWarnings(cell.new_warnings)}
                          </span>
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="growth-margin-paths">
        <div>
          <dt>Revenue Growth</dt>
          <dd>{summarizeShiftedPath(growthPath, maxShift, step)}</dd>
        </div>
        <div>
          <dt>EBIT Margin</dt>
          <dd>{summarizeShiftedPath(marginPath, maxShift, step)}</dd>
        </div>
      </dl>

      {warnings.length > 0 && (
        <div className="growth-margin-warnings">
          <p className="assumptions">
            A cell carrying a superscript number is one where the combined shift moves the
            schedule into territory the model itself flags; the number identifies which warning
            below. Those cells are valued and shown as tested, never clamped to a more
            comfortable number or quietly dropped, since substituting a different assumption
            than the stated shift would make the comparison unreliable. Warnings the base case
            already raises are not repeated here.
          </p>
          <ol className="growth-margin-warning-list">
            {warnings.map((warning) => (
              <li key={warning.id} value={warning.note}>
                <span
                  className={`growth-margin-warning-tier growth-margin-warning-tier--${warning.tier}`}
                >
                  {warning.tier}
                </span>
                <span className="growth-margin-warning-text">
                  {warning.label} &mdash; {warning.cellCount} of {totalCells} tested cells.{' '}
                  {warning.description}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="assumptions">
        Read across a row to hold revenue growth and vary margin; read down a column to hold
        margin and vary revenue growth. Neither axis is presented with an assumed direction:
        whether more revenue growth raises or lowers value per share depends on the margin and
        reinvestment the same schedule carries, and both outcomes are ordinary. The tornado
        above moves one driver at a time and so cannot show that interaction, which is what
        this grid is for.
      </p>
      <p className="assumptions">
        The four cells one step from the centre along a single axis test exactly what the
        &plusmn;{pp} tornado tests for revenue growth and EBIT margin, and agree with it. The
        outer cells and every combination off those two lines have no tornado equivalent.
      </p>
      <p className="assumptions">
        A {pp} shift is not the same proportional move for both drivers &mdash; on a schedule
        whose EBIT margin runs 3.43%, &minus;2pp leaves 1.43%, a far larger relative move than
        &minus;2pp on revenue growth &mdash; so each axis reports the schedule it actually
        shifted. A cell is a mechanical recalculation of the model, not a probability, a
        confidence interval, or an estimate of how likely either assumption is.
      </p>
    </div>
  )
}

export default DriverGrowthMarginGrid
