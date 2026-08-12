import { useState } from 'react'
import RealEstateUnderwriting from './features/real-estate/RealEstateUnderwriting'
import DcfValuation from './features/dcf/DcfValuation'
import './App.css'

const MODULES = {
  'real-estate': { label: 'Real Estate Underwriting', Component: RealEstateUnderwriting },
  dcf: { label: 'DCF Valuation', Component: DcfValuation },
}

function App() {
  const [active, setActive] = useState('real-estate')
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
              className={key === active ? 'active' : ''}
              onClick={() => setActive(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      <Component />
    </>
  )
}

export default App
