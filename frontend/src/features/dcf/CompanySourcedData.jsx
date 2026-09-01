import { useState } from 'react'
import { compactCurrency, percent } from '../../lib/format'
import ProvenanceDot from './ProvenanceDot'
import ProvenanceDetailRow from './ProvenanceDetailRow'
import HistoricalTrendCharts from './HistoricalTrendCharts'
import { STATUS_LABEL } from './provenanceLabels'

const fmt = (value, formatter) => (value === null || value === undefined ? 'n/a' : formatter(value))

// Latest-period fields shown by default, most decision-relevant first. Unlevered FCF is
// rendered separately below as an emphasized "subtotal" row since it's the figure that
// actually feeds the model.
const KEY_FIELDS = [
  { key: 'revenue', label: 'Revenue', format: compactCurrency },
  { key: 'revenue_growth', label: 'Revenue Growth', format: percent },
  { key: 'ebit', label: 'EBIT', format: compactCurrency },
  { key: 'operating_margin', label: 'Operating Margin', format: percent },
  { key: 'effective_tax_rate', label: 'Effective Tax Rate', format: percent },
  { key: 'depreciation_and_amortization', label: 'D&A', format: compactCurrency },
  { key: 'capital_expenditures', label: 'CapEx', format: compactCurrency },
  { key: 'change_in_nwc', label: 'Δ NWC', format: compactCurrency },
  { key: 'net_debt', label: 'Net Debt', format: compactCurrency },
]

// The fields the "Sources" detail panel walks through, in the same order as the compact
// list above, plus Unlevered FCF (shown separately in the compact view as an emphasized
// subtotal, but it has its own provenance - a formula over already-sourced fields - worth
// disclosing too).
const PROVENANCE_FIELDS = [...KEY_FIELDS, { key: 'unlevered_fcf', label: 'Unlevered FCF' }]

// Displays what was actually retrieved, kept visually and structurally separate from the
// editable assumption column - historical/company data is a sourced input, not a finished
// valuation, and this panel is never itself fed back into the calculation engine. Company
// identity/price fields live once in the CompanyHeader bar above, so this component sticks
// to the per-period financials. Defaults to the latest period only, compact; the full
// multi-year history is one click away (rendered full-width by the parent as
// SourcedHistoryPanel, not squeezed into this narrow column) - not removed.
function CompanySourcedData({ companyData, showHistory, onToggleHistory }) {
  const { profile, periods } = companyData
  const latest = periods[0]
  const [showSources, setShowSources] = useState(false)

  return (
    <div className="sourced-data-compact">
      <dl className="kv-list">
        {KEY_FIELDS.map(({ key, label, format }) => (
          <div className="kv-row" key={key}>
            <dt>{label}</dt>
            <dd>
              {fmt(latest[key], format)}
              <ProvenanceDot status={latest.provenance?.[key]?.status} />
            </dd>
          </div>
        ))}
        <div className="kv-row kv-row--emphasis">
          <dt>Unlevered FCF</dt>
          <dd>
            {fmt(latest.unlevered_fcf, compactCurrency)}
            <ProvenanceDot status={latest.provenance?.unlevered_fcf?.status} />
          </dd>
        </div>
      </dl>

      <p className="sourced-data-note">
        FY {latest.fiscal_year_end}, as reported. UFCF = EBIT × (1 − tax rate) + D&amp;A − CapEx
        − ΔNWC.
      </p>

      <HistoricalTrendCharts periods={periods} />

      <div className="sourced-data-links">
        <button
          type="button"
          className="link-toggle no-print"
          onClick={() => setShowSources((v) => !v)}
          aria-expanded={showSources}
        >
          Sources {showSources ? '▲' : '▼'}
        </button>
        {periods.length > 1 && (
          <button type="button" className="link-toggle no-print" onClick={onToggleHistory}>
            {showHistory ? 'Hide' : `${periods.length}-yr history`} {showHistory ? '▲' : '▼'}
          </button>
        )}
        {profile.sec_filings_url && (
          <a
            className="link-toggle"
            href={profile.sec_filings_url}
            target="_blank"
            rel="noreferrer"
          >
            SEC filings ↗
          </a>
        )}
      </div>

      {showSources && (
        <div className="prov-detail-panel no-print">
          <p className="prov-detail-legend">
            {Object.entries(STATUS_LABEL).map(([status, label]) => (
              <span className="prov-detail-legend-item" key={status}>
                <ProvenanceDot status={status} />
                {label}
              </span>
            ))}
          </p>
          {PROVENANCE_FIELDS.map(({ key, label }) => (
            <ProvenanceDetailRow key={key} label={label} provenance={latest.provenance?.[key]} />
          ))}
        </div>
      )}
    </div>
  )
}

export default CompanySourcedData
