import { useState } from 'react'
import { compactCurrency, percent } from '../../lib/format'
import ProvenanceDot from './ProvenanceDot'
import ProvenanceDetailRow from './ProvenanceDetailRow'
import { STATUS_LABEL } from './provenanceLabels'

const fmt = (value, formatter) => (value === null || value === undefined ? 'n/a' : formatter(value))

// Same fields/order as CompanySourcedData's compact list plus Unlevered FCF, so the two
// views of the same data read consistently. FY End isn't itself a sourced value (it's the
// period label), so it gets no provenance dot.
const COLUMNS = [
  { key: 'revenue', label: 'Revenue', format: compactCurrency },
  { key: 'revenue_growth', label: 'Rev. Growth', format: percent },
  { key: 'ebit', label: 'EBIT', format: compactCurrency },
  { key: 'operating_margin', label: 'Op. Margin', format: percent },
  { key: 'effective_tax_rate', label: 'Eff. Tax Rate', format: percent },
  { key: 'depreciation_and_amortization', label: 'D&A', format: compactCurrency },
  { key: 'capital_expenditures', label: 'CapEx', format: compactCurrency },
  { key: 'change_in_nwc', label: 'Δ NWC', format: compactCurrency },
  { key: 'net_debt', label: 'Net Debt', format: compactCurrency },
  { key: 'unlevered_fcf', label: 'Unlevered FCF', format: compactCurrency },
]

// Full-width detail view for the multi-year history that CompanySourcedData only
// summarizes (latest period only, in a narrow column). Rendered beneath the 3-column
// analytical row rather than inside Step 1's column, where an 11-column table has no room
// and forces a horizontal scrollbar even on desktop. Always in the DOM once there's more
// than one period (screen visibility toggled via the `visible` prop/.no-screen), so print
// always includes the full history regardless of on-screen expand state - same pattern
// used for the methodology note and the analysis-output tabs.
//
// Per-cell provenance is a compact dot by default (impractical to expand every cell across
// 10 data columns x up to 5 years), but every dot with a status is also a real button - not
// just a hover target - so keyboard (Tab, then Enter/Space) and touch users can inspect an
// older cell's full provenance too, not only mouse-hover users reading the dot's tooltip.
// Selecting a cell opens one shared detail panel below the table (reusing the exact same
// ProvenanceDetailRow CompanySourcedData's "Sources" panel uses, so a field's provenance
// reads identically in both places) rather than expanding metadata inline in every cell.
function SourcedHistoryPanel({ periods, visible }) {
  const [selected, setSelected] = useState(null)

  const selectCell = (fiscalYearEnd, key, label) => {
    setSelected((prev) =>
      prev && prev.fiscalYearEnd === fiscalYearEnd && prev.key === key
        ? null
        : { fiscalYearEnd, key, label },
    )
  }

  const selectedProvenance =
    selected && periods.find((p) => p.fiscal_year_end === selected.fiscalYearEnd)?.provenance?.[selected.key]

  return (
    <section className={visible ? 'history-panel' : 'history-panel no-screen'}>
      <h3 id="sourced-history-heading">5-Year Financial History</h3>
      <div className="table-wrap">
        <table aria-labelledby="sourced-history-heading">
          <thead>
            <tr>
              <th>FY End</th>
              {COLUMNS.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.fiscal_year_end}>
                <td>{p.fiscal_year_end}</td>
                {COLUMNS.map((c) => {
                  const status = p.provenance?.[c.key]?.status
                  const isSelected = selected?.fiscalYearEnd === p.fiscal_year_end && selected?.key === c.key
                  return (
                    <td key={c.key}>
                      {fmt(p[c.key], c.format)}
                      {status && (
                        <button
                          type="button"
                          className="prov-dot-btn"
                          aria-expanded={isSelected}
                          aria-label={`${STATUS_LABEL[status]} — view source details for ${c.label}, FY ${p.fiscal_year_end}`}
                          onClick={() => selectCell(p.fiscal_year_end, c.key, c.label)}
                        >
                          <ProvenanceDot status={status} />
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="prov-detail-panel no-print" aria-live="polite">
          <div className="prov-detail-panel-header">
            <span className="prov-detail-panel-period">FY {selected.fiscalYearEnd}</span>
            <button
              type="button"
              className="prov-detail-panel-close"
              onClick={() => setSelected(null)}
              aria-label="Close source details"
            >
              ✕
            </button>
          </div>
          <ProvenanceDetailRow label={selected.label} provenance={selectedProvenance} />
        </div>
      )}

      <p className="prov-detail-legend">
        {Object.entries(STATUS_LABEL).map(([status, label]) => (
          <span className="prov-detail-legend-item" key={status}>
            <ProvenanceDot status={status} />
            {label}
          </span>
        ))}
      </p>
    </section>
  )
}

export default SourcedHistoryPanel
