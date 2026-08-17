// Compares raw saved-scenario inputs (not calculation results) across the scenarios the
// analyst selected. Values are normalized with Number() before comparing, since a saved
// scenario's inputs are raw form strings - "6" and "6.0" are the same economic assumption
// but different strings, and every field here is a plain numeric input (no free text,
// dates, or enums), so a single Number() normalization is enough - no per-field-type
// framework needed. A field counts as changed if it isn't identical across every selected
// scenario; there's no designated "baseline" scenario to diff against.
function ScenarioAssumptionDiffTable({ comparisons, fields }) {
  const changedFields = []
  const unchangedLabels = []

  for (const field of fields) {
    const rawValues = comparisons.map((c) => c.data[field.key])
    const numericValues = rawValues.map(Number)
    const allSame = numericValues.every((v) => v === numericValues[0])
    if (allSame) {
      unchangedLabels.push(field.label)
    } else {
      changedFields.push({ ...field, rawValues })
    }
  }

  return (
    <div className="results">
      <h2>Assumptions Compared</h2>
      {changedFields.length === 0 ? (
        <p className="assumptions">All compared assumptions are identical.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Assumption</th>
                {comparisons.map((c) => (
                  <th key={c.name}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {changedFields.map((field) => (
                <tr key={field.key}>
                  <td>{field.label}</td>
                  {field.rawValues.map((v, i) => (
                    <td key={i} className="assumption-changed">
                      {field.format(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unchangedLabels.length > 0 && (
        <p className="assumptions">Unchanged: {unchangedLabels.join(', ')}</p>
      )}
    </div>
  )
}

export default ScenarioAssumptionDiffTable
