import { useId, useState } from 'react'

// Replaces the former floating popover on the NWC reliability badge. Three things changed and
// each was a defect rather than a preference:
//
// - The trigger is the note row beneath the driver, not the status badge. The badge sat inside
//   a horizontally scrolling table, which is why the old version needed a fixed-position layer
//   with hand-computed placement, a flip estimate, an outside-click listener and manual focus
//   return. An inline region under the row cannot be clipped, so all of that is gone.
// - The badge is now static text. "Unstable" is the status; it is not also a control.
// - "Unstable" appears once. The old note row repeated the word before its explanation.
//
// A <button aria-expanded> toggling a region, rather than <details>/<summary>: this workspace
// already uses that pattern for "How to read this", "Methodology", "Sources" and "5-yr
// history", and a fifth disclosure behaving differently on the same page would be worse than
// the small amount of state kept here.
const GUIDANCE = [
  {
    label: 'What happened',
    text:
      'Working capital switched between consuming and releasing cash as revenue grew, so one ' +
      'historical ratio is unreliable.',
  },
  {
    label: 'What to do',
    text:
      'Choose a normalized assumption using analyst judgment. Use 0% if no defensible ' +
      'relationship exists. Sensitivity-test both directions.',
  },
]

function NwcGuidanceDisclosure() {
  const [open, setOpen] = useState(false)
  const regionId = useId()

  return (
    <div className="driver-guidance">
      <button
        type="button"
        className="driver-guidance-toggle no-print"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
      >
        Why this benchmark was not used and how to set the assumption{' '}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <div id={regionId} className={open ? 'driver-guidance-body' : 'driver-guidance-body no-screen'}>
        {GUIDANCE.map(({ label, text }) => (
          <p key={label} className="driver-guidance-part">
            <span className="driver-guidance-part-label">{label}</span>
            <span className="driver-guidance-part-text">{text}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

export default NwcGuidanceDisclosure
