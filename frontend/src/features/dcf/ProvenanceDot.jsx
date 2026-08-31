import { STATUS_LABEL, STATUS_DESCRIPTION } from './provenanceLabels'

// Compact, always-visible status signal - a single colored dot rather than a text badge
// per value, so a nine-row panel or an eleven-column table doesn't turn into a wall of
// badges. The full status name and a plain-language explanation are available via the
// native title tooltip.
function ProvenanceDot({ status }) {
  if (!status) return null
  return (
    <span
      className={`prov-dot prov-dot--${status}`}
      title={`${STATUS_LABEL[status]} — ${STATUS_DESCRIPTION[status]}`}
      aria-label={STATUS_LABEL[status]}
    />
  )
}

export default ProvenanceDot
