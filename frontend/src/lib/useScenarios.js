import { useEffect, useState } from 'react'

const STORAGE_PREFIX = 'analyst-toolkit:scenarios:'

function loadFromStorage(storageKey) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function useScenarios(storageKey) {
  const [scenarios, setScenarios] = useState(() => loadFromStorage(storageKey))

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(scenarios))
  }, [storageKey, scenarios])

  const saveScenario = (name, data) => {
    const scenario = { id: crypto.randomUUID(), name, data, savedAt: new Date().toISOString() }
    setScenarios((prev) => [...prev, scenario])
  }

  const deleteScenario = (id) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id))
  }

  return { scenarios, saveScenario, deleteScenario }
}
