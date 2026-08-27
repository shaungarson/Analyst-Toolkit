import { useState } from 'react'
import { currency, percent } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import { friendlyErrorMessage, parseErrorResponse } from '../../lib/apiError'
import { API_BASE } from '../../lib/apiBase'
import ScenarioManager from '../../components/ScenarioManager'
import ScenarioComparisonTable from '../../components/ScenarioComparisonTable'
import CompanySourcedData from './CompanySourcedData'
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

const buildPayload = (form) => ({
  base_year_fcf: Number(form.baseYearFcf),
  fcf_growth_rate: Number(form.fcfGrowthRate) / 100,
  forecast_years: Number(form.forecastYears),
  wacc: Number(form.wacc) / 100,
  terminal_growth_rate: Number(form.terminalGrowthRate) / 100,
  net_debt: Number(form.netDebt),
  diluted_shares_outstanding: Number(form.dilutedSharesOutstanding),
})

const dollarsPerShare = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const COMPARISON_METRICS = [
  { key: 'ev', label: 'Enterprise Value', get: (r) => r.enterprise_value, format: currency },
  { key: 'eq', label: 'Equity Value', get: (r) => r.equity_value, format: currency },
  { key: 'vps', label: 'Value per Share', get: (r) => r.value_per_share, format: dollarsPerShare },
  { key: 'tv', label: 'Terminal Value', get: (r) => r.terminal_value, format: currency },
]

