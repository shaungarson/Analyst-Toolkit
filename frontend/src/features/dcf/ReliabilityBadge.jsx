import { useEffect, useId, useRef, useState } from 'react'

// Shown only for NWC Investment's 'unstable' state (see classifyNwc in driverHistory.js -
// the generic classify() used by every other driver never returns 'unstable', so this copy
// is deliberately NWC-specific rather than a generic "what does this status mean" text).
const UNSTABLE_NWC_INFO = {
  heading: 'What "Unstable" means',
  paragraph:
    'Historical NWC investment is too inconsistent to provide a reliable automatic forecast. This commonly occurs when revenue changes are small, working-capital movements reverse direction, or inventory, receivables, and payables move unevenly. It does not necessarily indicate that the business has a working-capital problem.',
  stepsHeading: 'How to proceed:',
  steps: [
    'Do not automatically copy the displayed historical aggregate.',
    'Use a normalized assumption supported by the company’s business model or a longer history.',
    'If no defensible estimate is available, use 0% as a neutral preliminary assumption.',
    'Test positive and negative NWC assumptions to determine how sensitive the valuation is.',
    'If valuation is materially sensitive, investigate receivables, inventory, and payables before relying on the result.',
  ],
}

// Fixed-position, computed from the trigger's own bounding rect rather than a CSS-anchored
// absolute position: the badge sits inside a horizontally scrolling table
// (`.table-wrap { overflow-x: auto }`, which per the CSS overflow spec also makes the
// cross-axis compute to 'auto'), so an absolutely-positioned popover could be clipped or
// scrolled out of view by that ancestor.
const POPOVER_WIDTH = 320
const VIEWPORT_MARGIN = 12
const ESTIMATED_POPOVER_HEIGHT = 220

function computePosition(rect) {
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
  let left = rect.left
  if (left + width > window.innerWidth - VIEWPORT_MARGIN) left = window.innerWidth - VIEWPORT_MARGIN - width
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN
  const spaceBelow = window.innerHeight - rect.bottom
  const openUpward = spaceBelow < ESTIMATED_POPOVER_HEIGHT && rect.top > spaceBelow
  return openUpward
    ? { left, width, bottom: window.innerHeight - rect.top + 6 }
    : { left, width, top: rect.bottom + 6 }
}

// Reliability badge for a driver's history cell. Interactive (a button that opens an
// explanatory popover) only for NWC Investment's 'unstable' state; every other
// reliability/field combination renders exactly the plain-text badge it always has, so
// nothing about the existing thin/insufficient badges changes.
function ReliabilityBadge({ field, reliability, label }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const popoverId = useId()
  const headingId = `${popoverId}-heading`

  const interactive = field === 'nwcInvestmentPct' && reliability === 'unstable'

  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (e) => {
      if (panelRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!label) return null

  if (!interactive) {
    return <span className={`driver-reliability driver-reliability--${reliability}`}>{label}</span>
  }

  const toggle = () => {
    if (!open) setPosition(computePosition(triggerRef.current.getBoundingClientRect()))
    setOpen((v) => !v)
  }

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="driver-reliability driver-reliability--unstable driver-reliability-btn"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={toggle}
      >
        {label}
      </button>
      {open && position && (
        <div
          id={popoverId}
          ref={panelRef}
          role="dialog"
          aria-labelledby={headingId}
          tabIndex={-1}
          className="reliability-popover"
          style={{ position: 'fixed', ...position }}
        >
          <div className="reliability-popover-head">
            <h4 id={headingId}>{UNSTABLE_NWC_INFO.heading}</h4>
            <button type="button" className="reliability-popover-close" aria-label="Close" onClick={close}>
              ✕
            </button>
          </div>
          <p>{UNSTABLE_NWC_INFO.paragraph}</p>
          <p className="reliability-popover-subhead">{UNSTABLE_NWC_INFO.stepsHeading}</p>
          <ol>
            {UNSTABLE_NWC_INFO.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}

export default ReliabilityBadge
