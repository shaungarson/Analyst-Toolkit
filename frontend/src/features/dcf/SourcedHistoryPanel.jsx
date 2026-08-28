import { compactCurrency, percent } from '../../lib/format'

const fmt = (value, formatter) => (value === null || value === undefined ? 'n/a' : formatter(value))

// Full-width detail view for the multi-year history that CompanySourcedData only
// summarizes (latest period only, in a narrow column). Rendered beneath the 3-column
// analytical row rather than inside Step 1's column, where an 11-column table has no room
// and forces a horizontal scrollbar even on desktop. Always in the DOM once there's more
// than one period (screen visibility toggled via the `visible` prop/.no-screen), so print
// always includes the full history regardless of on-screen expand state - same pattern
// used for the methodology note and the analysis-output tabs.
function SourcedHistoryPanel({ periods, visible }) {
  return (
    <section className={visible ? 'history-panel' : 'history-panel no-screen'}>
      <h3>5-Year Financial History</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>FY End</th>
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
                <td>{fmt(p.revenue, compactCurrency)}</td>
                <td>{fmt(p.revenue_growth, percent)}</td>
                <td>{fmt(p.ebit, compactCurrency)}</td>
                <td>{fmt(p.operating_margin, percent)}</td>
                <td>{fmt(p.effective_tax_rate, percent)}</td>
                <td>{fmt(p.depreciation_and_amortization, compactCurrency)}</td>
                <td>{fmt(p.capital_expenditures, compactCurrency)}</td>
                <td>{fmt(p.change_in_nwc, compactCurrency)}</td>
                <td>{fmt(p.net_debt, compactCurrency)}</td>
                <td>{fmt(p.unlevered_fcf, compactCurrency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default SourcedHistoryPanel