function DcfValuation() {
  const [form, setForm] = useState(EMPTY)
  const [results, setResults] = useState(null)
  const [sensitivity, setSensitivity] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const [ticker, setTicker] = useState('')
  const [companyData, setCompanyData] = useState(null)
  const [companyError, setCompanyError] = useState(null)
  const [companyLoading, setCompanyLoading] = useState(false)

  const handleChange = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
  }

  // Populates the existing assumption fields from sourced company data - it does not run
  // a valuation and does not save a scenario. The analyst still reviews every field
  // (including the ones just populated) and explicitly clicks Run Valuation.
  const loadCompany = async (e) => {
    e.preventDefault()
    const symbol = ticker.trim()
    if (!symbol) return
    setCompanyError(null)
    setCompanyLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/company/${encodeURIComponent(symbol)}`)
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res))
      }
      const data = await res.json()
      setCompanyData(data)
      setResults(null)
      setSensitivity(null)
      setComparison(null)

      const latest = data.periods[0]
      setForm((prev) => ({
        ...prev,
        baseYearFcf:
          latest?.unlevered_fcf != null ? String(Math.round(latest.unlevered_fcf)) : prev.baseYearFcf,
        netDebt: latest?.net_debt != null ? String(Math.round(latest.net_debt)) : prev.netDebt,
        dilutedSharesOutstanding:
          data.profile.shares_outstanding != null
            ? String(Math.round(data.profile.shares_outstanding))
            : prev.dilutedSharesOutstanding,
      }))
    } catch (err) {
      setCompanyError(friendlyErrorMessage(err))
      setCompanyData(null)
    } finally {
      setCompanyLoading(false)
    }
  }

  const loadExample = () => {
    setForm(EXAMPLE)
    setResults(null)
    setSensitivity(null)
    setComparison(null)
    setError(null)
  }

  const loadScenario = (data) => {
    setForm(data)
    setResults(null)
    setSensitivity(null)
    setComparison(null)
    setError(null)
  }

  const handleCompare = async (selectedScenarios) => {
    setError(null)
    const settled = await Promise.allSettled(
      selectedScenarios.map(async (s) => {
        const res = await fetch(`${API_BASE}/api/dcf/valuation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(s.data)),
        })
        if (!res.ok) {
          throw new Error(await parseErrorResponse(res))
        }
        return res.json()
      }),
    )
    setComparison(
      selectedScenarios.map((s, i) => {
        const outcome = settled[i]
        return outcome.status === 'fulfilled'
          ? { name: s.name, results: outcome.value }
          : { name: s.name, error: outcome.reason.message }
      }),
    )
  }

  const exportCsv = () => {
    const rows = [
      ['DCF Valuation Results'],
      [],
      ['Metric', 'Value'],
      ['Enterprise Value', results.enterprise_value],
      ['Equity Value', results.equity_value],
      ['Value per Share', results.value_per_share],
      ['Terminal Value', results.terminal_value],
      ['PV of Terminal Value', results.pv_terminal_value],
      [],
      ['Forecast & Discounting'],
      ['Year', 'Unlevered FCF', 'Discount Factor', 'Present Value'],
      ...results.forecast.map((row) => [
        row.year,
        row.fcf,
        row.discount_factor,
        row.present_value,
      ]),
    ]

    if (sensitivity) {
      rows.push(
        [],
        ['Sensitivity: Value per Share by WACC & Terminal Growth'],
        ['WACC', ...sensitivity.terminal_growth_rates.map((g) => percent(g))],
        ...sensitivity.rows.map((row) => [
          percent(row.wacc),
          ...row.value_per_share_by_growth.map((v) => (v === null ? 'n/a' : v)),
        ]),
      )
    }

    downloadCsv('dcf-valuation.csv', rows)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setSensitivity(null)
    setComparison(null)
    try {
      const payload = buildPayload(form)
      const res = await fetch(`${API_BASE}/api/dcf/valuation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res))
      }
      setResults(await res.json())

      // Best-effort: the sensitivity grid is a supplementary view, so a failure here
      // shouldn't block or overwrite the main valuation result the user asked for.
      try {
        const sensRes = await fetch(`${API_BASE}/api/dcf/sensitivity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (sensRes.ok) {
          setSensitivity(await sensRes.json())
        }
      } catch {
        // Sensitivity grid is supplementary; leave it blank on failure.
      }
    } catch (err) {
      setError(friendlyErrorMessage(err))
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

      <form onSubmit={loadCompany} className="company-search">
        <fieldset>
          <legend>Company</legend>
          <div className="company-search-row">
            <label>
              Ticker
              <input
                type="text"
                placeholder="e.g. AAPL"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
              />
            </label>
            <button type="submit" disabled={companyLoading || !ticker.trim()}>
              {companyLoading ? 'Loading…' : 'Load Company'}
            </button>
          </div>
          <p className="assumptions">
            Search a public company above, or enter assumptions manually below.
          </p>
        </fieldset>
      </form>

      {companyError && <p className="error">{companyError}</p>}

      {companyData && <CompanySourcedData companyData={companyData} />}

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
              min="-5"
              max="6"
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

      <ScenarioManager
        storageKey="dcf"
        currentData={form}
        onLoad={loadScenario}
        onCompare={handleCompare}
      />

      {error && <p className="error">{error}</p>}

      {comparison && (
        <ScenarioComparisonTable
          title="Scenario Comparison"
          comparisons={comparison}
          metrics={COMPARISON_METRICS}
          onClear={() => setComparison(null)}
        />
      )}

      {results && (
        <div className="results">
          <div className="results-header">
            <h2>Results</h2>
            <div className="results-actions no-print">
              <button type="button" className="secondary" onClick={exportCsv}>
                Export CSV
              </button>
              <button type="button" className="secondary" onClick={() => window.print()}>
                Print
              </button>
            </div>
          </div>

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
              <span className="value">{dollarsPerShare(results.value_per_share)}</span>
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

          {sensitivity && (
            <>
              <h3>Sensitivity: Value per Share by WACC &amp; Terminal Growth</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>WACC</th>
                      {sensitivity.terminal_growth_rates.map((g) => (
                        <th key={g}>{percent(g)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivity.rows.map((row) => (
                      <tr key={row.wacc}>
                        <td>{percent(row.wacc)}</td>
                        {row.value_per_share_by_growth.map((cellValue, i) => {
                          const isBaseCase =
                            Math.abs(row.wacc - Number(form.wacc) / 100) < 1e-6 &&
                            Math.abs(
                              sensitivity.terminal_growth_rates[i] -
                                Number(form.terminalGrowthRate) / 100,
                            ) < 1e-6
                          return (
                            <td
                              key={i}
                              className={isBaseCase ? 'sensitivity-base-case' : undefined}
                            >
                              {cellValue === null ? 'n/a' : dollarsPerShare(cellValue)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="assumptions">
                Everything except WACC and terminal growth is held at the values above.
                Combinations where WACC would fall at or below terminal growth are marked n/a
                (undefined for the Gordon Growth formula). The highlighted cell matches your
                base-case value per share exactly.
              </p>
            </>
          )}

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
