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
  noiGrowthRate: '3',
  acquisitionCostPct: '1.5',
  dispositionCostPct: '2',
}

const EMPTY = {
  purchasePrice: '',
  goingInNoi: '',
  ltv: '',
  interestRate: '',
  amortizationYears: '',
  holdPeriodYears: '',
  exitCapRate: '',
  noiGrowthRate: '',
  acquisitionCostPct: '',
  dispositionCostPct: '',
}

function RealEstateUnderwriting() {
  const [form, setForm] = useState(EMPTY)
  const [results, setResults] = useState(null)
  const [sensitivity, setSensitivity] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleChange = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
  }

  const loadExample = () => {
    setForm(EXAMPLE)
    setResults(null)
    setSensitivity(null)
    setError(null)
  }

  const loadScenario = (data) => {
    setForm(data)
    setResults(null)
    setSensitivity(null)
    setError(null)
  }

  const exportCsv = () => {
    const rows = [
      ['Real Estate Underwriting Results'],
      [],
      ['Metric', 'Value'],
      ['Going-in Cap Rate', percent(results.going_in_cap_rate)],
      ['Loan Amount', results.loan_amount],
      ['Acquisition Costs', results.acquisition_costs],
      ['Initial Equity', results.initial_equity],
      ['Annual Debt Service (Yr 1)', results.annual_debt_service],
      ['Cash-on-Cash (Yr 1)', percent(results.cash_on_cash_year_1)],
      ['IRR', results.irr === null ? 'n/a' : percent(results.irr)],
      ['Equity Multiple', `${results.equity_multiple.toFixed(2)}x`],
      ['Exit Sale Price', results.exit.gross_sale_price],
      ['Disposition Costs', results.exit.disposition_costs],
      ['Net Sale Proceeds', results.exit.net_sale_proceeds],
      [],
      ['Annual Cash Flow Schedule'],
      [
        'Year',
        'NOI',
        'Interest',
        'Principal',
        'Debt Service',
        'Cash Flow to Equity',
        'Ending Loan Balance',
      ],
      ...results.annual_schedule.map((row) => [
        row.year,
        row.noi,
        row.interest,
        row.principal,
        row.debt_service,
        row.cash_flow_to_equity,
        row.ending_loan_balance,
      ]),
    ]

    if (sensitivity) {
      rows.push(
        [],
        ['Sensitivity: IRR by Exit Cap Rate & Hold Period'],
        ['Exit Cap Rate', ...sensitivity.hold_periods.map((h) => `${h} yr`)],
        ...sensitivity.rows.map((row) => [
          percent(row.exit_cap_rate),
          ...row.irr_by_hold_period.map((v) => (v === null ? 'n/a' : percent(v))),
        ]),
      )
    }
    downloadCsv('real-estate-underwriting.csv', rows)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setSensitivity(null)
    try {
      const payload = {
        purchase_price: Number(form.purchasePrice),
        going_in_noi: Number(form.goingInNoi),
        ltv: Number(form.ltv) / 100,
        interest_rate: Number(form.interestRate) / 100,
        amortization_years: Number(form.amortizationYears),
        hold_period_years: Number(form.holdPeriodYears),
        exit_cap_rate: Number(form.exitCapRate) / 100,
        noi_growth_rate: Number(form.noiGrowthRate) / 100,
        acquisition_cost_pct: Number(form.acquisitionCostPct) / 100,
        disposition_cost_pct: Number(form.dispositionCostPct) / 100,
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

      // Best-effort: the sensitivity grid is a supplementary view, so a failure here
      // shouldn't block or overwrite the main underwriting result the user asked for.
      try {
        const sensRes = await fetch(`${API_BASE}/api/real-estate/sensitivity`, {
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
      <h1>Real Estate Underwriting</h1>
      <p className="subtitle">
        Multi-year acquisition model: purchase price, financing, NOI growth, and a hold period
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
          <label>
            Acquisition Costs (% of Purchase Price)
            <input
              type="number"
              required
              min="0"
              max="10"
              step="any"
              value={form.acquisitionCostPct}
              onChange={handleChange('acquisitionCostPct')}
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
            NOI Growth Rate (%/yr, from Year 2 on)
            <input
              type="number"
              required
              min="-10"
              max="15"
              step="any"
              value={form.noiGrowthRate}
              onChange={handleChange('noiGrowthRate')}
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
          <label>
            Disposition Costs (% of Sale Price)
            <input
              type="number"
              required
              min="0"
              max="10"
              step="any"
              value={form.dispositionCostPct}
              onChange={handleChange('dispositionCostPct')}
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
              <span className="label">Acquisition Costs</span>
              <span className="value">{currency(results.acquisition_costs)}</span>
            </div>
            <div className="metric">
              <span className="label">Initial Equity</span>
              <span className="value">{currency(results.initial_equity)}</span>
            </div>
            <div className="metric">
              <span className="label">Annual Debt Service (Yr 1)</span>
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
              <span className="label">Disposition Costs</span>
              <span className="value">{currency(results.exit.disposition_costs)}</span>
            </div>
            <div className="metric">
              <span className="label">Net Sale Proceeds</span>
              <span className="value">{currency(results.exit.net_sale_proceeds)}</span>
            </div>
          </div>

          <h3>Annual Cash Flow Schedule</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>NOI</th>
                  <th>Interest</th>
                  <th>Principal</th>
                  <th>Debt Service</th>
                  <th>Cash Flow to Equity</th>
                  <th>Ending Loan Balance</th>
                </tr>
              </thead>
              <tbody>
                {results.annual_schedule.map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td>{currency(row.noi)}</td>
                    <td>{currency(row.interest)}</td>
                    <td>{currency(row.principal)}</td>
                    <td>{currency(row.debt_service)}</td>
                    <td>{currency(row.cash_flow_to_equity)}</td>
                    <td>{currency(row.ending_loan_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sensitivity && (
            <>
              <h3>Sensitivity: IRR by Exit Cap Rate &amp; Hold Period</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Exit Cap Rate</th>
                      {sensitivity.hold_periods.map((hold) => (
                        <th key={hold}>{hold} yr</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivity.rows.map((row) => (
                      <tr key={row.exit_cap_rate}>
                        <td>{percent(row.exit_cap_rate)}</td>
                        {row.irr_by_hold_period.map((cellIrr, i) => {
                          const isBaseCase =
                            Math.abs(row.exit_cap_rate - Number(form.exitCapRate) / 100) < 1e-6 &&
                            sensitivity.hold_periods[i] === Number(form.holdPeriodYears)
                          return (
                            <td
                              key={i}
                              className={isBaseCase ? 'sensitivity-base-case' : undefined}
                            >
                              {cellIrr === null ? 'n/a' : percent(cellIrr)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="assumptions">
                Everything except exit cap rate and hold period is held at the values above.
                The highlighted cell matches your base-case IRR exactly.
              </p>
            </>
          )}

          <p className="assumptions">
            Modeling assumptions: NOI grows at one flat annual rate starting in Year 2 (Year 1
            is the unescalated going-in NOI); debt amortizes with level monthly payments and is
            unaffected by growth; acquisition and disposition costs are flat percentages, not
            itemized; exit value is based on NOI one year past the end of the hold period (the
            income the buyer is purchasing), capitalized at the exit cap rate; IRR is computed
            on annual, end-of-year equity cash flows.
          </p>
        </div>
      )}
    </div>
  )
}

export default RealEstateUnderwriting
