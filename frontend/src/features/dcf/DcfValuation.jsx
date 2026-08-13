import { useState } from 'react'
import { currency } from '../../lib/format'
import ScenarioManager from '../../components/ScenarioManager'
import '../../styles/feature-form.css'

const EXAMPLE = {
  baseYearFcf: '120000000',
  fcfGrowthRate: '8',
  forecastYears: '5',
  wacc: '9',
  terminalGrowthRate: '2.5',
  netDebt: '300000000',
  dilutedSharesOutstanding: '50000000',
}

const EMPTY = {
  baseYearFcf: '',
  fcfGrowthRate: '',
  forecastYears: '',
  wacc: '',
  terminalGrowthRate: '',
  netDebt: '',
  dilutedSharesOutstanding: '',
}

function DcfValuation() {
  const [form, setForm] = useState(EMPTY)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleChange = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
  }

  const loadExample = () => {
    setForm(EXAMPLE)
    setResults(null)
    setError(null)
  }

  const loadScenario = (data) => {
    setForm(data)
    setResults(null)
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = {
        base_year_fcf: Number(form.baseYearFcf),
        fcf_growth_rate: Number(form.fcfGrowthRate) / 100,
        forecast_years: Number(form.forecastYears),
        wacc: Number(form.wacc) / 100,
        terminal_growth_rate: Number(form.terminalGrowthRate) / 100,
        net_debt: Number(form.netDebt),
        diluted_shares_outstanding: Number(form.dilutedSharesOutstanding),
      }
      const res = await fetch('/api/dcf/valuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail?.[0]?.msg || 'Calculation failed. Check your inputs.')
      }
      setResults(await res.json())
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="feature-page">
      <h1>DCF Valuation</h1>
      <p className="subtitle">
        Unlevered free cash flow forecast, discounted at a flat WACC, with a Gordon Growth
        terminal value.
      </p>

      <form onSubmit={handleSubmit} className="dcf-form">
        <fieldset>
          <legend>Forecast</legend>
          <label>
            Base Year Unlevered FCF ($)
            <input
              type="number"
              required
              min="0"
              step="any"
              value={form.baseYearFcf}
              onChange={handleChange('baseYearFcf')}
            />
          </label>
          <label>
            FCF Growth Rate (%/yr, forecast period)
            <input
              type="number"
              required
              step="any"
              value={form.fcfGrowthRate}
              onChange={handleChange('fcfGrowthRate')}
            />
          </label>
          <label>
            Forecast Period (years)
            <input
              type="number"
              required
              min="1"
              max="15"
              step="1"
              value={form.forecastYears}
              onChange={handleChange('forecastYears')}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Discount Rate &amp; Terminal Value</legend>
          <label>
            WACC (%)
            <input
              type="number"
              required
              min="0"
              max="100"
              step="any"
              value={form.wacc}
              onChange={handleChange('wacc')}
            />
          </label>
          <label>
            Terminal Growth Rate (%)
            <input
              type="number"
              required
              step="any"
              value={form.terminalGrowthRate}
              onChange={handleChange('terminalGrowthRate')}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Bridge to Value per Share</legend>
          <label>
            Net Debt ($, negative if net cash)
            <input
              type="number"
              required
              step="any"
              value={form.netDebt}
              onChange={handleChange('netDebt')}
            />
          </label>
          <label>
            Diluted Shares Outstanding
            <input
              type="number"
              required
              min="0"
              step="any"
              value={form.dilutedSharesOutstanding}
              onChange={handleChange('dilutedSharesOutstanding')}
            />
          </label>
        </fieldset>

        <div className="form-actions">
          <button type="button" className="secondary" onClick={loadExample}>
            Load Example Company
          </button>
          <button type="submit" disabled={loading}>
            {loading ? 'Calculating…' : 'Run Valuation'}
          </button>
        </div>
      </form>

      <ScenarioManager storageKey="dcf" currentData={form} onLoad={loadScenario} />

      {error && <p className="error">{error}</p>}

      {results && (
        <div className="results">
          <h2>Results</h2>

          <div className="metrics">
            <div className="metric">
              <span className="label">Enterprise Value</span>
              <span className="value">{currency(results.enterprise_value)}</span>
            </div>
            <div className="metric">
              <span className="label">Equity Value</span>
              <span className="value">{currency(results.equity_value)}</span>
            </div>
            <div className="metric">
              <span className="label">Value per Share</span>
              <span className="value">
                {results.value_per_share.toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                })}
              </span>
            </div>
            <div className="metric">
              <span className="label">Terminal Value</span>
              <span className="value">{currency(results.terminal_value)}</span>
            </div>
            <div className="metric">
              <span className="label">PV of Terminal Value</span>
              <span className="value">{currency(results.pv_terminal_value)}</span>
            </div>
          </div>

          <h3>Forecast &amp; Discounting</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Unlevered FCF</th>
                  <th>Discount Factor</th>
                  <th>Present Value</th>
                </tr>
              </thead>
              <tbody>
                {results.forecast.map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td>{currency(row.fcf)}</td>
                    <td>{row.discount_factor.toFixed(3)}</td>
                    <td>{currency(row.present_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="assumptions">
            Modeling assumptions: explicit-period FCF is projected from the base year at a
            single flat growth rate (no revenue/margin/CapEx build-up); terminal value uses the
            Gordon Growth method off WACC and terminal growth as direct inputs; cash flows are
            discounted using the end-of-year convention, not mid-year.
          </p>
        </div>
      )}
    </div>
  )
}

export default DcfValuation
