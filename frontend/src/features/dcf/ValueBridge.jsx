import { compactCurrency, compactShares } from '../../lib/format'

const dollarsPerShare = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// Enterprise Value, the Net Debt adjustment, and Equity Value are all real dollar amounts,
// so those three render as proportional bars on one shared scale (width computed from the
// actual figures - no chart library) and are visually bracketed together as one
// calculation. Shares and Value per Share change units (total dollars -> dollars/share), so
// that step is a distinct highlighted callout instead of a fourth bar on the same scale,
// where it would be visually meaningless.
function ValueBridge({ results, netDebt, dilutedSharesOutstanding }) {
  const isNetCash = netDebt < 0
  const ev = results.enterprise_value
  const eq = results.equity_value
  const maxMagnitude = Math.max(ev, eq, Math.abs(netDebt), 1)
  const widthPct = (v) => `${Math.max((Math.abs(v) / maxMagnitude) * 100, 2)}%`

  return (
    <div className="value-bridge-vertical">
      <div className="vb-calculation">
        <div className="vb-row">
          <span className="vb-label">Enterprise Value</span>
          <div className="vb-bar-track">
            <div className="vb-bar vb-bar--ev" style={{ width: widthPct(ev) }} />
          </div>
          <span className="vb-amount">{compactCurrency(ev)}</span>
        </div>

        <div className="vb-row vb-row--adjustment">
          <span className="vb-label">{isNetCash ? '+ Net Cash' : '− Net Debt'}</span>
          <div className="vb-bar-track">
            <div className="vb-bar vb-bar--adjustment" style={{ width: widthPct(netDebt) }} />
          </div>
          <span className="vb-amount">
            {isNetCash ? '+' : '−'}
            {compactCurrency(Math.abs(netDebt))}
          </span>
        </div>

        <div className="vb-row vb-row--total">
          <span className="vb-label">Equity Value</span>
          <div className="vb-bar-track">
            <div className="vb-bar vb-bar--eq" style={{ width: widthPct(eq) }} />
          </div>
          <span className="vb-amount">{compactCurrency(eq)}</span>
        </div>
      </div>

      <div className="vb-divider">÷ {compactShares(dilutedSharesOutstanding)} diluted shares</div>

      <div className="vb-result">
        <span className="vb-result-label">Implied Value per Share</span>
        <span className="vb-result-value">{dollarsPerShare(results.value_per_share)}</span>
      </div>
    </div>
  )
}

export default ValueBridge
