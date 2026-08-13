import { useState } from 'react'
import { useScenarios } from '../lib/useScenarios'

function ScenarioManager({ storageKey, currentData, onLoad }) {
  const { scenarios, saveScenario, deleteScenario } = useScenarios(storageKey)
  const [name, setName] = useState('')

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    saveScenario(trimmed, currentData)
    setName('')
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
        <ul className="scenario-list">
          {scenarios.map((s) => (
            <li key={s.id}>
              <span className="scenario-name">{s.name}</span>
              <span className="scenario-date">{new Date(s.savedAt).toLocaleDateString()}</span>
              <button type="button" className="secondary" onClick={() => onLoad(s.data)}>
                Load
              </button>
              <button type="button" className="secondary danger" onClick={() => deleteScenario(s.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ScenarioManager
