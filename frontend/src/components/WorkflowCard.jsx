// Numbered card wrapper used for a full-width workflow section. `step` is optional so this
// can also wrap unnumbered content. `dense` trims padding/margins for a section that sits
// among tighter, less card-like neighbors rather than standing alone.
function WorkflowCard({ step, title, subtitle, actions, dense, className = '', children }) {
  return (
    <section className={`workflow-card ${dense ? 'workflow-card--dense' : ''} ${className}`.trim()}>
      <div className="workflow-card-header">
        {/* Decorative: the numeral duplicates the sequence the headings already
            establish, and reads as a bare "4" before the section name otherwise. */}
        {step != null && (
          <span className="workflow-card-step" aria-hidden="true">
            {step}
          </span>
        )}
        <h2>{title}</h2>
        {actions}
        {subtitle && <p className="workflow-card-subtitle">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

export default WorkflowCard
