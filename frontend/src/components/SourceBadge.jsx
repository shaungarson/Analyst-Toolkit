const LABELS = {
  sourced: 'Sourced',
  adjusted: 'Adjusted',
  analyst: 'Analyst Input',
}

// Small provenance tag for a form field: "sourced" means the value currently shown is
// exactly what a data provider returned; "adjusted" means it started sourced but the
// analyst has since edited it; "analyst" means the field is always manual judgment.
// Never decorative - callers should only pass a variant that's actually true right now.
function SourceBadge({ type }) {
  return <span className={`source-badge source-badge--${type}`}>{LABELS[type]}</span>
}

export default SourceBadge
