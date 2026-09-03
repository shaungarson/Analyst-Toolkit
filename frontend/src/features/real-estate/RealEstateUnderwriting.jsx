import { useState } from 'react'
import { currency, percent } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import { friendlyErrorMessage, parseErrorResponse } from '../../lib/apiError'
import { API_BASE } from '../../lib/apiBase'
import ScenarioManager from '../../components/ScenarioManager'
import ScenarioComparisonTable from '../../components/ScenarioComparisonTable'
import ScenarioAssumptionDiffTable from '../../components/ScenarioAssumptionDiffTable'
import RealEstateSensitivityGrid from './RealEstateSensitivityGrid'
import RealEstateDealSummary from './RealEstateDealSummary'
import '../../styles/feature-form.css'

// Purchase price and NOI are sourced from the public listing for 100 Symes Road, Toronto
// (industrial/flex, ~63,288 SF, 15 tenants, 16 units, fully leased). Financing, growth,
// hold, and exit assumptions are illustrative, chosen for a believable but not
// artificially attractive demonstration case - not sourced facts. See the disclaimer
// rendered next to the Load Example Deal button.
const EXAMPLE = {
  dealName: '100 Symes Road — Toronto Industrial/Flex',
  purchasePrice: '16500000',
  goingInNoi: '1000000',
  ltv: '65',
  interestRate: '5.75',
  amortizationYears: '30',
  loanMaturityYears: '5',
  holdPeriodYears: '5',
  exitCapRate: '6.5',
  noiGrowthRate: '2.5',
  acquisitionCostPct: '1.5',
  dispositionCostPct: '2',
}

const EMPTY = {
  dealName: '',
  purchasePrice: '',
  goingInNoi: '',
  ltv: '',
  interestRate: '',
  amortizationYears: '',
  loanMaturityYears: '',
  holdPeriodYears: '',
  exitCapRate: '',
  noiGrowthRate: '',
  acquisitionCostPct: '',
  dispositionCostPct: '',
}

// Backfills fields that didn't exist in scenarios saved before they were added, so loading
// or comparing an older scenario doesn't leave them blank/invalid. Loan maturity defaults
// to the scenario's own hold period - the smallest value that's always valid (maturity >=
// hold), not a guess at what the real loan term actually was. Deal name is purely
// descriptive metadata (never sent to the backend), so older scenarios simply default to
// blank rather than needing any real backfill logic.
const withLegacyDefaults = (data) => ({
  ...data,
  loanMaturityYears: data.loanMaturityYears ?? data.holdPeriodYears,
  dealName: data.dealName ?? '',
})

const buildPayload = (form) => ({
  purchase_price: Number(form.purchasePrice),
  going_in_noi: Number(form.goingInNoi),
  ltv: Number(form.ltv) / 100,
  interest_rate: Number(form.interestRate) / 100,
  amortization_years: Number(form.amortizationYears),
  loan_maturity_years: Number(form.loanMaturityYears),
  hold_period_years: Number(form.holdPeriodYears),
  exit_cap_rate: Number(form.exitCapRate) / 100,
  noi_growth_rate: Number(form.noiGrowthRate) / 100,
  acquisition_cost_pct: Number(form.acquisitionCostPct) / 100,
  disposition_cost_pct: Number(form.dispositionCostPct) / 100,
})

const ASSUMPTION_FIELDS = [
  { key: 'purchasePrice', label: 'Purchase Price', format: (v) => currency(Number(v)) },
  { key: 'goingInNoi', label: 'Going-in NOI', format: (v) => currency(Number(v)) },
  {
    key: 'acquisitionCostPct',
    label: 'Acquisition Costs',
    format: (v) => percent(Number(v) / 100),
  },
  { key: 'ltv', label: 'Loan-to-Value', format: (v) => percent(Number(v) / 100) },
  { key: 'interestRate', label: 'Interest Rate', format: (v) => percent(Number(v) / 100) },
  { key: 'amortizationYears', label: 'Amortization Period', format: (v) => `${Number(v)} yr` },
  { key: 'loanMaturityYears', label: 'Loan Maturity', format: (v) => `${Number(v)} yr` },
  { key: 'holdPeriodYears', label: 'Hold Period', format: (v) => `${Number(v)} yr` },
  { key: 'noiGrowthRate', label: 'NOI Growth Rate', format: (v) => percent(Number(v) / 100) },
  { key: 'exitCapRate', label: 'Exit Cap Rate', format: (v) => percent(Number(v) / 100) },
  {
    key: 'dispositionCostPct',
    label: 'Disposition Costs',
    format: (v) => percent(Number(v) / 100),
  },
]

