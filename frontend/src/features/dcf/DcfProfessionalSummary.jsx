import { compactCurrency, compactShares } from '../../lib/format.js'
import { valueContribution } from './valueComposition.js'
import {
  analystGrowthComparison,
  driverPathSummaries,
  materialWarnings,
  provenanceSummary,
  referenceComparison,
  sensitivityRange,
} from './professionalSummary.js'

// A compact, print-oriented decision artifact: what this valuation concluded, on what
// assumptions, what qualifies it, and where the figures came from - readable once the page has
// been separated from the workspace that produced it.
//
// It is NOT the on-screen Valuation Summary in a different font. That already exists in column 3
// and stays there. This is collapsed by default and exists to be printed or handed over, which is
// why it repeats identity, dates and provenance that the live workspace can leave implicit.
//
// Deliberately excluded, because they belong to the full analysis: the annual forecast schedule,
// the WACC x terminal-growth grid itself, the driver tornado, the growth x margin grid, the
// continuity/composition/bridge charts, the historical trend charts, the Sources inspector, and
// every "How to read this" disclosure.

const perShare = (v) =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'n/a'
const pct = (v, digits = 2) => (Number.isFinite(v) ? `${v.toFixed(digits)}%` : 'n/a')
const pctFromRate = (v, digits = 2) => {
  const n = Number(v)
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : 'n/a'
}

function Row({ label, value }) {
  return (
    <div className="ps-row">
      <span className="ps-row-label">{label}</span>
      <span className="ps-row-value">{value}</span>
    </div>
  )
}

// One driver's path, from its actual per-year values. A Custom row reports start, end AND the
// range it travelled, so an intermediate peak cannot hide behind its endpoints.
function driverPathText(path) {
  if (path.shape === 'flat') return `Flat ${pct(path.start)}`
  const spread = `range ${pct(path.min)}–${pct(path.max)}`
  const modeLabel = path.mode === 'fade' ? 'Fade' : path.mode === 'custom' ? 'Custom' : 'Path'
  return `${modeLabel} ${pct(path.start)} → ${pct(path.end)} (${spread})`
}

