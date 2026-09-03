import { compactCurrency } from '../../lib/format'
import SourceBadge from '../../components/SourceBadge'
import FormattedNumberInput from '../../components/FormattedNumberInput'

const pct = (v) => (v == null ? 'n/a' : `${v.toFixed(1)}%`)

// One row per driver: which driverYear field it edits, its label, and which key on the
// lastActual reference object (from driverSchedule.js) supplies its "Last Actual" cell.
const DRIVER_ROWS = [
  { field: 'revenueGrowthRate', label: 'Revenue Growth (%/yr)', lastActualKey: 'revenueGrowthPct' },
  { field: 'ebitMargin', label: 'EBIT Margin (%)', lastActualKey: 'marginPct' },
  // Neutrally "Tax Rate", not "Cash Tax Rate": the Last Actual cell beside it is the
  // *book* effective rate, and labeling the row "Cash" put a cash-flow name
  // directly next to a book figure. See the note below the table for how the two relate.
  { field: 'taxRate', label: 'Tax Rate (%)', lastActualKey: 'taxRatePct' },
  { field: 'daPctOfRevenue', label: 'D&A (% of Revenue)', lastActualKey: 'daPct' },
  { field: 'capexPctOfRevenue', label: 'CapEx (% of Revenue)', lastActualKey: 'capexPct' },
  { field: 'nwcInvestmentPct', label: 'NWC Investment (% of Δ Revenue)', lastActualKey: 'nwcInvestmentPct' },
]

// Full-width Driver-Based DCF forecast entry: Base Year Revenue in the header, then one
// row per driver x one column per forecast year, with a leading broadcast column ("type
// once, override any year") and a read-only "Last Actual" reference row for context. Lives
// above the three-column analytical-row grid (see DcfValuation.jsx), the same full-width-
// panel-above-the-grid slot CostcoDemoPanel already uses - not squeezed into the narrow
// Assumptions column, and horizontally scrollable so it stays usable at the full 15-year
// forecast length.
function DriverScheduleBuilder({
  baseYearRevenue,
  onBaseYearRevenueChange,
  baseYearRevenueBadgeType,
  driverYears,
  onYearFieldChange,
  onBroadcastField,
  lastActual,
}) {
  return (
    <section className="driver-schedule-builder">
      <div className="driver-schedule-header">
        <span className="step-badge">2</span>
        <h2>Forecast Drivers</h2>
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
      <p className="driver-schedule-note">
        Revenue, margin, tax, D&amp;A, CapEx, and working-capital assumptions are entered per
        forecast year below - type a value in &ldquo;All Years&rdquo; to fill every year at
        once, then edit any individual year afterward. &ldquo;Last Actual&rdquo; shows what
        the two most recent sourced periods imply for context; it is never itself a forecast
        input.
      </p>
      <p className="driver-schedule-note">
        <strong>On tax:</strong> &ldquo;Last Actual&rdquo; is the company&rsquo;s book effective
        tax rate (income tax expense over pre-tax income). The rate you enter for each
        forecast year is used as a cash-tax proxy, applied to that year&rsquo;s EBIT only when
        EBIT is positive - a loss year owes no tax but earns no credit against a later
        profitable one, since loss carryforwards are not modeled. These are different measures
        and can differ for a given company, so treat &ldquo;Last Actual&rdquo; as context for
        your own judgment rather than a rate to carry across automatically.
      </p>

      {driverYears.length === 0 ? (
        <p className="col-empty-hint">Set a Forecast Period (years) above to build the driver schedule.</p>
      ) : (
        <div className="table-wrap driver-schedule-table-wrap">
          <table className="driver-schedule-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th className="driver-last-actual-col">Last Actual</th>
                <th className="driver-broadcast-col">All Years</th>
                {driverYears.map((_, i) => (
                  <th key={i}>Year {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DRIVER_ROWS.map(({ field, label, lastActualKey }) => (
                <tr key={field}>
                  <td className="driver-row-label">{label}</td>
                  <td className="driver-last-actual-col">{pct(lastActual?.[lastActualKey])}</td>
                  <td className="driver-broadcast-col">
                    <input
                      type="number"
                      step="any"
                      aria-label={`${label}, all years`}
                      placeholder="—"
                      onChange={(e) => e.target.value !== '' && onBroadcastField(field)(e.target.value)}
                    />
                  </td>
                  {driverYears.map((year, i) => (
                    <td key={i}>
                      <input
                        type="number"
                        step="any"
                        required
                        form="dcf-assumptions-form"
                        aria-label={`${label}, year ${i + 1}`}
                        value={year[field]}
                        onChange={(e) => onYearFieldChange(i, field)(e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default DriverScheduleBuilder
