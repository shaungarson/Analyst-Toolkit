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

// Compact, contextual entry point for the embedded Costco demo - a single toggle next to
// "Load Example" in the header row, not a permanent section of the page. Collapsed by
// default; expands to the disclosure (what this is, exactly which two dates/sources feed
// it) and the three case buttons. Stays expanded once a case is loaded (set by the parent
// via `open`) so the disclosure remains visible for as long as the demo data is on screen,
// but the analyst can collapse it back down without losing the loaded case.
function CostcoDemoPanel({ activeCaseId, onLoadCase, open, onToggle }) {
  const activeCase = COSTCO_CASES.find((c) => c.id === activeCaseId)

  return (
    <div className="costco-demo-panel no-print">
      <button
        type="button"
        className="link-toggle costco-demo-toggle"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
      >
        Costco Demo {open ? '▲' : '▼'}
      </button>

      {open && (
        <div className="costco-demo-body">
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

          <div className="costco-demo-cases">
            {COSTCO_CASES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={activeCaseId === c.id ? 'costco-case-btn costco-case-btn--active' : 'costco-case-btn'}
                onClick={() => onLoadCase(c.id)}
                title={c.description}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Visible, not hover-only - the title attribute above is a convenience for
              previewing an unselected case, not the sole way to read what a case means. */}
          {activeCase && <p className="costco-demo-case-description">{activeCase.description}</p>}

          <p className="costco-demo-note">
            Only the explicit-period FCF growth assumption changes between cases (Downside{' '}
            {COSTCO_CASES[0].fcfGrowthRate}%/yr · Base {COSTCO_CASES[1].fcfGrowthRate}%/yr ·
            Upside {COSTCO_CASES[2].fcfGrowthRate}%/yr) - WACC ({COSTCO_SHARED_ASSUMPTIONS.wacc}%)
            and terminal growth ({COSTCO_SHARED_ASSUMPTIONS.terminalGrowthRate}%) stay fixed
            across all three, so the comparison isolates one assumption at a time. All five
            figures are illustrative analyst assumptions for this demo, not Costco management
            guidance or a sourced forecast.
          </p>
        </div>
      )}
    </div>
  )
}

export default CostcoDemoPanel
