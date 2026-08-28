import { useState } from 'react'
import { compactCurrency, compactShares, currency, percent } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import { friendlyErrorMessage, parseErrorResponse } from '../../lib/apiError'
import { API_BASE } from '../../lib/apiBase'
import ScenarioManager from '../../components/ScenarioManager'
import ScenarioComparisonTable from '../../components/ScenarioComparisonTable'
import WorkflowCard from '../../components/WorkflowCard'
import SourceBadge from '../../components/SourceBadge'
import FormattedNumberInput from '../../components/FormattedNumberInput'
import CompanySourcedData from './CompanySourcedData'
import SourcedHistoryPanel from './SourcedHistoryPanel'
import CompanyHeader from './CompanyHeader'
import ValueBridge from './ValueBridge'
import '../../styles/feature-form.css'
import '../../styles/workspace.css'

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

// Fields that ticker search can populate. Used both to build the sourced-value snapshot
// and to decide which form fields are ever eligible for a "Sourced"/"Adjusted" badge -
// fcfGrowthRate, forecastYears, wacc, and terminalGrowthRate are never sourced from data,
// so they always read as plain analyst judgment.
const SOURCEABLE_FIELDS = ['baseYearFcf', 'netDebt', 'dilutedSharesOutstanding']

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
  { key: 'ev', label: 'Enterprise Value', get: (r) => r.enterprise_value, format: compactCurrency },
  { key: 'eq', label: 'Equity Value', get: (r) => r.equity_value, format: compactCurrency },
  { key: 'vps', label: 'Value per Share', get: (r) => r.value_per_share, format: dollarsPerShare },
  { key: 'tv', label: 'Terminal Value', get: (r) => r.terminal_value, format: compactCurrency },
]

