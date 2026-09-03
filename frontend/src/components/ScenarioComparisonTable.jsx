import { useId } from 'react'

function ScenarioComparisonTable({ title, comparisons, metrics, onClear }) {
  // useId rather than a constant: this renders once per module today, but a fixed id
  // would silently collide the moment a second instance appears.
  const headingId = useId()

  return (
    <div className="results">
      <div className="results-header">
        <h2 id={headingId}>{title}</h2>
        <div className="results-actions no-print">
          <button type="button" className="secondary" onClick={onClear}>
            Clear Comparison
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table aria-labelledby={headingId}>
          <thead>
            <tr>
              <th>Metric</th>
              {comparisons.map((c) => (
                <th key={c.name}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                {comparisons.map((c) => (
                  <td key={c.name}>{c.error ? 'Error' : m.format(m.get(c.results))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comparisons.some((c) => c.error) && (
        // Each failing scenario's own reason, not just its name: "these inputs may no longer
        // be valid" doesn't tell an analyst whether a scenario was rejected for an
        // incomplete driver schedule, a non-convergent WACC, or a failed request - and the
        // specific reason is already carried per scenario.
        <div className="error">
          <p>Couldn't recalculate:</p>
          <ul className="comparison-error-list">
            {comparisons
              .filter((c) => c.error)
              .map((c) => (
                <li key={c.name}>
                  <strong>{c.name}</strong> — {c.error}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default ScenarioComparisonTable
