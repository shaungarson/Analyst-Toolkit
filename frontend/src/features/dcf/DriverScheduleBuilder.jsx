import { Fragment } from 'react'
import { compactCurrency } from '../../lib/format'
import SourceBadge from '../../components/SourceBadge'
import FormattedNumberInput from '../../components/FormattedNumberInput'
import { ROW_MODES } from './driverSchedule'

const pct = (v) => (v == null || !Number.isFinite(v) ? 'n/a' : `${v.toFixed(2)}%`)

// One row per driver: which driverYear field it edits, its label, and the shorter label used
// inside the mode controls where the unit suffix would only add noise.
const DRIVER_ROWS = [
  { field: 'revenueGrowthRate', label: 'Revenue Growth (%/yr)' },
  { field: 'ebitMargin', label: 'EBIT Margin (%)' },
  // Neutrally "Tax Rate", not "Cash Tax Rate": the historical evidence beside it is the
  // *book* effective rate, and labeling the row "Cash" put a cash-flow name directly next to
  // a book figure. See the methodology disclosure for how the two relate.
  { field: 'taxRate', label: 'Tax Rate (%)' },
  { field: 'daPctOfRevenue', label: 'D&A (% of Revenue)' },
  { field: 'capexPctOfRevenue', label: 'CapEx (% of Revenue)' },
  { field: 'nwcInvestmentPct', label: 'NWC Investment (% of Δ Revenue)' },
]

const MODE_LABELS = { flat: 'Flat', fade: 'Fade', custom: 'Custom' }
const MODE_TITLES = {
  flat: 'One value applied to every forecast year',
  fade: 'Interpolate in a straight line from a Year 1 value to a final-year target',
  custom: 'Edit every forecast year individually',
}

const RELIABILITY_LABELS = {
  ok: null,
  thin: 'Thin history',
  unstable: 'Unstable',
  insufficient: 'No usable history',
}

// A two-digit fiscal-year-end label ('25), matching the year strip the historical trend
// mini-charts already use. Shown as visible text beside each observation rather than only in a
// tooltip: a hover-only label is unreadable on touch, unreachable by keyboard, and absent from
// print - and a column of bare percentages the analyst can't date is not evidence.
const shortFiscalYear = (fiscalYearEnd) =>
  typeof fiscalYearEnd === 'string' && fiscalYearEnd.length >= 4 ? `’${fiscalYearEnd.slice(2, 4)}` : '--'

// How many excluded periods to name individually before summarizing the rest.
const MAX_LISTED_EXCLUSIONS = 4

