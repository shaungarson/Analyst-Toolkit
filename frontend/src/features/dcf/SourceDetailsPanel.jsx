import { useState } from 'react'
import ProvenanceDot from './ProvenanceDot'
import { ProvenanceDetailBody } from './ProvenanceDetailRow'
import { STATUS_LABEL } from './provenanceLabels'

// One field, collapsed by default to a single compact line (dot + name + status). The
// whole point of this panel is staying inside a bounded height instead of dumping every
// field's full metadata into view at once, so detail only renders once a specific field is
// asked for - reusing the exact same ProvenanceDetailBody the history-panel popover uses,
// just without its own dot/label/status head (this row's toggle button already shows that).
function SourceDetailRow({ id, label, provenance }) {
  const [expanded, setExpanded] = useState(false)

  if (!provenance) {
    return (
      <div className="source-detail-row source-detail-row--empty">
        <span className="prov-detail-field">{label}</span>
        <span className="prov-detail-status">n/a</span>
      </div>
    )
  }

  const { status, components, formula } = provenance

  return (
    <div className="source-detail-row">
      <button
        type="button"
        className="source-detail-row-toggle"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((v) => !v)}
      >
        <ProvenanceDot status={status} />
        <span className="prov-detail-field">{label}</span>
        <span className="prov-detail-status">{STATUS_LABEL[status]}</span>
        <span className="source-detail-row-chevron" aria-hidden="true">
          {expanded ? '▲' : '▼'}
        </span>
      </button>
      {expanded && (
        <div id={id} className="source-detail-row-body">
          <ProvenanceDetailBody status={status} components={components} formula={formula} />
        </div>
      )}
    </div>
  )
}

// The "Sources" inspector: bounded height with internal scrolling, not an unbounded section
// that pushes everything below it down the page - the previous version's actual complaint.
// A sticky header keeps the close control reachable while scrolling a longer field list;
// a dynamic status-count summary ("4 reported · 3 calculated") replaces a full always-shown
// legend, which was more chrome than a compact panel needs. Each field is collapsed to one
// line by default; opening one reveals the same friendly-info-first detail body used
// elsewhere, never several fields' full technical metadata at once.
// Deliberately does not move focus into the panel on open - the "Sources" button that was
// just clicked keeps it, same as every other toggle in this app (history, Costco demo).
// Closing is different: onClose explicitly returns focus to that same button, so a
// keyboard user never loses their place once the panel goes away.
function SourceDetailsPanel({ fiscalYearEnd, fields, provenanceByField, onClose }) {
  const headingId = 'source-details-heading'

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  const statusCounts = fields.reduce((acc, { key }) => {
    const status = provenanceByField?.[key]?.status
    if (status) acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  return (
    <div
      className="source-details-panel no-print"
      role="region"
      aria-labelledby={headingId}
      onKeyDown={handleKeyDown}
    >
      <div className="source-details-scroll">
        <div className="prov-detail-panel-header source-details-header">
          <span id={headingId} className="prov-detail-panel-period">
            Source details · FY{fiscalYearEnd.slice(0, 4)}
          </span>
          <button
            type="button"
            className="prov-detail-panel-close"
            onClick={onClose}
            aria-label="Close source details"
          >
            ✕
          </button>
        </div>

        {Object.keys(statusCounts).length > 0 && (
          <p className="source-details-summary">
            {Object.entries(statusCounts).map(([status, count]) => (
              <span className="source-details-summary-item" key={status}>
                <ProvenanceDot status={status} />
                {count} {STATUS_LABEL[status].toLowerCase()}
              </span>
            ))}
          </p>
        )}

        <div className="source-details-rows">
          {fields.map(({ key, label }) => (
            <SourceDetailRow
              key={key}
              id={`source-detail-body-${key}`}
              label={label}
              provenance={provenanceByField?.[key]}
            />
          ))}
        </div>
      </div>
      <div className="source-details-scroll-cue" aria-hidden="true" />
    </div>
  )
}

export default SourceDetailsPanel
