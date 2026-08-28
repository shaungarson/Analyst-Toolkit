import { compactCurrency } from '../../lib/format'

const fmt = (value, formatter) => (value === null || value === undefined ? 'n/a' : formatter(value))
const dollarsPerShare = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// One compact row split into three visually distinct groups - identity, key market data,
// provenance - rather than one run-on line. Ticker search stays in a fixed position on the
// right at all times (no layout jump between states); it's visually prominent before a
// company loads (the primary action available) and steps back to a lighter treatment once
// a company is loaded, so the company becomes the focal point and switching stays easy but
// secondary. Every field here comes straight from CompanyProfile - no logo (no data source
// provides one) and no invented timestamp (the API doesn't return a fetch time).
function CompanyHeader({ profile, ticker, setTicker, onLoadCompany, companyLoading, onLoadExample, companyError }) {
  return (
    <div className="company-bar">
      <div className="company-bar-row">
        {profile ? (
          <>
            <div className="company-bar-identity">
              <div className="company-bar-name-line">
                <span className="company-bar-name">{profile.company_name}</span>
                <span className="company-bar-ticker">{profile.ticker}</span>
              </div>
              <div className="company-bar-classification">
                {[profile.sector, profile.industry, profile.exchange].filter(Boolean).join(' · ') || 'n/a'}
              </div>
            </div>

            <div className="company-bar-market-data">
              <div className="company-bar-metric">
                <span className="metric-label">Price</span>
                <span className="metric-value">{fmt(profile.current_price, dollarsPerShare)}</span>
              </div>
              <div className="company-bar-metric">
                <span className="metric-label">Mkt Cap</span>
                <span className="metric-value">{fmt(profile.market_capitalization, compactCurrency)}</span>
              </div>
            </div>

            <div className="company-bar-provenance">Alpha Vantage · as reported</div>
          </>
        ) : (
          <span className="company-bar-empty">
            No company loaded — search a ticker or load the example.
          </span>
        )}

        <form
          onSubmit={onLoadCompany}
          className={profile ? 'company-bar-search company-bar-search--compact' : 'company-bar-search'}
        >
          <input
            type="text"
            placeholder="e.g. AAPL"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
          />
          <button type="submit" className={profile ? 'secondary' : undefined} disabled={companyLoading || !ticker.trim()}>
            {companyLoading ? 'Loading…' : 'Load Company'}
          </button>
          <button type="button" className="secondary" onClick={onLoadExample}>
            Load Example
          </button>
        </form>
      </div>

      {companyError && <p className="error">{companyError}</p>}
    </div>
  )
}

export default CompanyHeader
