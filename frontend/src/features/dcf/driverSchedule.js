// Pure helpers for Driver-Based DCF's per-year driver table: resizing the year array to the
// shared forecast length, the "type once, override any year" broadcast workflow, building
// the API payload, and the read-only "Last Actual" historical reference row. No React here -
// all state lives in DcfValuation.jsx; these functions only transform plain data.

export const EMPTY_DRIVER_YEAR = {
  revenueGrowthRate: '',
  ebitMargin: '',
  taxRate: '',
  daPctOfRevenue: '',
  capexPctOfRevenue: '',
  nwcInvestmentPct: '',
}

// Resizes driverYears to exactly targetLength, preserving every existing year's values.
// Growing clones the last existing row (or EMPTY_DRIVER_YEAR if there isn't one yet) into
// each new trailing year - a reasonable starting point the analyst can then edit, not a
// guess at what they'd want. Shrinking truncates from the end, never touching earlier years.
export function resizeDriverYears(driverYears, targetLength) {
  const n = Math.max(0, Math.floor(targetLength) || 0)
  if (n === driverYears.length) return driverYears
  if (n < driverYears.length) return driverYears.slice(0, n)
  const template = driverYears.length > 0 ? driverYears[driverYears.length - 1] : EMPTY_DRIVER_YEAR
  const added = Array.from({ length: n - driverYears.length }, () => ({ ...template }))
  return [...driverYears, ...added]
}

// Analyst-facing names for each driver field, used by driverInputsError to say exactly which
// cells are missing. Unit-free on purpose - the table's own row labels (DriverScheduleBuilder)
// carry the "(%)" / "(%/yr)" suffixes that make sense above a column of inputs but only add
// noise inside a sentence listing what's blank.
export const DRIVER_FIELD_LABELS = {
  revenueGrowthRate: 'Revenue Growth',
  ebitMargin: 'EBIT Margin',
  taxRate: 'Tax Rate',
  daPctOfRevenue: 'D&A (% of Revenue)',
  capexPctOfRevenue: 'CapEx (% of Revenue)',
  nwcInvestmentPct: 'NWC Investment (% of Δ Revenue)',
}

// True only when a cell holds a number the analyst actually entered. Deliberately not
// `Number(v)` on its own: Number('') and Number('   ') are both 0, which is exactly how a
// blank cell would otherwise reach the API as a deliberate 0% assumption and be valued as
// one. A genuinely typed zero ('0', '0.0', '-0') stays valid - the point is to separate
// "not filled in" from "filled in as zero", never to reject zero itself.
function isFilledNumber(value) {
  if (value == null) return false
  const trimmed = String(value).trim()
  if (trimmed === '') return false
  return Number.isFinite(Number(trimmed))
}

// How many missing cells to name before summarizing the rest - an empty 15-year schedule has
// 90 of them, and a message listing all 90 is no more actionable than one listing five.
const MAX_LISTED_MISSING = 5

// The shared assumption fields buildDriverPayload also converts. These live outside the
// driver table but reach the API through the same Number() coercion, so a blank one is
// exactly as dangerous: a missing Terminal Growth Rate becomes 0%, and a missing Net Debt
// becomes $0 - both of which the backend accepts as entirely valid inputs, so nothing
// downstream would ever catch them. That produces a confident, wrong valuation rather than
// an error, which is the worst of the available outcomes.
export const SHARED_FIELD_LABELS = {
  wacc: 'WACC',
  terminalGrowthRate: 'Terminal Growth Rate',
  netDebt: 'Net Debt',
  dilutedSharesOutstanding: 'Diluted Shares Outstanding',
}

