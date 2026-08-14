import { useState } from 'react'
import { useScenarios } from '../lib/useScenarios'

function ScenarioManager({ storageKey, currentData, onLoad, onCompare }) {
  const { scenarios, saveScenario, deleteScenario } = useScenarios(storageKey)
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    saveScenario(trimmed, currentData)
    setName('')
  }

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleCompare = () => {
    const selected = scenarios.filter((s) => selectedIds.has(s.id))
    onCompare(selected)
  }

  return (
    <div className="scenarios">
      <h3>Saved Scenarios</h3>
      <div className="scenario-save-row">
        <input
          type="text"
          placeholder="Name this scenario"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="button" className="secondary" onClick={handleSave} disabled={!name.trim()}>
          Save Current Inputs
        </button>
      </div>

      {scenarios.length === 0 ? (
        <p className="scenario-empty">No saved scenarios yet.</p>
      ) : (
        <>
          <ul className="scenario-list">
            {scenarios.map((s) => (
              <li key={s.id}>
                <input
                  type="checkbox"
                  aria-label={`Select ${s.name} for comparison`}
                  checked={selectedIds.has(s.id)}
                  onChange={() => toggleSelected(s.id)}
                />
                <span className="scenario-name">{s.name}</span>
                <span className="scenario-date">{new Date(s.savedAt).toLocaleDateString()}</span>
                <button type="button" className="secondary" onClick={() => onLoad(s.data)}>
                  Load
                </button>
                <button
                  type="button"
                  className="secondary danger"
                  onClick={() => deleteScenario(s.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="secondary"
            disabled={selectedIds.size < 2}
            onClick={handleCompare}
          >
            Compare Selected ({selectedIds.size})
          </button>
        </>
      )}
    </div>
  )
}

export default ScenarioManager
