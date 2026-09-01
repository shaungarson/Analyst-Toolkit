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
// button activates Base Growth immediately (see DcfValuation.jsx's activateCostcoDemo);
// switching among Low/Base/High Growth happens via the result tabs under Valuation Summary,
// not here. Entirely externally controlled - the "Costco Demo" button that opens/closes
// this lives in CompanyHeader, so this component owns no toggle state of its own and
// renders nothing while `open` is false.
function CostcoDemoPanel({ open }) {
  if (!open) return null

  return (
    <div className="costco-demo-panel no-print">
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
      </div>
    </div>
  )
}

export default CostcoDemoPanel