// Returns a specific, analyst-readable message naming what still needs filling in, or null
// when every value buildDriverPayload converts is present and numeric. A non-null result is a
// hard stop *before* any request is made - a blank input is a missing assumption, not a zero,
// and the backend deliberately has no bound left that would catch one (per CLAUDE.md's
// Financial Validation Principle, the removed hard bounds were the right thing to remove;
// completeness is a different question from economic plausibility, and only the first is
// decided here - whether a genuinely entered value is computationally acceptable stays the
// backend's call).
//
// Covers exactly the set buildDriverPayload converts, no more and no less: Base Year Revenue,
// the four shared assumptions, and every driver cell. Shared fields are listed before the
// per-year cells so they stay visible within the cap even when the whole table is empty.
export function driverInputsError(baseYearRevenue, driverYears, sharedForm) {
  if (!Array.isArray(driverYears) || driverYears.length === 0) {
    return 'Set a Forecast Period (years) above, then fill in the driver schedule before running a valuation.'
  }
  const missing = []
  if (!isFilledNumber(baseYearRevenue)) missing.push('Base Year Revenue')
  for (const [field, label] of Object.entries(SHARED_FIELD_LABELS)) {
    if (!isFilledNumber(sharedForm?.[field])) missing.push(label)
  }
  driverYears.forEach((year, i) => {
    for (const [field, label] of Object.entries(DRIVER_FIELD_LABELS)) {
      if (!isFilledNumber(year?.[field])) missing.push(`${label} (Year ${i + 1})`)
    }
  })
  if (missing.length === 0) return null

  const shown = missing.slice(0, MAX_LISTED_MISSING)
  const remainder = missing.length - shown.length
  const list = remainder > 0 ? `${shown.join(', ')}, and ${remainder} more` : shown.join(', ')
  return `The driver inputs are incomplete - a blank field is not treated as 0. Fill in: ${list}.`
}

// Converts driverForm + the shared assumption fields into the /api/dcf/driver-* request
// body. Percent fields are entered as whole numbers (e.g. "8" for 8%), matching every
// existing DCF percent input in this app - divided by 100 here, the one place that happens.
//
// Enforces completeness itself rather than trusting each caller to remember a separate
// pre-check. Callers still validate first so they can surface the message in their own UI
// before firing anything, but this throw is what actually makes "a blank never reaches
// Number()" an invariant of the function instead of a convention every future caller has to
// know about - and the failure mode it guards against is silent, not loud.
export function buildDriverPayload(baseYearRevenue, driverYears, sharedForm) {
  const incomplete = driverInputsError(baseYearRevenue, driverYears, sharedForm)
  if (incomplete) throw new Error(incomplete)
  return {
    base_year_revenue: Number(baseYearRevenue),
    driver_years: driverYears.map((year) => ({
      revenue_growth_rate: Number(year.revenueGrowthRate) / 100,
      ebit_margin: Number(year.ebitMargin) / 100,
      tax_rate: Number(year.taxRate) / 100,
      da_pct_of_revenue: Number(year.daPctOfRevenue) / 100,
      capex_pct_of_revenue: Number(year.capexPctOfRevenue) / 100,
      nwc_investment_pct_of_revenue_change: Number(year.nwcInvestmentPct) / 100,
    })),
    wacc: Number(sharedForm.wacc) / 100,
    terminal_growth_rate: Number(sharedForm.terminalGrowthRate) / 100,
    net_debt: Number(sharedForm.netDebt),
    diluted_shares_outstanding: Number(sharedForm.dilutedSharesOutstanding),
  }
}

// --- Row forecasting modes ---------------------------------------------------------------
// Flat, Fade and Custom are UI-level *generators* over the same per-year `driverYears` array
// the API has always received. A mode never travels to the backend, never changes what is
// sent, and never introduces a second projection of the financial formulas - it only decides
// how many boxes the analyst fills to produce the same N annual values. `driverYears` stays
// the single source of truth, so payload building, scenario save/load, completeness checking,
// warnings and CSV export are all untouched by any of this.

export const ROW_MODES = ['flat', 'fade', 'custom']

// Custom is the safe default everywhere a mode is unknown: it shows exactly the values that
// are actually in the schedule, without a mode's generator rewriting them. That matters most
// for a scenario saved before modes existed, whose per-year values may be anything at all.
export function defaultRowModes() {
  return Object.fromEntries(Object.keys(DRIVER_FIELD_LABELS).map((field) => [field, 'custom']))
}

// Accepts whatever a saved scenario carries (including nothing) and returns a complete,
// valid mode map - same missing-key-defaults-safely pattern as `forecastMode` itself.
export function normalizeRowModes(raw) {
  const modes = defaultRowModes()
  if (!raw || typeof raw !== 'object') return modes
  for (const field of Object.keys(modes)) {
    if (ROW_MODES.includes(raw[field])) modes[field] = raw[field]
  }
  return modes
}

