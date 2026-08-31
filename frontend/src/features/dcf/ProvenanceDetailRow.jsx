import ProvenanceDot from './ProvenanceDot'
import { STATUS_LABEL, SOURCE_LABEL } from './provenanceLabels'

// Shared with SourcedHistoryPanel's selected-cell popover, so the latest-period "Sources"
// panel and an inspected historical cell present a field's provenance identically rather
// than maintaining two renderings of the same data.
function ProvenanceComponentLine({ component }) {
  const parts = [SOURCE_LABEL[component.source] || component.source]
  if (component.tag) parts.push(component.tag)
  if (component.alpha_vantage_field) parts.push(component.alpha_vantage_field)
  if (component.fiscal_year && component.fiscal_period) {
    parts.push(`FY${component.fiscal_year} ${component.fiscal_period}`)
  }
  if (component.form) parts.push(component.form)
  if (component.filed) parts.push(`filed ${component.filed}`)
  if (component.accession_number) parts.push(`accession ${component.accession_number}`)

  return (
    <li className="prov-detail-component">
      {parts.join(' · ')}
      {component.source_url && (
        <>
          {' '}
          <a href={component.source_url} target="_blank" rel="noreferrer">
            filing ↗
          </a>
        </>
      )}
    </li>
  )
}

function ProvenanceDetailRow({ label, provenance }) {
  if (!provenance) {
    return (
      <div className="prov-detail-row">
        <div className="prov-detail-head">
          <span className="prov-detail-field">{label}</span>
          <span className="prov-detail-status">n/a</span>
        </div>
      </div>
    )
  }

  const { status, components, formula } = provenance
  return (
    <div className="prov-detail-row">
      <div className="prov-detail-head">
        <ProvenanceDot status={status} />
        <span className="prov-detail-field">{label}</span>
        <span className="prov-detail-status">{STATUS_LABEL[status]}</span>
      </div>
      {status === 'calculated' ? (
        <p className="prov-detail-formula">{formula}</p>
      ) : (
        <ul className="prov-detail-components">
          {components.map((component, i) => (
            <ProvenanceComponentLine key={i} component={component} />
          ))}
        </ul>
      )}
    </div>
  )
}

export default ProvenanceDetailRow