// The evidence cell: every usable annual observation with its fiscal year, then the normalized
// reference statistic that seeding would use. Deliberately no standard deviation or confidence
// interval - at most five observations those would imply a precision the history cannot
// support.
function DriverEvidence({ driver }) {
  const reliabilityLabel = RELIABILITY_LABELS[driver.reliability]
  const excludedCount = driver.excluded.length
  return (
    <>
      {driver.observations.length > 0 ? (
        <span className="driver-observations">
          {driver.observations.map((o) => (
            <span className="driver-observation" key={o.fiscalYearEnd}>
              <span className="driver-observation-year">{shortFiscalYear(o.fiscalYearEnd)}</span>
              <span className="driver-observation-value">{o.value.toFixed(2)}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="driver-observations driver-observations-empty">no usable observations</span>
      )}
      <span className="driver-reference">
        {driver.reference == null
          ? '—'
          : `${driver.referenceStatistic === 'aggregate' ? 'agg' : 'med'} ${pct(driver.reference)}`}
        {reliabilityLabel && <span className={`driver-reliability driver-reliability--${driver.reliability}`}>{reliabilityLabel}</span>}
        {excludedCount > 0 && (
          <span className="driver-excluded-count">
            {excludedCount} period{excludedCount === 1 ? '' : 's'} excluded
          </span>
        )}
      </span>
    </>
  )
}

// Which periods were dropped from a driver's statistic and why. Rendered rather than left in
// the data: silently shrinking the sample is the thing that makes a thin reference look better
// evidenced than it is.
function ExcludedPeriods({ excluded }) {
  const shown = excluded.slice(0, MAX_LISTED_EXCLUSIONS)
  const remainder = excluded.length - shown.length
  return (
    <span className="driver-excluded-detail">
      Excluded:{' '}
      {shown
        .map((e) => `${e.fiscalYearEnd ? `FYE ${e.fiscalYearEnd}` : 'one period'} - ${e.reason}`)
        .join('; ')}
      {remainder > 0 ? `; and ${remainder} more` : ''}
    </span>
  )
}

function RowModeSwitch({ field, label, mode, onChange }) {
  return (
    <span className="driver-mode-switch" role="group" aria-label={`${label} forecasting mode`}>
      {ROW_MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={mode === m ? 'active' : ''}
          aria-pressed={mode === m}
          title={MODE_TITLES[m]}
          onClick={() => onChange(field, m)}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </span>
  )
}

// Full-width Driver-Based DCF forecast entry. Historical evidence and a row-level forecasting
// mode come first; the per-year grid is now what Custom mode reveals rather than the primary
// way a forecast is built. Lives above the three-column analytical-row grid (see
// DcfValuation.jsx), the same full-width-panel slot CostcoDemoPanel already uses, and stays
// horizontally scrollable so a 15-year Custom row remains usable.
function DriverScheduleBuilder({
  baseYearRevenue,
  onBaseYearRevenueChange,
  baseYearRevenueBadgeType,
  driverYears,
  rowModes,
  seededFields,
  history,
  yearLabels,
  onYearFieldChange,
  onFlatChange,
  onFadeEndpointChange,
  onRowModeChange,
  initializePlan,
  initializeBlockedReason,
  showInitializePlan,
  onToggleInitializePlan,
  onApplyInitialize,
  canUseTerminalGrowthTarget,
  onUseTerminalGrowthAsTarget,
  showMethodology,
  onToggleMethodology,
}) {
  const seededCount = Object.keys(seededFields ?? {}).length
  const yearCount = driverYears.length

  return (
    <section className="driver-schedule-builder">
      {/* No step badge here: the numbered sequence belongs to the three analytical columns
          below (Sourced Historical Data, Assumptions, Valuation Summary). Numbering this
          full-width panel "2" as well produced a visible 2 -> 1 -> 2 -> 3 reading order and a
          duplicated step number, since it renders above the column badged "1". The panel is a
          workspace for step 2's forecast inputs rather than a step of its own. */}
      <div className="driver-schedule-header">
        <h2>Forecast Drivers</h2>
        {yearLabels.basis && <span className="driver-fy-basis">{yearLabels.basis}</span>}
        <label className="driver-base-revenue">
          <span className="field-row-label">
            Base Year Revenue
            {baseYearRevenueBadgeType && <SourceBadge type={baseYearRevenueBadgeType} />}
          </span>
          <FormattedNumberInput
            required
            form="dcf-assumptions-form"
            step="any"
            value={baseYearRevenue}
            onChange={onBaseYearRevenueChange}
            formatter={compactCurrency}
          />
        </label>
      </div>

      <div className="driver-schedule-actions no-print">
        <button
          type="button"
          className="driver-initialize-btn"
          onClick={onToggleInitializePlan}
          disabled={Boolean(initializeBlockedReason)}
          title={initializeBlockedReason || undefined}
          aria-expanded={showInitializePlan}
        >
          Initialize Forecast
        </button>
        <span className="driver-schedule-note">
          Drivers are per-year assumptions; the history shown is context, never itself an
          input.{' '}
          <button type="button" className="link-button" onClick={onToggleMethodology} aria-expanded={showMethodology}>
            {showMethodology ? 'Hide methodology' : 'How these drivers are used'}
          </button>
        </span>
      </div>

      {initializeBlockedReason && (
        <p className="driver-schedule-note driver-blocked-note">{initializeBlockedReason}</p>
      )}

      {/* Always in the DOM once toggled on for print, matching the pattern already used for the
          methodology note and the analysis-output tabs: `.no-screen` hides it on screen only,
          so a printed analysis always carries the full methodology regardless of expand state. */}
      <div className={showMethodology ? 'driver-methodology' : 'driver-methodology no-screen'}>
        <p>
          <strong>Tax.</strong> The historical figures shown are the company&rsquo;s <em>book</em>{' '}
          effective tax rate (income tax expense over pre-tax income). The rate entered for each
          forecast year is used as a <em>cash-tax proxy</em>, applied to that year&rsquo;s EBIT only
          when EBIT is positive - a loss year owes no tax but earns no credit against a later
          profitable one, since loss carryforwards are not modeled. These are different measures
          and can differ for a given company, so treat the history as context for your own
          judgement rather than a rate to carry across automatically.
        </p>
        <p>
          <strong>Working capital.</strong> NWC Investment is a fraction of the year-over-year
          dollar <em>change</em> in revenue, matching the sourced &ldquo;Δ NWC&rdquo; flow shown in
          Sourced Historical Data - never a balance-sheet ratio.
        </p>
        <p>
          <strong>Relationship to Quick DCF.</strong> Under ordinary positive-revenue assumptions,
          holding all six driver ratios flat produces a UFCF schedule that is geometric in revenue
          growth - the same <em>shape</em> Quick DCF&rsquo;s single growth rate produces, though not
          necessarily the same valuation: Driver mode derives a normalized cash-flow level from
          revenue and operating ratios, while Quick DCF starts from a sourced base-year UFCF. Use
          Fade or Custom on at least one driver when you intend a forecast that genuinely differs
          in shape.
        </p>
      </div>

      {showInitializePlan && initializePlan && (
        <div className="driver-initialize-plan no-print">
          <h3>Initialize from historical evidence</h3>
          <p>
            These are historical-derived <strong>starting points</strong>, not forecasts produced or
            endorsed by this application. Every seeded row needs your review before it is valued.
          </p>
          <ul className="driver-plan-list">
            {initializePlan.seeds.map((seed) => (
              <li key={seed.field}>
                <strong>{seed.label}</strong> → {seed.value}%{' '}
                <span className="driver-plan-basis">
                  ({seed.basis}
                  {seed.mode === 'fade' ? ', Fade mode - set your own final-year target' : ''})
                </span>
              </li>
            ))}
          </ul>
          {initializePlan.refusals.length > 0 && (
            <>
              <h4>Not seeded</h4>
              <ul className="driver-plan-list driver-plan-refusals">
                {initializePlan.refusals.map((refusal) => (
                  <li key={refusal.field}>
                    <strong>{refusal.label}</strong> — {refusal.note}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="driver-plan-actions">
            <button type="button" className="driver-initialize-btn" onClick={onApplyInitialize}>
              Apply to schedule
            </button>
            <button type="button" className="secondary" onClick={onToggleInitializePlan}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {seededCount > 0 && (
        <p className="driver-seed-banner">
          {seededCount} {seededCount === 1 ? 'row is a' : 'rows are'} historical-derived starting{' '}
          {seededCount === 1 ? 'point' : 'points'}, not {seededCount === 1 ? 'a forecast' : 'forecasts'}.
          Review before valuing - each is marked <span className="driver-seed-badge">Seeded</span> until
          you edit it.
        </p>
      )}

      {yearCount === 0 ? (
        <p className="col-empty-hint">Set a Forecast Period (years) above to build the driver schedule.</p>
      ) : (
        <div className="table-wrap driver-schedule-table-wrap">
          <table className="driver-schedule-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th className="driver-history-col">History &amp; reference</th>
                <th className="driver-mode-col">Mode</th>
                {yearLabels.labels.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DRIVER_ROWS.map(({ field, label }) => {
                const mode = rowModes[field] ?? 'custom'
                const driver = history.drivers[field]
                const seeded = Boolean(seededFields?.[field])
                // Every non-null note is rendered, not only those on an unreliable driver.
                // The tax cash-proxy caution is company-specific and fires on histories that
                // are otherwise perfectly reliable, so gating notes on reliability hid the one
                // disclosure most likely to change an analyst's mind about a seeded rate.
                const showNote = Boolean(driver.note) || driver.excluded.length > 0
                return (
                  <Fragment key={field}>
                    <tr>
                      <td className="driver-row-label">
                        {label}
                        {seeded && (
                          <span
                            className="driver-seed-badge"
                            title="Historical-derived starting point - not a forecast. Edit to make it your own."
                          >
                            Seeded
                          </span>
                        )}
                      </td>
                      <td className="driver-history-col">
                        <DriverEvidence driver={driver} />
                      </td>
                      <td className="driver-mode-col">
                        <RowModeSwitch field={field} label={label} mode={mode} onChange={onRowModeChange} />
                      </td>

                      {mode === 'custom' ? (
                        driverYears.map((year, i) => (
                          <td key={i}>
                            <input
                              type="number"
                              step="any"
                              required
                              form="dcf-assumptions-form"
                              aria-label={`${label}, ${yearLabels.labels[i]}`}
                              value={year[field]}
                              onChange={(e) => onYearFieldChange(i, field)(e.target.value)}
                            />
                          </td>
                        ))
                      ) : (
                        <td colSpan={yearCount} className="driver-generated-cell">
                          {mode === 'flat' ? (
                            <span className="driver-generated-inputs">
                              <label>
                                All years
                                <input
                                  type="number"
                                  step="any"
                                  required
                                  form="dcf-assumptions-form"
                                  aria-label={`${label}, all years`}
                                  value={driverYears[0][field]}
                                  onChange={(e) => onFlatChange(field, e.target.value)}
                                />
                              </label>
                            </span>
                          ) : (
                            <span className="driver-generated-inputs">
                              <label>
                                {yearLabels.labels[0]}
                                <input
                                  type="number"
                                  step="any"
                                  required
                                  form="dcf-assumptions-form"
                                  aria-label={`${label}, first forecast year`}
                                  value={driverYears[0][field]}
                                  onChange={(e) => onFadeEndpointChange(field, 'start', e.target.value)}
                                />
                              </label>
                              <span aria-hidden="true" className="driver-fade-arrow">→</span>
                              {yearCount > 1 && (
                                <label>
                                  {yearLabels.labels[yearCount - 1]}
                                  <input
                                    type="number"
                                    step="any"
                                    required
                                    form="dcf-assumptions-form"
                                    aria-label={`${label}, final forecast year target`}
                                    value={driverYears[yearCount - 1][field]}
                                    onChange={(e) => onFadeEndpointChange(field, 'end', e.target.value)}
                                  />
                                </label>
                              )}
                              {field === 'revenueGrowthRate' && yearCount > 1 && (
                                <button
                                  type="button"
                                  className="link-button no-print"
                                  disabled={!canUseTerminalGrowthTarget}
                                  onClick={onUseTerminalGrowthAsTarget}
                                  title="Copies the Terminal Growth Rate into the final-year target once. Terminal growth is perpetual FCF growth, not revenue growth - the two fields stay independent afterwards."
                                >
                                  Use terminal growth as target
                                </button>
                              )}
                              <span className="driver-generated-preview">
                                {driverYears.map((y) => y[field] || '—').join(' · ')}
                              </span>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                    {showNote && (
                      <tr className="driver-note-row">
                        <td colSpan={3 + yearCount}>
                          {RELIABILITY_LABELS[driver.reliability] && (
                            <span className={`driver-reliability driver-reliability--${driver.reliability}`}>
                              {RELIABILITY_LABELS[driver.reliability]}
                            </span>
                          )}
                          {driver.note && <span className="driver-note-text">{driver.note}</span>}
                          {driver.excluded.length > 0 && <ExcludedPeriods excluded={driver.excluded} />}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default DriverScheduleBuilder