function DcfProfessionalSummary({
  companyData,
  isDemoSnapshot,
  demoCaseLabel,
  forecastMode,
  results,
  sensitivity,
  form,
  driverForm,
  baseYearRepresentativeness,
  historicalFcfCagr,
  historicalCagrQualification,
  reverseResult,
  showReverseResult,
  generatedOn,
}) {
  if (!results) return null

  const isDriver = forecastMode === 'driver'
  const profile = companyData?.profile ?? null
  const contribution = valueContribution(results)
  const warnings = materialWarnings(results)
  const range = sensitivityRange(sensitivity)
  const provenance = provenanceSummary(companyData)
  const reference = referenceComparison({
    referencePrice: form.referencePrice,
    referencePriceDate: form.referencePriceDate,
    valuePerShare: results.value_per_share,
  })
  const paths = isDriver ? driverPathSummaries(driverForm?.driverYears, driverForm?.rowModes) : []
  const analystComparison = reverseResult?.status === 'solved'
    ? analystGrowthComparison(reverseResult.implied_fcf_growth_rate * 100, form.fcfGrowthRate)
    : null

  // Quick DCF only, and only under the reliability rule already shipped: a CAGR computed over
  // periods whose working-capital history is unreliable is not a benchmark this artifact may
  // lean on. Driver mode has no single scalar to solve a price against and shows none.
  const showPriceImplied = !isDriver && showReverseResult && reverseResult?.status === 'solved'
  const historicalUsable = historicalFcfCagr != null && !historicalCagrQualification

  // Both of these describe Quick DCF's Base Year UFCF and the unlevered-FCF CAGR built from the
  // same periods. Driver mode does not start from that figure at all - it starts from base-year
  // revenue and projects six drivers - so printing either here would qualify an input this
  // valuation never used. Gated on the mode rather than on the props, which the workspace passes
  // in both modes because the underlying evidence is company-level, not mode-level.
  // Belt and braces with DcfValuation's own gate: activeDemoCaseId is Quick's Low/Base/High case
  // identity and has no meaning in Driver mode, whose demo is a single seeded Base Case.
  const caseLabel = isDriver ? null : demoCaseLabel

  const showBaseYearCaution = !isDriver && baseYearRepresentativeness != null
  const showCagrQualification = !isDriver && historicalCagrQualification != null && historicalFcfCagr != null

  return (
    <section className="professional-summary" aria-labelledby="ps-heading">
      <header className="ps-header">
        <h2 id="ps-heading">
          {profile?.company_name ?? 'DCF Valuation'}
          {profile?.ticker ? <span className="ps-ticker"> ({profile.ticker})</span> : null}
        </h2>
        <p className="ps-subtitle">
          Discounted Cash Flow &middot; {isDriver ? 'Driver-Based' : 'Quick'} mode
          {caseLabel ? ` · ${caseLabel} case` : ''}
          {' · Prepared '}
          {generatedOn}
          {provenance?.fiscalYearEnd ? ` · Financials through FY ${provenance.fiscalYearEnd}` : ''}
        </p>
        {isDemoSnapshot && (
          <p className="ps-demo-flag">
            Embedded demonstration snapshot — frozen historical data, not a live market quote.
          </p>
        )}
      </header>

      <div className="ps-headline">
        <div className="ps-headline-item">
          <span className="ps-headline-label">Implied Value per Share</span>
          <span className="ps-headline-value">{perShare(results.value_per_share)}</span>
        </div>
        {reference && (
          <>
            <div className="ps-headline-item">
              <span className="ps-headline-label">Reference Price ({reference.asOf})</span>
              <span className="ps-headline-value">{perShare(reference.price)}</span>
            </div>
            <div className="ps-headline-item">
              <span className="ps-headline-label">
                Implied {reference.direction === 'upside' ? 'Upside' : 'Downside'}
              </span>
              <span className="ps-headline-value">
                {reference.impliedPct >= 0 ? '+' : ''}
                {reference.impliedPct.toFixed(1)}%
              </span>
            </div>
          </>
        )}
      </div>

      <p className="ps-bridge-line">
        Enterprise value {compactCurrency(results.enterprise_value)} → equity value{' '}
        {compactCurrency(results.equity_value)} ÷ {compactShares(Number(form.dilutedSharesOutstanding))}{' '}
        diluted shares.
      </p>

      <h3>Principal assumptions</h3>
      <div className="ps-grid">
        {isDriver ? (
          <Row label="Base Year Revenue" value={compactCurrency(Number(driverForm?.baseYearRevenue))} />
        ) : (
          <>
            <Row label="Base Year UFCF" value={compactCurrency(Number(form.baseYearFcf))} />
            <Row label="FCF Growth Rate" value={pctFromRate(form.fcfGrowthRate)} />
          </>
        )}
        <Row label="Forecast Period" value={`${form.forecastYears} years`} />
        <Row label="WACC" value={pctFromRate(form.wacc)} />
        <Row label="Terminal Growth" value={pctFromRate(form.terminalGrowthRate)} />
        <Row label="Net Debt" value={compactCurrency(Number(form.netDebt))} />
      </div>

      {isDriver && paths.length > 0 && (
        <>
          <h4 className="ps-subhead">Forecast drivers</h4>
          <div className="ps-grid ps-grid--drivers">
            {paths.map((path) => (
              <Row key={path.field} label={path.label} value={driverPathText(path)} />
            ))}
          </div>
        </>
      )}

      <h3>What drives and qualifies this conclusion</h3>
      <ul className="ps-qualifiers">
        {contribution?.reportable && (
          <li>
            Terminal value contributes {contribution.terminalPct.toFixed(0)}% of enterprise value;
            the explicit {form.forecastYears}-year forecast contributes{' '}
            {contribution.explicitPct.toFixed(0)}%.
          </li>
        )}
        {showBaseYearCaution && (
          <li>
            <strong>Base-year representativeness.</strong> {baseYearRepresentativeness.headline}{' '}
            {baseYearRepresentativeness.reason} The reported figure is correct as sourced; this
            concerns whether it is a typical year to project from.
          </li>
        )}
        {showPriceImplied && (
          <li>
            Price-implied FCF growth of{' '}
            {pct(reverseResult.implied_fcf_growth_rate * 100, 1)}/yr is the constant rate that
            reconciles the reference price on these assumptions — not a market forecast.
            {/* The analyst's own assumption is always relevant and always stated; the historical
                CAGR appears only when it is a reliable benchmark. */}
            {analystComparison ? ` It ${analystComparison}.` : ''}
            {historicalUsable
              ? ` Historical unlevered FCF CAGR over the sourced periods was ${pct(
                  historicalFcfCagr.cagr * 100,
                  1
                )}/yr.`
              : ''}
          </li>
        )}
        {showCagrQualification && (
          <li>
            Historical unlevered FCF CAGR ({pct(historicalFcfCagr.cagr * 100, 1)}/yr) is not used as
            a benchmark here. {historicalCagrQualification}
          </li>
        )}
        {isDriver && (
          <li>
            A multi-driver forecast has no single growth rate to solve a reference price against,
            so no price-implied growth is reported in this mode.
          </li>
        )}
      </ul>

      <h3>Model warnings</h3>
      {warnings.length === 0 ? (
        <p className="ps-none">No model warnings were raised for this run.</p>
      ) : (
        <ul className="ps-warnings">
          {warnings.map((w, i) => (
            <li key={`${w.id}-${w.year ?? 'all'}-${i}`} className={`ps-warning ps-warning--${w.tier}`}>
              {/* No separate year chip: every driver warning's own explanation already opens
                  with "Year N...", so a chip would print the year twice. `year` is still carried
                  in the data for anything that needs to group by it. */}
              <span className="ps-warning-tier">{w.tier}</span>
              <span className="ps-warning-text">{w.explanation}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Tested sensitivity range</h3>
      {range ? (
        <p className="ps-range">
          Across {range.validCells} valid WACC × terminal-growth combinations, value per share
          ranges from <strong>{perShare(range.low.valuePerShare)}</strong> (WACC{' '}
          {pct(range.low.wacc * 100)}, terminal growth {pct(range.low.terminalGrowth * 100)}) to{' '}
          <strong>{perShare(range.high.valuePerShare)}</strong> (WACC {pct(range.high.wacc * 100)},
          terminal growth {pct(range.high.terminalGrowth * 100)}). This is the span of assumptions
          tested, not a probability or a confidence interval.
        </p>
      ) : (
        <p className="ps-none">No sensitivity grid was computed for this run.</p>
      )}

      <footer className="ps-footer">
        {provenance ? (
          <p>
            Historical financials for FY {provenance.fiscalYearEnd} from{' '}
            {provenance.fundamentalsProvider === 'sec_edgar' ? 'SEC EDGAR' : provenance.fundamentalsProvider}
            . Of {provenance.total} sourced fields: {provenance.counts.reported} reported directly,{' '}
            {provenance.counts.combined} combined from several facts, {provenance.counts.calculated}{' '}
            calculated by formula, {provenance.counts.fallback} supplied by a fallback provider.
            {provenance.secFilingsUrl ? ' Source filings are linked from the live workspace.' : ''}
          </p>
        ) : (
          <p>Assumptions entered manually; no sourced company data is attached to this valuation.</p>
        )}
        <p>
          Gordon Growth terminal value, end-of-year discounting. Figures are the output of the
          stated assumptions and are not investment advice.
        </p>
      </footer>
    </section>
  )
}

export default DcfProfessionalSummary
