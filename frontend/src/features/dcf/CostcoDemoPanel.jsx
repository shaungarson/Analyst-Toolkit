import { useId, useState } from 'react'
import { compactCurrency } from '../../lib/format'
import {
  COSTCO_CASES,
  COSTCO_COMPANY_DATA,
  COSTCO_FINANCIALS_FISCAL_YEAR_END,
  COSTCO_FINANCIALS_FILED,
  COSTCO_MARKET_CAP_DATE,
  COSTCO_MARKET_CAP_SOURCE_LABEL,
  COSTCO_MARKET_CAP_SOURCE_URL,
  COSTCO_REFERENCE_PRICE,
  COSTCO_REFERENCE_PRICE_DATE,
  COSTCO_REFERENCE_PRICE_SOURCE_LABEL,
  COSTCO_REFERENCE_PRICE_SOURCE_URL,
  COSTCO_SHARED_ASSUMPTIONS,
} from './costcoDemo'

// Purely a disclosure now - no case selection here at all. Opening the Costco Demo header
// button activates the demo immediately in whichever mode is currently selected (see
// DcfValuation.jsx's activateCostcoDemo); in Quick mode, switching among Low/Base/High
// Growth happens via the result tabs under Valuation Summary, not here. Entirely externally
// controlled - the "Costco Demo" button that opens/closes this lives in CompanyHeader, so
// this component owns no toggle state of its own and renders nothing while `open` is false.
//
// The top disclosure paragraph (frozen snapshot, no live lookup) is shared by both modes
// unchanged; only the second paragraph is mode-specific, since Quick mode's three-case setup
// and Driver mode's single five-year schedule have nothing in common to describe together.
// Below the stacked-layout breakpoint this content is ~120 words of provenance prose that
// filled most of the first screen before any data or control was reachable. It is the
// disclosure that makes the demo honest, so it is collapsed rather than cut - and only on
// small screens, where the cost of showing it is highest.
//
// The initial state is resolved once from the same breakpoint the stacked layout uses, rather
// than tracked on resize: this is a starting position, not a mode, and re-collapsing a panel
// the analyst deliberately opened because they rotated their phone would be worse than leaving
// it open. Where matchMedia is unavailable (jsdom) it defaults to open, matching desktop.
const STACKED_LAYOUT_QUERY = '(max-width: 719.98px)'

function isStackedLayout() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(STACKED_LAYOUT_QUERY).matches
    : false
}

function CostcoDemoPanel({ open, forecastMode }) {
  const [detailsOpen, setDetailsOpen] = useState(() => !isStackedLayout())
  const detailsId = useId()

  if (!open) return null

  return (
    <div className="costco-demo-panel no-print">
      {/* Trigger is hidden above the breakpoint, where the content is shown outright. */}
      <button
        type="button"
        className="costco-demo-details-toggle"
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        onClick={() => setDetailsOpen((v) => !v)}
      >
        Demo data and assumptions <span aria-hidden="true">{detailsOpen ? '▴' : '▾'}</span>
      </button>
      <div
        id={detailsId}
        className={detailsOpen ? 'costco-demo-body' : 'costco-demo-body costco-demo-body--collapsed'}
      >
        <p className="costco-demo-disclosure">
          <strong>Embedded demonstration snapshot</strong> - Costco Wholesale (COST), frozen
          data, not a live lookup. Financials: fiscal year ended{' '}
          {COSTCO_FINANCIALS_FISCAL_YEAR_END} (SEC EDGAR 10-K, filed {COSTCO_FINANCIALS_FILED}).
          Reference price: ${COSTCO_REFERENCE_PRICE} as of {COSTCO_REFERENCE_PRICE_DATE} (
          <a href={COSTCO_REFERENCE_PRICE_SOURCE_URL} target="_blank" rel="noreferrer">
            {COSTCO_REFERENCE_PRICE_SOURCE_LABEL}
          </a>
          , since Alpha Vantage's quote was unavailable when this snapshot was built - not
          SEC-sourced, not live). Market cap:{' '}
          {compactCurrency(COSTCO_COMPANY_DATA.profile.market_capitalization)} as of{' '}
          {COSTCO_MARKET_CAP_DATE} (
          <a href={COSTCO_MARKET_CAP_SOURCE_URL} target="_blank" rel="noreferrer">
            {COSTCO_MARKET_CAP_SOURCE_LABEL}
          </a>{' '}
          - not SEC-sourced, not live).
        </p>

        {forecastMode === 'driver' ? (
          <p className="costco-demo-note">
            <strong>Driver Base Case</strong> - five forecast years, WACC{' '}
            {COSTCO_SHARED_ASSUMPTIONS.wacc}% and terminal growth{' '}
            {COSTCO_SHARED_ASSUMPTIONS.terminalGrowthRate}%. Revenue Growth, EBIT Margin, Tax
            Rate, D&amp;A and CapEx are <strong>history-informed</strong> starting points derived
            from the same frozen history, matching what Initialize Forecast would produce. NWC
            Investment is <strong>not</strong> history-informed, because Costco's working-capital
            history is classified Unstable. It is instead preset to a flat, explicit, rounded demo
            assumption near &mdash; but not equal to &mdash; the historical aggregate. Review every
            row, especially NWC, before relying on the result; nothing here is Costco management
            guidance or a sourced forecast.
          </p>
        ) : (
          <p className="costco-demo-note">
            {COSTCO_CASES[0].label} ({COSTCO_CASES[0].fcfGrowthRate}%/yr),{' '}
            {COSTCO_CASES[1].label} ({COSTCO_CASES[1].fcfGrowthRate}%/yr), and{' '}
            {COSTCO_CASES[2].label} ({COSTCO_CASES[2].fcfGrowthRate}%/yr) share the same WACC (
            {COSTCO_SHARED_ASSUMPTIONS.wacc}%) and terminal growth (
            {COSTCO_SHARED_ASSUMPTIONS.terminalGrowthRate}%) - only the explicit-period FCF
            growth assumption differs, so the comparison isolates one variable. One click of
            Run Valuation (in Valuation Summary below) calculates all three; all figures are
            illustrative analyst assumptions for this demo, not Costco management guidance or a
            sourced forecast.
          </p>
        )}
      </div>
    </div>
  )
}

export default CostcoDemoPanel