function numericOrNull(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

// Interpolated intermediate years are rounded to four decimals - enough precision for every
// driver this app models, and it keeps floating-point noise out of both the inputs and the
// payload. The two endpoints are passed through as the analyst typed them, never re-rounded.
const roundInterpolated = (v) => String(Math.round(v * 10000) / 10000)

/**
 * Linear interpolation from `start` to `end` across `length` years:
 *   v_t = start + (end - start) x (t - 1) / (length - 1)
 *
 * Linear in the driver value itself - deliberately not exponential or S-curved, which would
 * be modeling-platform creep without a corresponding gain in analyst judgement. A
 * single-year forecast is a degenerate fade and yields just the start value; the end target
 * has nowhere to land.
 */
export function fadeValues(start, end, length) {
  const n = Math.max(0, Math.floor(length) || 0)
  if (n === 0) return []
  const startNum = numericOrNull(start)
  const endNum = numericOrNull(end)
  if (startNum == null || endNum == null) return Array.from({ length: n }, () => '')
  if (n === 1) return [String(start).trim()]
  const values = [String(start).trim()]
  for (let i = 1; i < n - 1; i += 1) {
    values.push(roundInterpolated(startNum + ((endNum - startNum) * i) / (n - 1)))
  }
  values.push(String(end).trim())
  return values
}

function writeRow(driverYears, field, values) {
  return driverYears.map((year, i) => ({ ...year, [field]: values[i] ?? '' }))
}

// Flat mode: one value across every forecast year.
export function setFlatValue(driverYears, field, value) {
  return writeRow(driverYears, field, driverYears.map(() => value))
}

// Fade mode: the analyst edits one of the two endpoints and the interior years re-interpolate.
// Whichever endpoint isn't being edited is read back out of the schedule itself, so there is
// no separate endpoint state that could drift from the values actually being valued.
export function setFadeEndpoint(driverYears, field, endpoint, value) {
  if (driverYears.length === 0) return driverYears
  const last = driverYears.length - 1
  const start = endpoint === 'start' ? value : driverYears[0][field]
  const end = endpoint === 'end' ? value : driverYears[last][field]
  return writeRow(driverYears, field, fadeValues(start, end, driverYears.length))
}

/**
 * Switching a row's mode. Each transition is immediate and predictable, so "Flat" always
 * means one value and "Fade" always means a straight line - a mode that displayed one number
 * while the schedule held several different ones would be lying about what will be valued.
 *
 *   -> custom : values untouched; the per-year cells are simply revealed for editing.
 *   -> flat   : year 1's value is broadcast across every year.
 *   -> fade   : the existing first and last year values become the endpoints, and the
 *               interior re-interpolates between them.
 *
 * A row whose endpoints aren't numeric (an unseeded, still-blank row) is left exactly as it
 * is rather than being blanked or filled.
 */
export function applyRowMode(driverYears, field, mode) {
  if (driverYears.length === 0 || mode === 'custom') return driverYears
  const last = driverYears.length - 1
  if (mode === 'flat') {
    const value = driverYears[0][field]
    return numericOrNull(value) == null ? driverYears : setFlatValue(driverYears, field, value)
  }
  const start = driverYears[0][field]
  const end = driverYears[last][field]
  if (numericOrNull(start) == null || numericOrNull(end) == null) return driverYears
  return writeRow(driverYears, field, fadeValues(start, end, driverYears.length))
}

/**
 * Resizing the schedule with row modes in force. Plain `resizeDriverYears` preserves earlier
 * years and clones the last one into any new trailing year, which is right for Custom - but
 * wrong for a Fade row, where cloning would flatten the tail into a plateau and quietly
 * discard the fade target the analyst set. So each generated row is regenerated at the new
 * length instead:
 *
 *   flat   : year 1's value is re-broadcast.
 *   fade   : re-interpolated between the endpoints as they were BEFORE the resize, so the
 *            analyst's start and target both survive a length change in either direction.
 *   custom : left exactly as `resizeDriverYears` produced it.
 */
export function resizeDriverYearsWithModes(driverYears, targetLength, rowModes) {
  const resized = resizeDriverYears(driverYears, targetLength)
  if (resized.length === 0 || driverYears.length === 0) return resized

  const modes = normalizeRowModes(rowModes)
  const priorLast = driverYears.length - 1
  let next = resized
  for (const [field, mode] of Object.entries(modes)) {
    if (mode === 'custom') continue
    if (mode === 'flat') {
      const value = driverYears[0][field]
      if (numericOrNull(value) != null) next = setFlatValue(next, field, value)
      continue
    }
    const start = driverYears[0][field]
    const end = driverYears[priorLast][field]
    if (numericOrNull(start) == null || numericOrNull(end) == null) continue
    next = writeRow(next, field, fadeValues(start, end, next.length))
  }
  return next
}

// --- Forecast column labels ---------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Fiscal years ending in June or later are labelled by the calendar year they end in, and
// essentially every such filer labels them the same way (Costco's FY2025 ends August 2025;
// Apple's ends September 2025). Fiscal years ending January through May are genuinely
// ambiguous - two large retailers with near-identical January year-ends label them
// differently from each other - so no label is inferred at all and the generic Year 1..N
// fallback applies. A wrong fiscal-year label is worse than a generic one.
const EARLIEST_UNAMBIGUOUS_FYE_MONTH = 6

/**
 * Column headings for the forecast years. Returns FY labels only when the sourced fiscal
 * period supports one unambiguously, and generic "Year N" labels otherwise - including when
 * no company is loaded at all (manual entry, and the Costco demo path).
 */
export function forecastYearLabels(companyData, length) {
  const n = Math.max(0, Math.floor(length) || 0)
  const generic = Array.from({ length: n }, (_, i) => `Year ${i + 1}`)
  const fiscalYearEnd = companyData?.periods?.[0]?.fiscal_year_end
  if (typeof fiscalYearEnd !== 'string') return { labels: generic, basis: null, usesFiscalYears: false }

  // Parsed by string rather than `new Date()`, which would shift a YYYY-MM-DD date across a
  // year boundary in a negative-offset timezone.
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(fiscalYearEnd.trim())
  if (!match) return { labels: generic, basis: null, usesFiscalYears: false }
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < EARLIEST_UNAMBIGUOUS_FYE_MONTH || month > 12) {
    return { labels: generic, basis: null, usesFiscalYears: false }
  }

  return {
    labels: Array.from({ length: n }, (_, i) => `FY${year + i + 1}E`),
    basis: `Fiscal years ending ${MONTH_NAMES[month - 1]}`,
    usesFiscalYears: true,
  }
}

