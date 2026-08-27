import { currency, percent } from '../../lib/format'

const fmt = (value, formatter) => (value === null || value === undefined ? 'n/a' : formatter(value))
const dollarsPerShare = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// Displays what was actually retrieved, kept visually and structurally separate from the
// editable assumption form below it - historical/company data is a sourced input, not a
// finished valuation, and this panel is never itself fed back into the calculation engine.
function CompanySourcedData({ companyData }) {
  const { profile, periods } = companyData
  const latest = periods[0]

  return (
    <div className="results company-sourced-data">
      <div className="results-header">
        <h2>
          {profile.company_name} ({profile.ticker})
        </h2>
      </div>

      <div className="metrics">
        <div className="metric">
          <span className="label">Sector / Industry</span>
          <span className="value">
            {profile.sector || 'n/a'}
            {profile.industry ? ` — ${profile.industry}` : ''}
          </span>
        </div>
        <div className="metric">
          <span className="label">Exchange</span>
          <span className="value">{profile.exchange || 'n/a'}</span>
        </div>
        <div className="metric">
          <span className="label">Market Capitalization</span>
          <span className="value">{fmt(profile.market_capitalization, currency)}</span>
        </div>
        <div className="metric">
          <span className="label">Current Share Price</span>
          <span className="value">{fmt(profile.current_price, dollarsPerShare)}</span>
        </div>
        <div className="metric">
          <span className="label">Shares Outstanding (basic)</span>
          <span className="value">{fmt(profile.shares_outstanding, (v) => v.toLocaleString('en-US'))}</span>
        </div>
      </div>

      {profile.sec_filings_url && (
        <p className="assumptions">
          <a href={profile.sec_filings_url} target="_blank" rel="noreferrer">
            View {profile.ticker}&apos;s filings on SEC EDGAR
          </a>{' '}
          — the figures below are sourced from Alpha Vantage, not yet cross-linked to a
          specific filing; the SEC link is provided so results can be checked against the
          company&apos;s actual 10-K/10-Q filings.
        </p>
      )}

      <h3>Historical Financials (as reported)</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fiscal Year End</th>
              <th>Revenue</th>
              <th>Rev. Growth</th>
              <th>EBIT</th>
              <th>Op. Margin</th>
              <th>Eff. Tax Rate</th>
              <th>D&amp;A</th>
              <th>CapEx</th>
              <th>&Delta; NWC</th>
              <th>Net Debt</th>
              <th>Unlevered FCF</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.fiscal_year_end}>
                <td>{p.fiscal_year_end}</td>
                <td>{fmt(p.revenue, currency)}</td>
                <td>{fmt(p.revenue_growth, percent)}</td>
                <td>{fmt(p.ebit, currency)}</td>
                <td>{fmt(p.operating_margin, percent)}</td>
                <td>{fmt(p.effective_tax_rate, percent)}</td>
                <td>{fmt(p.depreciation_and_amortization, currency)}</td>
                <td>{fmt(p.capital_expenditures, currency)}</td>
                <td>{fmt(p.change_in_nwc, currency)}</td>
                <td>{fmt(p.net_debt, currency)}</td>
                <td>{fmt(p.unlevered_fcf, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="assumptions">
        Revenue, EBIT, D&amp;A, CapEx, and balance-sheet figures above are reported values
        from Alpha Vantage. Effective tax rate, change in NWC, net debt, and Unlevered FCF
        are calculated from those reported figures (UFCF = EBIT &times; (1 &minus; tax
        rate) + D&amp;A &minus; CapEx &minus; change in NWC) — not additional sourced data.
        {latest?.unlevered_fcf != null && (
          <>
            {' '}
            The most recent year&apos;s Unlevered FCF ({currency(latest.unlevered_fcf)}) has
            pre-filled the Base Year Unlevered FCF field below — review and adjust it, along
            with every other assumption, before running the valuation.
          </>
        )}
      </p>
    </div>
  )
}

export default CompanySourcedData
