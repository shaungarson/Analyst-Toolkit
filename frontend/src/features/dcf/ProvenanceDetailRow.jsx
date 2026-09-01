import ProvenanceDot from './ProvenanceDot'
import { STATUS_LABEL, SOURCE_LABEL } from './provenanceLabels'

// Human-readable first: source, fiscal period, and filing form - the same three facts a
// reader actually wants before deciding whether to open the filing. Kept deliberately
// separate from technicalLine() below so the two can render at different visual weights
// (friendly prominent, technical muted/secondary) without duplicating the field logic.
function friendlyLine(component) {
  const parts = [SOURCE_LABEL[component.source] || component.source]
  if (component.fiscal_year && component.fiscal_period) {
    parts.push(`FY${component.fiscal_year} ${component.fiscal_period}`)
  }
  if (component.form) parts.push(component.form)
  return parts.join(' · ')
}

// Raw XBRL tag, Alpha Vantage field name, filed date, accession number - the part that
// reads like debugging output, so it renders smaller/muted and after the friendly line,
// never instead of it.
function technicalLine(component) {
  const parts = []
  if (component.tag) parts.push(component.tag)
  if (component.alpha_vantage_field) parts.push(component.alpha_vantage_field)
  if (component.filed) parts.push(`filed ${component.filed}`)
  if (component.accession_number) parts.push(`accession ${component.accession_number}`)
  return parts.join(' · ')
}

// A "combined" field's components almost always come from the same filing (SEC reports a
// period's cash and short-term investments, or its several debt tags, together in one
// filing) - true for every combined field checked live against real SEC data (Apple, WMT,
// Costco). When that holds, repeating an identical "SEC EDGAR · FY2025 10-K" friendly line
// once per component reads as redundant, not thorough. Falls back to one line per component
// on the rarer occasion a combined field's pieces genuinely come from different filings, so
// nothing is ever silently merged across two different accession numbers.
function sameFiling(components) {
  const [first, ...rest] = components
  return rest.every(
    (c) =>
      c.source === first.source &&
      c.fiscal_year === first.fiscal_year &&
      c.fiscal_period === first.fiscal_period &&
      c.form === first.form &&
      c.filed === first.filed &&
      c.accession_number === first.accession_number,
  )
}

function FilingLink({ component }) {
  if (!component.source_url) return null
  return (
    <>
      {' '}
      <a href={component.source_url} target="_blank" rel="noreferrer">
        View filing ↗
      </a>
    </>
  )
}

// Shared with SourcedHistoryPanel's selected-cell popover and the Sources panel's expanded
// rows, so a field's provenance reads identically everywhere it appears rather than
// maintaining several renderings of the same data.
function ProvenanceComponentLine({ component }) {
  const technical = technicalLine(component)
  return (
    <li className="prov-detail-component">
      <div className="prov-detail-component-friendly">
        {friendlyLine(component)}
        <FilingLink component={component} />
      </div>
      {technical && <div className="prov-detail-component-technical">{technical}</div>}
    </li>
  )
}

// The grouped case: one friendly line + filing link for the shared filing, then every
// component's tag folded into a single technical line instead of repeating the filing
// facts per tag.
function GroupedComponentSummary({ components }) {
  const first = components[0]
  const tags = components.map((c) => c.tag || c.alpha_vantage_field).filter(Boolean)
  const technicalParts = []
  if (tags.length > 0) technicalParts.push(tags.join(' + '))
  if (first.filed) technicalParts.push(`filed ${first.filed}`)
  if (first.accession_number) technicalParts.push(`accession ${first.accession_number}`)

  return (
    <li className="prov-detail-component">
      <div className="prov-detail-component-friendly">
        {friendlyLine(first)}
        <FilingLink component={first} />
      </div>
      {technicalParts.length > 0 && (
        <div className="prov-detail-component-technical">{technicalParts.join(' · ')}</div>
      )}
    </li>
  )
}

// The detail content for one field, without its dot/label/status head - factored out so the
// Sources panel's collapsible rows can show the same body under their own compact toggle
// (which already carries the dot/label/status) instead of rendering that head twice.
export function ProvenanceDetailBody({ status, components, formula }) {
  if (status === 'calculated') {
    return <p className="prov-detail-formula">{formula}</p>
  }
  const grouped = components.length > 1 && sameFiling(components)
  return (
    <ul className="prov-detail-components">
      {grouped
        ? [<GroupedComponentSummary key="grouped" components={components} />]
        : components.map((component, i) => <ProvenanceComponentLine key={i} component={component} />)}
    </ul>
  )
}

// Always-expanded field detail (head + body together) - used by SourcedHistoryPanel's
// selected-cell popover, which is already an on-demand disclosure for exactly one field, so
// it doesn't need its own additional collapse/expand layer the way the Sources panel's list
// rows do.
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
      <ProvenanceDetailBody status={status} components={components} formula={formula} />
    </div>
  )
}

export default ProvenanceDetailRow
