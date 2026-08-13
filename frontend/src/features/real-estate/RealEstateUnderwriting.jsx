import { useState } from 'react'
import { currency, percent } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import { friendlyErrorMessage, parseErrorResponse } from '../../lib/apiError'
import { API_BASE } from '../../lib/apiBase'
import ScenarioManager from '../../components/ScenarioManager'
import '../../styles/feature-form.css'

const EXAMPLE = {
  purchasePrice: '10000000',
  goingInNoi: '650000',
  ltv: '65',
  interestRate: '6.0',
  amortizationYears: '30',
  holdPeriodYears: '5',
  exitCapRate: '6.75',
}

const EMPTY = {
  purchasePrice: '',
  goingInNoi: '',
  ltv: '',
  interestRate: '',
  amortizationYears: '',
  holdPeriodYears: '',
  exitCapRate: '',
}

function RealEstateUnderwriting() {
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

  const exportCsv = () => {
    const rows = [
      ['Real Estate Underwriting Results'],
      [],
      ['Metric', 'Value'],
      ['Going-in Cap Rate', percent(results.going_in_cap_rate)],
      ['Loan Amount', results.loan_amount],
      ['Initial Equity', results.initial_equity],
      ['Annual Debt Service', results.annual_debt_service],
      ['Cash-on-Cash (Yr 1)', percent(results.cash_on_cash_year_1)],
      ['IRR', results.irr === null ? 'n/a' : percent(results.irr)],
      ['Equity Multiple', `${results.equity_multiple.toFixed(2)}x`],
      ['Exit Sale Price', results.exit.gross_sale_price],
      ['Net Sale Proceeds', results.exit.net_sale_proceeds],
      [],
      ['Debt Amortization Schedule'],
      ['Year', 'Beginning Balance', 'Interest', 'Principal', 'Debt Service', 'Ending Balance'],
      ...results.amortization_schedule.map((row) => [
        row.year,
        row.beginning_balance,
        row.interest,
        row.principal,
        row.debt_service,
        row.ending_balance,
      ]),
    ]
    downloadCsv('real-estate-underwriting.csv', rows)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = {
        purchase_price: Number(form.purchasePrice),
        going_in_noi: Number(form.goingInNoi),
        ltv: Number(form.ltv) / 100,
        interest_rate: Number(form.interestRate) / 100,
        amortization_years: Number(form.amortizationYears),
        hold_period_years: Number(form.holdPeriodYears),
        exit_cap_rate: Number(form.exitCapRate) / 100,
      }
      const res = await fetch(`${API_BASE}/api/real-estate/underwrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res))
      }
      setResults(await res.json())
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="feature-page">
      <h1>Real Estate Underwriting</h1>
      <p className="subtitle">
        Single-period acquisition model: purchase price, financing, and a five-year-style hold
        through exit.
      </p>

      <form onSubmit={handleSubmit} className="underwriting-form">
        <fieldset>
          <legend>Acquisition</legend>
          <label>
            Purchase Price ($)
            <input
              type="number"
              required
              min="0"
              step="any"
              value={form.purchasePrice}
              onChange={handleChange('purchasePrice')}
            />
          </label>
          <label>
            Going-in NOI ($/yr)
            <input
              type="number"
              required
              min="0"
              step="any"
              value={form.goingInNoi}
              onChange={handleChange('goingInNoi')}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Financing</legend>
          <label>
            Loan-to-Value (%)
            <input
              type="number"
              required
              min="0"
              max="99"
              step="any"
              value={form.ltv}
              onChange={handleChange('ltv')}
            />
          </label>
          <label>
            Interest Rate (%)
            <input
              type="number"
              required
              min="0"
              max="100"
              step="any"
              value={form.interestRate}
              onChange={handleChange('interestRate')}
            />
          </label>
          <label>
            Amortization Period (years)
            <input
              type="number"
              required
              min="1"
              max="50"
              step="1"
              value={form.amortizationYears}
              onChange={handleChange('amortizationYears')}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Hold &amp; Exit</legend>
          <label>
            Hold Period (years)
            <input
              type="number"
              required
              min="1"
              max="30"
              step="1"
              value={form.holdPeriodYears}
              onChange={handleChange('holdPeriodYears')}
            />
          </label>
          <label>
            Exit Cap Rate (%)
            <input
              type="number"
              required
              min="0"
              max="100"
              step="any"
              value={form.exitCapRate}
              onChange={handleChange('exitCapRate')}
            />
          </label>
        </fieldset>

        <div className="form-actions">
          <button type="button" className="secondary" onClick={loadExample}>
            Load Example Deal
          </button>
          <button type="submit" disabled={loading}>
            {loading ? 'Calculating…' : 'Run Underwriting'}
          </button>
        </div>
      </form>

      <ScenarioManager storageKey="real-estate" currentData={form} onLoad={loadScenario} />

      {error && <p className="error">{error}</p>}

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
              <span className="label">Going-in Cap Rate</span>
              <span className="value">{percent(results.going_in_cap_rate)}</span>
            </div>
            <div className="metric">
              <span className="label">Loan Amount</span>
              <span className="value">{currency(results.loan_amount)}</span>
            </div>
            <div className="metric">
              <span className="label">Initial Equity</span>
              <span className="value">{currency(results.initial_equity)}</span>
            </div>
            <div className="metric">
              <span className="label">Annual Debt Service</span>
              <span className="value">{currency(results.annual_debt_service)}</span>
            </div>
            <div className="metric">
              <span className="label">Cash-on-Cash (Yr 1)</span>
              <span className="value">{percent(results.cash_on_cash_year_1)}</span>
            </div>
            <div className="metric">
              <span className="label">IRR</span>
              <span className="value">
                {results.irr === null ? 'n/a' : percent(results.irr)}
              </span>
            </div>
            <div className="metric">
              <span className="label">Equity Multiple</span>
              <span className="value">{results.equity_multiple.toFixed(2)}x</span>
            </div>
            <div className="metric">
              <span className="label">Exit Sale Price</span>
              <span className="value">{currency(results.exit.gross_sale_price)}</span>
            </div>
            <div className="metric">
              <span className="label">Net Sale Proceeds</span>
              <span className="value">{currency(results.exit.net_sale_proceeds)}</span>
            </div>
          </div>

          <h3>Debt Amortization Schedule</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Beginning Balance</th>
                  <th>Interest</th>
                  <th>Principal</th>
                  <th>Debt Service</th>
                  <th>Ending Balance</th>
                </tr>
              </thead>
              <tbody>
                {results.amortization_schedule.map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td>{currency(row.beginning_balance)}</td>
                    <td>{currency(row.interest)}</td>
                    <td>{currency(row.principal)}</td>
                    <td>{currency(row.debt_service)}</td>
                    <td>{currency(row.ending_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="assumptions">
            Modeling assumptions: NOI held flat over the hold period (no growth modeled yet);
            debt amortizes with level monthly payments; no acquisition or disposition costs are
            included; exit value is based on the same flat NOI capitalized at the exit cap rate;
            IRR is computed on annual, end-of-year equity cash flows.
          </p>
        </div>
      )}
    </div>
  )
}

export default RealEstateUnderwriting