const COMPARISON_METRICS = [
  { key: 'cap_rate', label: 'Going-in Cap Rate', get: (r) => r.going_in_cap_rate, format: percent },
  { key: 'equity', label: 'Initial Equity', get: (r) => r.initial_equity, format: currency },
  {
    key: 'dscr',
    label: 'Going-in DSCR',
    get: (r) => r.going_in_dscr,
    format: (v) => `${v.toFixed(2)}x`,
  },
  {
    key: 'debt_yield',
    label: 'Debt Yield',
    get: (r) => r.debt_yield,
    format: percent,
  },
  {
    key: 'coc',
    label: 'Cash-on-Cash (Yr 1)',
    get: (r) => r.cash_on_cash_year_1,
    format: percent,
  },
  {
    key: 'irr',
    label: 'IRR',
    get: (r) => r.irr,
    format: (v) => (v === null ? 'n/a' : percent(v)),
  },
  {
    key: 'multiple',
    label: 'Equity Multiple',
    get: (r) => r.equity_multiple,
    format: (v) => `${v.toFixed(2)}x`,
  },
  {
    key: 'net_proceeds',
    label: 'Net Sale Proceeds',
    get: (r) => r.exit.net_sale_proceeds,
    format: currency,
  },
]

function RealEstateUnderwriting() {
  const [form, setForm] = useState(EMPTY)
  const [results, setResults] = useState(null)
  const [sensitivity, setSensitivity] = useState(null)
  const [riskFlags, setRiskFlags] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleChange = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
  }

  const loadExample = () => {
    setForm(EXAMPLE)
    setResults(null)
    setSensitivity(null)
    setRiskFlags(null)
    setComparison(null)
    setError(null)
  }

  const loadScenario = (data) => {
    setForm(withLegacyDefaults(data))
    setResults(null)
    setSensitivity(null)
    setRiskFlags(null)
    setComparison(null)
    setError(null)
  }

  const handleCompare = async (selectedScenarios) => {
    setError(null)
    const withDefaults = selectedScenarios.map((s) => ({
      ...s,
      data: withLegacyDefaults(s.data),
    }))
    const settled = await Promise.allSettled(
      withDefaults.map(async (s) => {
        const res = await fetch(`${API_BASE}/api/real-estate/underwrite`, {
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
      withDefaults.map((s, i) => {
        const outcome = settled[i]
        return outcome.status === 'fulfilled'
          ? { name: s.name, data: s.data, results: outcome.value }
          : { name: s.name, data: s.data, error: outcome.reason.message }
      }),
    )
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
      ['Going-in DSCR', `${results.going_in_dscr.toFixed(2)}x`],
      ['Debt Yield', percent(results.debt_yield)],
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
        'DSCR',
        'Cash Flow to Equity',
        'Ending Loan Balance',
      ],
      ...results.annual_schedule.map((row) => [
        row.year,
        row.noi,
        row.interest,
        row.principal,
        row.debt_service,
        row.dscr === null ? 'n/a' : `${row.dscr.toFixed(2)}x`,
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

    if (riskFlags) {
      rows.push(
        [],
        ['Risk Flags'],
        riskFlags.length === 0
          ? ['None triggered']
          : ['Title', 'Explanation'],
        ...riskFlags.map((flag) => [flag.title, flag.explanation]),
      )
    }
    downloadCsv('real-estate-underwriting.csv', rows)
  }

  // Scopes window.print() to just the deal summary by toggling a body class that
  // print.css uses to hide the full-detail section - the "Print Full Analysis" button
  // alongside it is unaffected and keeps printing everything, unchanged.
  const printSummary = () => {
    document.body.classList.add('print-summary-only')
    const cleanup = () => {
      document.body.classList.remove('print-summary-only')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setSensitivity(null)
    setRiskFlags(null)
    setComparison(null)
    try {
      const payload = buildPayload(form)
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

      // Same best-effort pattern: risk flags are a supplementary, deterministic read of the
      // already-computed results, not a dependency of the headline underwriting result.
      try {
        const flagsRes = await fetch(`${API_BASE}/api/real-estate/risk-flags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (flagsRes.ok) {
          setRiskFlags(await flagsRes.json())
        }
      } catch {
        // Risk flags are supplementary; leave them blank on failure.
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
      <p className="scope-note">
        Simplified asset-level underwriting model; further expansion is paused pending external
        practitioner review.
      </p>

      <form onSubmit={handleSubmit} className="underwriting-form">
        <label>
          Deal / Property Name (optional)
          <input
            type="text"
            placeholder="e.g. Riverside Industrial Portfolio"
            value={form.dealName}
            onChange={handleChange('dealName')}
          />
        </label>

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
          <label>
            Loan Maturity (years)
            <input
              type="number"
              required
              min="1"
              max="50"
              step="1"
              value={form.loanMaturityYears}
              onChange={handleChange('loanMaturityYears')}
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
        <p className="assumptions">
          Real-world-inspired example based on publicly available information for 100 Symes
          Road, Toronto. Property price and NOI are sourced from the public listing;
          financing, growth, hold, and exit assumptions are illustrative for demonstration
          purposes.
        </p>
      </form>

      <ScenarioManager
        storageKey="real-estate"
        currentData={form}
        onLoad={loadScenario}
        onCompare={handleCompare}
      />

      {error && <p className="error">{error}</p>}

      {comparison && (
        <>
          <ScenarioAssumptionDiffTable comparisons={comparison} fields={ASSUMPTION_FIELDS} />
          <ScenarioComparisonTable
            title="Scenario Comparison"
            comparisons={comparison}
            metrics={COMPARISON_METRICS}
            onClear={() => setComparison(null)}
          />
        </>
      )}

      {results && (
        <div className="results">
          <div className="results-header">
            <h2>Results</h2>
            <div className="results-actions no-print">
              <button type="button" className="secondary" onClick={exportCsv}>
                Export CSV
              </button>
              <button type="button" className="secondary" onClick={printSummary}>
                Print Summary
              </button>
              <button type="button" className="secondary" onClick={() => window.print()}>
                Print Full Analysis
              </button>
            </div>
          </div>

          <RealEstateDealSummary
            dealName={form.dealName}
            purchasePrice={Number(form.purchasePrice)}
            goingInNoi={Number(form.goingInNoi)}
            holdPeriodYears={Number(form.holdPeriodYears)}
            ltv={Number(form.ltv) / 100}
            interestRate={Number(form.interestRate) / 100}
            amortizationYears={Number(form.amortizationYears)}
            loanMaturityYears={Number(form.loanMaturityYears)}
            exitCapRate={Number(form.exitCapRate) / 100}
            results={results}
            sensitivity={sensitivity}
            riskFlags={riskFlags}
          />

          <div className="full-detail">
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
              <span className="label">Going-in DSCR</span>
              <span className="value">{results.going_in_dscr.toFixed(2)}x</span>
            </div>
            <div className="metric">
              <span className="label">Debt Yield</span>
              <span className="value">{percent(results.debt_yield)}</span>
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

          <h3 id="re-cash-flow-heading">Annual Cash Flow Schedule</h3>
          <div className="table-wrap">
            <table aria-labelledby="re-cash-flow-heading">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>NOI</th>
                  <th>Interest</th>
                  <th>Principal</th>
                  <th>Debt Service</th>
                  <th>DSCR</th>
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
                    <td>{row.dscr === null ? 'n/a' : `${row.dscr.toFixed(2)}x`}</td>
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
              <RealEstateSensitivityGrid
                sensitivity={sensitivity}
                baseExitCapRate={Number(form.exitCapRate) / 100}
                baseHoldPeriod={Number(form.holdPeriodYears)}
              />
            </>
          )}

          {riskFlags && (
            <>
              <h3>Risk Flags</h3>
              {riskFlags.length === 0 ? (
                <p className="assumptions">No deterministic risk flags triggered for this deal.</p>
              ) : (
                <ul className="risk-flag-list">
                  {riskFlags.map((flag) => (
                    <li key={flag.id} className="risk-flag">
                      <span className="risk-flag-title">{flag.title}</span>
                      <span className="risk-flag-explanation">{flag.explanation}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <p className="assumptions">
            Modeling assumptions: NOI grows at one flat annual rate starting in Year 2 (Year 1
            is the unescalated going-in NOI); debt amortizes with level monthly payments and is
            unaffected by growth; loan maturity must be at least as long as the hold period —
            refinancing, extensions, and balloon payoffs beyond loan maturity are not modeled;
            acquisition and disposition costs are flat percentages, not itemized; exit value is
            based on NOI one year past the end of the hold period (the income the buyer is
            purchasing), capitalized at the exit cap rate; IRR is computed on annual,
            end-of-year equity cash flows.
          </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default RealEstateUnderwriting
