import { useId, useState } from 'react'

// One "How to read this" disclosure, shared by the two Analysis Outputs charts whose
// methodology runs deeper than a caption can hold. Everything a reader needs to interpret
// the numbers on screen - what shifted, what is held constant, the base case, and any
// warning this run actually raised - stays visible above; this holds the standing
// explanation of how the test is constructed.
//
// Same idiom as NwcGuidanceDisclosure and the footer Methodology toggle: a
// <button aria-expanded> pointing at a region that stays in the DOM while collapsed, not
// <details>/<summary>. Keeping the region mounted is what makes `aria-controls` a stable
// target and what lets print.css's `.no-screen { display: block !important }` put the full
// methodology back on paper without any print-specific markup here.
//
// `label` is not shown: three buttons reading "How to read this" on one page are
// indistinguishable in a screen reader's list of controls, so each names its own chart in
// its accessible name.
function ChartNotes({ label, children }) {
  const [open, setOpen] = useState(false)
  const regionId = useId()

  return (
    <div className="chart-notes">
      <button
        type="button"
        className="chart-notes-toggle no-print"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
      >
        How to read this<span className="visually-hidden">: {label}</span>{' '}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <div id={regionId} className={open ? 'chart-notes-body' : 'chart-notes-body no-screen'}>
        {children}
      </div>
    </div>
  )
}

export default ChartNotes
