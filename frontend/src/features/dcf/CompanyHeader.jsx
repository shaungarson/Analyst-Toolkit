import { compactCurrency } from '../../lib/format'

const fmt = (value, formatter) => (value === null || value === undefined ? 'n/a' : formatter(value))

// One compact row split into three visually distinct groups - identity, key market data,
// provenance - rather than one run-on line. Ticker search stays in a fixed position on the
// right at all times (no layout jump between states); it's visually prominent before a
// company loads (the primary action available) and steps back to a lighter treatment once
// a company is loaded, so the company becomes the focal point and switching stays easy but
// secondary. Every field here comes straight from CompanyProfile - no logo (no data source
// provides one) and no invented timestamp (the API doesn't return a fetch time).
//
// Deliberately does not show price here: an editable, dated Reference Price now lives in
// the Assumptions column instead, where it's clear it's an editable analyst input (not a
// live quote) and where it's adjacent to the Implied Upside/Downside comparison it feeds.
// Market cap stays here since it's a passive, non-editable Alpha Vantage figure unrelated
// to the DCF calculation.
function CompanyHeader({
  profile,
  source,
  ticker,
  setTicker,
  onLoadCompany,
  companyLoading,
  companyError,
  isDemoSnapshot,
  isDemoOpen,
  onToggleDemo,
  costcoDemoDisabled,
}) {
  // Reflects the actual response - was hardcoded to "Alpha Vantage" regardless of what
  // actually supplied the data, which became materially misleading once a request could
  // succeed on SEC data alone with Alpha Vantage contributing nothing at all. Per-period
  // provenance (a period can individually be "mixed") is a deferred, richer UI - this stays
  // at the same single-summary-label granularity the header already used, just accurate.
  const fundamentalsLabel = source?.fundamentals_provider === 'sec_edgar' ? 'SEC EDGAR' : 'Alpha Vantage'

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
                <span className="metric-label">Mkt Cap</span>
                <span className="metric-value">{fmt(profile.market_capitalization, compactCurrency)}</span>
              </div>
            </div>

            {isDemoSnapshot ? (
              <div className="company-bar-provenance company-bar-provenance--demo">
                ⬤ Embedded demo snapshot · not live data
              </div>
            ) : (
              <div className="company-bar-provenance">{fundamentalsLabel} · as reported</div>
            )}
          </>
        ) : (
          <span className="company-bar-empty">
            No company loaded — search a ticker or open the Costco demo.
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
          <button
            type="button"
            className="secondary"
            onClick={onToggleDemo}
            aria-expanded={isDemoOpen}
            disabled={costcoDemoDisabled}
            title={costcoDemoDisabled ? 'Not available in Driver-Based mode - Quick DCF only' : undefined}
          >
            Costco Demo {isDemoOpen ? '▲' : '▼'}
          </button>
        </form>
      </div>

      {companyError && <p className="error">{companyError}</p>}
    </div>
  )
}

export default CompanyHeader