// --- Initialize Forecast -------------------------------------------------------------------

/**
 * Turns historical evidence (see driverHistory.js) into a complete starting schedule.
 *
 * Never called automatically - the analyst clicks Initialize Forecast, reviews what it says
 * it will do, and confirms. Every value it writes is a historical-derived starting point, not
 * a forecast this application is endorsing, and each seeded row is badged as such until the
 * analyst edits it.
 *
 * Revenue growth is initialized in FADE mode with both endpoints at the historical reference.
 * That is deliberate on two counts: it puts the row in the shape a real forecast usually
 * takes (a growth path that changes), while refusing to invent a terminal target the history
 * does not contain - the analyst types the target, or uses the one-time "Use terminal growth
 * as target" action. Every other driver initializes Flat at its reference, because margins,
 * capital intensity and tax rates mean-revert rather than trend by default; a fade there
 * would be asserting a view the evidence doesn't support.
 *
 * A driver whose history can't support a seed is left completely blank with its refusal
 * reason recorded - never backfilled with the latest observation, and never with zero.
 */
export function buildBaseForecast(history, length, seedFormatter) {
  const n = Math.max(0, Math.floor(length) || 0)
  const rowModes = defaultRowModes()
  const seededFields = {}
  const refusals = []
  let driverYears = Array.from({ length: n }, () => ({ ...EMPTY_DRIVER_YEAR }))

  // A zero-length forecast has no cells to seed, so nothing is claimed as seeded or refused -
  // the caller's own "set a Forecast Period first" message is the right thing to show, and a
  // seed list describing a schedule that doesn't exist would have no values behind it.
  if (n === 0) return { driverYears, rowModes, seededFields, refusals }

  for (const field of Object.keys(DRIVER_FIELD_LABELS)) {
    const driver = history?.drivers?.[field]
    if (!driver?.seedable || driver.reference == null) {
      rowModes[field] = 'flat'
      refusals.push({
        field,
        label: DRIVER_FIELD_LABELS[field],
        note: driver?.note ?? 'No usable sourced history for this driver.',
      })
      continue
    }
    const value = seedFormatter(driver.reference)
    if (value === '') {
      rowModes[field] = 'flat'
      refusals.push({ field, label: DRIVER_FIELD_LABELS[field], note: 'Reference value is not a finite number.' })
      continue
    }
    seededFields[field] = true
    if (field === 'revenueGrowthRate') {
      rowModes[field] = 'fade'
      driverYears = writeRow(driverYears, field, fadeValues(value, value, n))
    } else {
      rowModes[field] = 'flat'
      driverYears = setFlatValue(driverYears, field, value)
    }
  }

  return { driverYears, rowModes, seededFields, refusals }
}

