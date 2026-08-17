import { currency, percent } from '../../lib/format'
import RealEstateSensitivityGrid from './RealEstateSensitivityGrid'

// Min/max over an already-fetched sensitivity grid - not a second calculation, just reading
// the extremes out of numbers the /sensitivity endpoint already returned.
function irrRange(sensitivity) {
  const values = sensitivity.rows
    .flatMap((row) => row.irr_by_hold_period)
    .filter((v) => v !== null)
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

// A compact, decision-ready read of a completed underwriting - not a re-listing of every
// input/output already visible in the full results below it. Works entirely from the
// active underwriting (results/sensitivity/riskFlags); has no dependency on saved or
// compared scenarios.
function RealEstateDealSummary({
  dealName,
  purchasePrice,
  goingInNoi,
  holdPeriodYears,
  ltv,
  interestRate,
  amortizationYears,
  loanMaturityYears,
  exitCapRate,
  results,
  sensitivity,
  riskFlags,
}) {
  const range = sensitivity ? irrRange(sensitivity) : null

  return (
    <div className="deal-summary">
      <div className="deal-summary-header">
        <h2>{dealName || 'Real Estate Underwriting Summary'}</h2>
        <p className="deal-summary-subtitle">
          {holdPeriodYears}-Year Hold &middot; Generated {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="deal-summary-headline">
        <div className="deal-summary-headline-item">
          <span className="label">IRR</span>
          <span className="value">{results.irr === null ? 'n/a' : percent(results.irr)}</span>
        </div>
        <div className="deal-summary-headline-item">
          <span className="label">Equity Multiple</span>
          <span className="value">{results.equity_multiple.toFixed(2)}x</span>
        </div>
        <div className="deal-summary-headline-item">
          <span className="label">Cash-on-Cash (Yr 1)</span>
          <span className="value">{percent(results.cash_on_cash_year_1)}</span>
        </div>
        <div className="deal-summary-headline-item">
          <span className="label">Equity Required</span>
          <span className="value">{currency(results.initial_equity)}</span>
        </div>
      </div>

      <h3>Deal at a Glance</h3>
      <div className="metrics">
        <div className="metric">
          <span className="label">Purchase Price</span>
          <span className="value">{currency(purchasePrice)}</span>
        </div>
        <div className="metric">
          <span className="label">Going-in NOI</span>
          <span className="value">{currency(goingInNoi)}</span>
        </div>
        <div className="metric">
          <span className="label">Going-in Cap Rate</span>
          <span className="value">{percent(results.going_in_cap_rate)}</span>
        </div>
        <div className="metric">
          <span className="label">Exit Cap Rate</span>
          <span className="value">{percent(exitCapRate)}</span>
        </div>
        <div className="metric">
          <span className="label">Exit Value</span>
          <span className="value">{currency(results.exit.gross_sale_price)}</span>
        </div>
        <div className="metric">
          <span className="label">Net Sale Proceeds</span>
          <span className="value">{currency(results.exit.net_sale_proceeds)}</span>
        </div>
      </div>

      <h3>Financing</h3>
      <p className="financing-line">
        {percent(ltv)} LTV &middot; {percent(interestRate)} interest &middot; {amortizationYears}
        -year amortization &middot; {loanMaturityYears}-year loan maturity
      </p>
      <div className="metrics">
        <div className="metric">
          <span className="label">Year-1 DSCR</span>
          <span className="value">{results.going_in_dscr.toFixed(2)}x</span>
        </div>
        <div className="metric">
          <span className="label">Debt Yield</span>
          <span className="value">{percent(results.debt_yield)}</span>
        </div>
      </div>

      {sensitivity && (
        <>
          <h3>Sensitivity: IRR by Exit Cap Rate &amp; Hold Period</h3>
          <RealEstateSensitivityGrid
            sensitivity={sensitivity}
            baseExitCapRate={exitCapRate}
            baseHoldPeriod={holdPeriodYears}
            compact
          />
          {range && (
            <p className="assumptions">
              Tested IRR range: {percent(range.min)} &ndash; {percent(range.max)} across all
              exit cap rate / hold period combinations.
            </p>
          )}
        </>
      )}

      {riskFlags && (
        <>
          <h3>Deterministic Risk Flags</h3>
          {riskFlags.length === 0 ? (
            <p className="assumptions">
              No deterministic risk flags triggered under the current analysis rules.
            </p>
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
    </div>
  )
}

export default RealEstateDealSummary
