import { percent } from '../../lib/format'

// Shared by the full results view and the compact deal summary, so the grid, its base-case
// highlight logic, and its data never exist in two places - `compact` only changes styling
// (smaller table, shorter caption), never which cells are computed or shown.
function RealEstateSensitivityGrid({ sensitivity, baseExitCapRate, baseHoldPeriod, compact }) {
  return (
    <div className={compact ? 'sensitivity-compact' : undefined}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Exit Cap Rate</th>
              {sensitivity.hold_periods.map((hold) => (
                <th key={hold}>{hold} yr</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sensitivity.rows.map((row) => (
              <tr key={row.exit_cap_rate}>
                <td>{percent(row.exit_cap_rate)}</td>
                {row.irr_by_hold_period.map((cellIrr, i) => {
                  const isBaseCase =
                    Math.abs(row.exit_cap_rate - baseExitCapRate) < 1e-6 &&
                    sensitivity.hold_periods[i] === baseHoldPeriod
                  return (
                    <td key={i} className={isBaseCase ? 'sensitivity-base-case' : undefined}>
                      {cellIrr === null ? 'n/a' : percent(cellIrr)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {compact ? (
        <p className="assumptions">
          IRR by exit cap rate &times; hold period; highlighted cell matches the base case.
        </p>
      ) : (
        <p className="assumptions">
          Everything except exit cap rate and hold period is held at the values above. The
          highlighted cell matches your base-case IRR exactly.
        </p>
      )}
    </div>
  )
}

export default RealEstateSensitivityGrid
