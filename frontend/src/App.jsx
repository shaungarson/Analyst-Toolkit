import { useState } from 'react'
import RealEstateUnderwriting from './features/real-estate/RealEstateUnderwriting'
import DcfValuation from './features/dcf/DcfValuation'
import './App.css'

const MODULES = {
  dcf: { label: 'DCF Valuation', Component: DcfValuation },
  'real-estate': { label: 'Real Estate Underwriting', Component: RealEstateUnderwriting },
}

function App() {
  const [active, setActive] = useState('dcf')
  const { Component } = MODULES[active]

  return (
    <>
      <nav className="app-nav">
        <span className="app-nav-title">Analyst Toolkit</span>
        <div className="app-nav-tabs">
          {Object.entries(MODULES).map(([key, { label }]) => (
            <button
              key={key}
              type="button"
              // The active module was previously conveyed by the `active` class alone, i.e.
              // visually only. aria-current names it for assistive tech; it stays a button
              // (not a link) because this is a no-router SPA with no per-module URL.
              aria-current={key === active ? 'page' : undefined}
              className={key === active ? 'active' : ''}
              onClick={() => setActive(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      <main>
        <Component />
      </main>
    </>
  )
}

export default App
