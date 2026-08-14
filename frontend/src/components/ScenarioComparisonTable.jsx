function ScenarioComparisonTable({ title, comparisons, metrics, onClear }) {
  return (
    <div className="results">
      <div className="results-header">
        <h2>{title}</h2>
        <div className="results-actions no-print">
          <button type="button" className="secondary" onClick={onClear}>
            Clear Comparison
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
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
        <p className="error">
          Couldn't recalculate: {comparisons.filter((c) => c.error).map((c) => c.name).join(', ')}
          . These scenarios may have been saved with inputs that are no longer valid.
        </p>
      )}
    </div>
  )
}

export default ScenarioComparisonTable