function DcfValuation() {
  const [form, setForm] = useState(EMPTY)
  const [results, setResults] = useState(null)
  const [sensitivity, setSensitivity] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [analysisTab, setAnalysisTab] = useState('sensitivity')
  const [showMethodology, setShowMethodology] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [ticker, setTicker] = useState('')
  const [companyData, setCompanyData] = useState(null)
  const [companyError, setCompanyError] = useState(null)
  const [companyLoading, setCompanyLoading] = useState(false)
  // Snapshot of exactly which form values came from the last successful ticker load, so a
  // field's badge can tell "still sourced" apart from "started sourced, analyst changed it."
  const [sourcedSnapshot, setSourcedSnapshot] = useState(null)

  const handleChange = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
  }

  const setFieldValue = (field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
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
      setShowHistory(false)

      const latest = data.periods[0]
      const sourced = {}
      if (latest?.unlevered_fcf != null) sourced.baseYearFcf = String(Math.round(latest.unlevered_fcf))
      if (latest?.net_debt != null) sourced.netDebt = String(Math.round(latest.net_debt))
      if (data.profile.shares_outstanding != null) {
        sourced.dilutedSharesOutstanding = String(Math.round(data.profile.shares_outstanding))
      }
      setSourcedSnapshot(sourced)
      setForm((prev) => ({ ...prev, ...sourced }))
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
    // The example is illustrative, not sourced from any ticker - clear company state so the
    // header and Sourced/Analyst badges don't keep describing a different company.
    setTicker('')
    setCompanyData(null)
    setCompanyError(null)
    setSourcedSnapshot(null)
    setShowHistory(false)
  }

  const loadScenario = (data) => {
    setForm(data)
    setResults(null)
    setSensitivity(null)
    setComparison(null)
    setError(null)
    setTicker('')
    setCompanyData(null)
    setCompanyError(null)
    setSourcedSnapshot(null)
    setShowHistory(false)
  }

  // Only fields ticker search can populate are ever eligible for a badge, and only once a
  // company has actually been loaded - otherwise the plain manual-entry workflow is
  // unchanged and stays free of provenance chrome it doesn't need.
  const fieldBadgeType = (field) => {
    if (!companyData || !sourcedSnapshot) return null
    if (SOURCEABLE_FIELDS.includes(field)) {
      if (!(field in sourcedSnapshot)) return null
      return form[field] === sourcedSnapshot[field] ? 'sourced' : 'adjusted'
    }
    return 'analyst'
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

  // Sensitivity cells are tinted in five discrete tiers (low->high implied value) rather
  // than a computed gradient, so light/dark colors can be declared explicitly in CSS. The
  // base-case cell keeps its existing solid highlight regardless of tier.
  const sensitivityValues = sensitivity
    ? sensitivity.rows.flatMap((row) => row.value_per_share_by_growth.filter((v) => v !== null))
    : []
  const sensMin = sensitivityValues.length ? Math.min(...sensitivityValues) : 0
  const sensMax = sensitivityValues.length ? Math.max(...sensitivityValues) : 0
  const sensTierClass = (value) => {
    if (sensMax === sensMin) return 'sens-tier-2'
    const t = (value - sensMin) / (sensMax - sensMin)
    return `sens-tier-${Math.min(4, Math.floor(t * 5))}`
  }

  const netDebtNum = Number(form.netDebt)

  // Deterministic arithmetic only - never a recommendation. Only shown when a real,
  // sourced current price exists (Alpha Vantage GLOBAL_QUOTE, via ticker search); the
  // manual-entry and Load Example paths have no market price to compare against, and
  // showing nothing is correct there, not a bug.
  const currentPrice = companyData?.profile?.current_price ?? null
  const impliedUpside =
    results && currentPrice != null ? results.value_per_share / currentPrice - 1 : null

  return (
    <div className="feature-page workspace">
      <CompanyHeader
        profile={companyData?.profile ?? null}
        ticker={ticker}
        setTicker={setTicker}
        onLoadCompany={loadCompany}
        companyLoading={companyLoading}
        onLoadExample={loadExample}
        companyError={companyError}
      />

      <div className="analytical-row">
        <section className="analytical-col">
          <div className="analytical-col-header">
            <span className="step-badge">1</span>
            <h2>Sourced Historical Data</h2>
          </div>
          {companyData ? (
            <CompanySourcedData
              companyData={companyData}
              showHistory={showHistory}
              onToggleHistory={() => setShowHistory((v) => !v)}
            />
          ) : (
            <p className="col-empty-hint">
              Load a company above to see sourced historical financials here.
            </p>
          )}
        </section>

        <section className="analytical-col">
          <div className="analytical-col-header">
            <span className="step-badge">2</span>
            <h2>Assumptions</h2>
          </div>
          <form onSubmit={handleSubmit} id="dcf-assumptions-form">
            <div className="field-group">
              <div className="field-group-label">Forecast</div>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Base Year UFCF</span>
                  {fieldBadgeType('baseYearFcf') && <SourceBadge type={fieldBadgeType('baseYearFcf')} />}
                </span>
                <FormattedNumberInput
                  required
                  min="0"
                  step="any"
                  value={form.baseYearFcf}
                  onChange={setFieldValue('baseYearFcf')}
                  formatter={compactCurrency}
                />
              </label>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">FCF Growth Rate (%/yr)</span>
                  {fieldBadgeType('fcfGrowthRate') && <SourceBadge type={fieldBadgeType('fcfGrowthRate')} />}
                </span>
                <input
                  type="number"
                  required
                  step="any"
                  value={form.fcfGrowthRate}
                  onChange={handleChange('fcfGrowthRate')}
                />
              </label>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Forecast Period (years)</span>
                  {fieldBadgeType('forecastYears') && <SourceBadge type={fieldBadgeType('forecastYears')} />}
                </span>
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
            </div>

            <div className="field-group">
              <div className="field-group-label">Discount &amp; Terminal Value</div>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">WACC (%)</span>
                  {fieldBadgeType('wacc') && <SourceBadge type={fieldBadgeType('wacc')} />}
                </span>
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
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Terminal Growth Rate (%)</span>
                  {fieldBadgeType('terminalGrowthRate') && (
                    <SourceBadge type={fieldBadgeType('terminalGrowthRate')} />
                  )}
                </span>
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
            </div>

            <div className="field-group">
              <div className="field-group-label">Bridge Inputs</div>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Net Debt (net cash if negative)</span>
                  {fieldBadgeType('netDebt') && <SourceBadge type={fieldBadgeType('netDebt')} />}
                </span>
                <FormattedNumberInput
                  required
                  step="any"
                  value={form.netDebt}
                  onChange={setFieldValue('netDebt')}
                  formatter={compactCurrency}
                />
              </label>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Diluted Shares Outstanding</span>
                  {fieldBadgeType('dilutedSharesOutstanding') && (
                    <SourceBadge type={fieldBadgeType('dilutedSharesOutstanding')} />
                  )}
                </span>
                <FormattedNumberInput
                  required
                  min="0"
                  step="any"
                  value={form.dilutedSharesOutstanding}
                  onChange={setFieldValue('dilutedSharesOutstanding')}
                  formatter={(v) => `${compactShares(v)} shares`}
                />
              </label>
            </div>

            <button type="submit" className="run-valuation-btn" disabled={loading}>
              {loading ? 'Calculating…' : 'Run Valuation'}
            </button>
          </form>
        </section>

        <section className="analytical-col">
          <div className="analytical-col-header">
            <span className="step-badge">3</span>
            <h2>Valuation Summary</h2>
            {results && (
              <div className="col-actions no-print">
                <button type="button" className="secondary" onClick={exportCsv}>
                  CSV
                </button>
                <button type="button" className="secondary" onClick={() => window.print()}>
                  Print
                </button>
              </div>
            )}
          </div>

          {results ? (
            <>
              <div className="valuation-hero">
                <span className="hero-label">Implied Value per Share</span>
                <span className="hero-value">{dollarsPerShare(results.value_per_share)}</span>
              </div>

              {currentPrice != null && (
                <div className="valuation-comparison">
                  <div className="comparison-row">
                    <span className="label">Current Price</span>
                    <span className="value">{dollarsPerShare(currentPrice)}</span>
                  </div>
                  <div className="comparison-row">
                    <span className="label">{impliedUpside >= 0 ? 'Implied Upside' : 'Implied Downside'}</span>
                    <span className={`value ${impliedUpside >= 0 ? 'value-positive' : 'value-negative'}`}>
                      {impliedUpside >= 0 ? '+' : ''}
                      {(impliedUpside * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}

              <div className="valuation-support-grid">
                <div>
                  <span className="label">Enterprise Value</span>
                  <span className="value">{compactCurrency(results.enterprise_value)}</span>
                </div>
                <div>
                  <span className="label">{netDebtNum < 0 ? 'Net Cash' : 'Net Debt'}</span>
                  <span className="value">{compactCurrency(Math.abs(netDebtNum))}</span>
                </div>
                <div>
                  <span className="label">Equity Value</span>
                  <span className="value">{compactCurrency(results.equity_value)}</span>
                </div>
                <div>
                  <span className="label">Diluted Shares</span>
                  <span className="value">{compactShares(Number(form.dilutedSharesOutstanding))}</span>
                </div>
                <div>
                  <span className="label">WACC</span>
                  <span className="value">{form.wacc}%</span>
                </div>
                <div>
                  <span className="label">Terminal Growth</span>
                  <span className="value">{form.terminalGrowthRate}%</span>
                </div>
                <div>
                  <span className="label">Forecast Period</span>
                  <span className="value">{form.forecastYears} yrs</span>
                </div>
              </div>
            </>
          ) : (
            <p className="col-empty-hint">Run a valuation to see results here.</p>
          )}
        </section>
      </div>

      {companyData && companyData.periods.length > 1 && (
        <SourcedHistoryPanel periods={companyData.periods} visible={showHistory} />
      )}

      {error && <p className="error">{error}</p>}

      {results && (
        <WorkflowCard
          step={4}
          title="Analysis Outputs"
          dense
          actions={
            <div className="analysis-tabs no-print">
              <button
                type="button"
                className={analysisTab === 'sensitivity' ? 'active' : ''}
                onClick={() => setAnalysisTab('sensitivity')}
              >
                Sensitivity &amp; Bridge
              </button>
              <button
                type="button"
                className={analysisTab === 'schedule' ? 'active' : ''}
                onClick={() => setAnalysisTab('schedule')}
              >
                Forecast &amp; Discounting
              </button>
            </div>
          }
        >
          <div className={analysisTab === 'sensitivity' ? 'analysis-outputs-row' : 'analysis-outputs-row no-screen'}>
            <div className="sensitivity-panel">
              {sensitivity ? (
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
                              const className = isBaseCase
                                ? 'sensitivity-base-case'
                                : cellValue !== null
                                  ? sensTierClass(cellValue)
                                  : undefined
                              return (
                                <td key={i} className={className}>
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
                    Base case held for all else. WACC-at-or-below-terminal-growth cells are n/a.
                    Tint reflects relative value (green = higher, red = lower).
                  </p>
                </>
              ) : (
                <p className="col-empty-hint">Sensitivity grid unavailable for this run.</p>
              )}
            </div>

            <div className="bridge-panel">
              <h3>Value Bridge</h3>
              <ValueBridge
                results={results}
                netDebt={netDebtNum}
                dilutedSharesOutstanding={Number(form.dilutedSharesOutstanding)}
              />
              <p className="assumptions">
                Incl. PV of Terminal Value {compactCurrency(results.pv_terminal_value)} (Terminal Value{' '}
                {compactCurrency(results.terminal_value)}).
              </p>
            </div>
          </div>

          <div className={analysisTab === 'schedule' ? undefined : 'no-screen'}>
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
          </div>

          <button
            type="button"
            className="methodology-toggle no-print"
            onClick={() => setShowMethodology((v) => !v)}
          >
            ⓘ Methodology {showMethodology ? '▲' : '▼'}
          </button>
          <p className={`assumptions ${showMethodology ? '' : 'no-screen'}`}>
            Explicit-period FCF is projected from the base year at a single flat growth rate (no
            revenue/margin/CapEx build-up); terminal value uses the Gordon Growth method off WACC
            and terminal growth as direct inputs; cash flows are discounted using the end-of-year
            convention, not mid-year.
          </p>
        </WorkflowCard>
      )}

      {/* Scenario Comparison sits with the Saved Scenarios workflow at the bottom, after
          the core company -> assumptions -> valuation -> analysis sequence, rather than
          interrupting it - comparing scenarios is a side workflow, not part of reading the
          current valuation. */}
      {comparison && (
        <ScenarioComparisonTable
          title="Scenario Comparison"
          comparisons={comparison}
          metrics={COMPARISON_METRICS}
          onClear={() => setComparison(null)}
        />
      )}

      <div className="scenarios-compact">
        <ScenarioManager
          storageKey="dcf"
          currentData={form}
          onLoad={loadScenario}
          onCompare={handleCompare}
        />
      </div>
    </div>
  )
}

export default DcfValuation