/**
 * Blanks all six driver rows across every forecast year. Used when a different company is
 * loaded, alongside resetting the row modes and seed markers.
 *
 * This deliberately clears the analyst's own edits too, and that is the point. Per-row seed
 * tracking was tried first and is not sound: a Fade row can hold a historically seeded Year 1
 * value and an analyst-chosen final-year target at the same time, and the first edit to either
 * endpoint clears the row's marker - so the *other* endpoint, still derived from the previous
 * company's history, would then survive a new ticker load unbadged. That is exactly the class
 * of bug the cross-company stale-input fix addressed for sourced fields, and it recurs here at
 * cell granularity rather than row granularity.
 *
 * Tracking provenance per cell would fix it too, but it is materially worse for this job: it
 * doubles the state the schedule carries, has to survive resizes, mode switches, fade
 * regeneration and scenario round-trips (each a place a marker can silently desynchronize from
 * the value it describes), and the failure mode when it does desynchronize is a stale figure
 * presented as the analyst's own. A whole-schedule reset has one rule, no per-cell bookkeeping,
 * and fails safe: the analyst re-enters assumptions for the company they actually loaded.
 *
 * Scope is deliberately narrow - only the company-specific driver schedule resets. Shared
 * assumptions (WACC, terminal growth, forecast period, net debt, diluted shares) are analyst
 * judgement that carries across companies and are untouched, as are saved scenarios.
 */
export function clearAllDriverRows(driverYears) {
  if (driverYears.length === 0) return driverYears
  return driverYears.map(() => ({ ...EMPTY_DRIVER_YEAR }))
}

/**
 * Whether a successful company load should reset the driver schedule. The schedule is
 * preserved in exactly one case: the currently loaded company is positively identified and
 * carries the same normalized ticker as the incoming one. Every other load resets.
 *
 * The default is deliberately "reset", not "preserve". An earlier version preserved whenever
 * no previous ticker was known, on the reasoning that a schedule with no prior company can't
 * be stale *from* anything - which is wrong, because there are two ordinary paths that leave a
 * populated schedule with `companyData` at null:
 *
 *   - `loadScenario` clears `companyData` while restoring the saved `driverForm`, so a
 *     scenario's driver values sit in the table with no company identified. The next ticker
 *     load would then adopt them under that company.
 *   - a failed ticker lookup clears `companyData` too, leaving the previous company's schedule
 *     in place; the next successful load would keep it, whatever company it was built for.
 *
 * In both, values built for one company (or for none) would be presented as assumptions about
 * another - the same class of bug as the cross-company stale-input fix, reached by a different
 * route. Resetting an unidentified schedule can cost the analyst work they entered before any
 * company was loaded, and that trade is accepted knowingly: an unexplained figure valued
 * against the wrong company is worse than re-entering assumptions, and the reset is visible
 * (the rows go blank) where the stale value was not.
 *
 * Re-loading the same identified ticker returns the same historical evidence, so the schedule
 * built against it is still valid and is kept.
 */
export function shouldResetDriverSchedule(previousTicker, nextTicker) {
  const previous = String(previousTicker ?? '').trim().toUpperCase()
  const next = String(nextTicker ?? '').trim().toUpperCase()
  if (previous === '' || next === '') return true
  return previous !== next
}
