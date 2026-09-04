// Pure presentation helpers for the two-way Revenue Growth x EBIT Margin sensitivity grid.
//
// Nothing here re-derives a valuation. Every number is read from the
// /api/dcf/driver-growth-margin response, which computes its own base case alongside the
// twenty-four perturbed cells - the frontend never reconstructs or re-rounds a base value
// per share to measure cells against.
//
// The one thing borrowed from the tornado is formatDriverRate, so both views describe the
// same driver paths in the same terms. The tinting classes (sens-tier-0..4,
// sensitivity-base-case) are the WACC grid's existing ones, reused rather than redefined,
// so all three sensitivity surfaces read on one visual scale.

// Explicit .js extension, as the other node --test-covered modules here use: the test runner
// resolves ESM specifiers natively, where Vite alone would not have needed it.
import {
  ENDPOINT_WARNING_LABELS,
  formatDriverRate,
  formatWarningYears,
} from './driverTornado.js'

const EPSILON = 1e-9

/**
 * A shift axis label. Deltas rather than levels because a Fade or Custom row has no single
 * level to perturb - the schedules the shifts were applied to are reported separately, by
 * summarizeShiftedPath below.
 */
export function formatShift(delta) {
  if (Math.abs(delta) < EPSILON) return 'Base'
  const pp = (Math.abs(delta) * 100).toFixed(0)
  return `${delta > 0 ? '+' : '−'}${pp}pp`
}

/**
 * The driver path each axis actually shifted, described in the only terms true for that
 * path's shape - the same rule the tornado's summarizeTestedPath follows. A flat row can be
 * stated as one level; a Fade or Custom row cannot, and never gets a representative value
 * (an average, or the first year) invented to stand in for it.
 */
export function summarizeShiftedPath(path, maxShift, step) {
  if (!Array.isArray(path) || path.length === 0) return ''

  const range = `shifted ±${(maxShift * 100).toFixed(0)}pp in ${(step * 100).toFixed(0)}pp steps`
  const first = path[0]
  const last = path[path.length - 1]

  if (path.every((v) => Math.abs(v - first) < EPSILON)) {
    return `Flat ${formatDriverRate(first)} · ${range}`
  }

  const years = `${path.length} years`
  const nonIncreasing = path.every((v, i) => i === 0 || v <= path[i - 1] + EPSILON)
  const nonDecreasing = path.every((v, i) => i === 0 || v >= path[i - 1] - EPSILON)
  if (nonIncreasing || nonDecreasing) {
    return `${formatDriverRate(first)} → ${formatDriverRate(last)} over ${years} · ${range}`
  }
  // A Custom row can move both directions, where "first -> last" would imply a trend the
  // schedule doesn't have. Report the range instead of a direction that isn't there.
  return (
    `Varies ${formatDriverRate(Math.min(...path))}–${formatDriverRate(Math.max(...path))} ` +
    `over ${years} · ${range}`
  )
}

/**
 * Five discrete tint tiers across whatever the grid's computable cells actually span, the
 * same treatment (and the same CSS classes) the WACC x terminal growth grid already uses.
 * Returns a function rather than a class per call so min/max are computed once.
 *
 * Note what the tinting deliberately does NOT encode: any claim about which direction is
 * "good". It is a low-to-high scale over the values present, so a grid whose value falls as
 * revenue growth rises tints exactly as honestly as one where it rises.
 */
export function cellTierClass(rows) {
  const values = rows
    .flatMap((row) => row.cells.map((cell) => cell.value_per_share))
    .filter((v) => v !== null && v !== undefined && Number.isFinite(v))
  if (values.length === 0) return () => undefined

  const min = Math.min(...values)
  const max = Math.max(...values)
  return (value) => {
    if (max === min) return 'sens-tier-2'
    const t = (value - min) / (max - min)
    return `sens-tier-${Math.min(4, Math.floor(t * 5))}`
  }
}

const TIER_SEVERITY = { caution: 0, high: 1, extreme: 2 }

// Warning-level copy, true of every cell that raises the id.
//
// Deliberately NOT the engine's own `explanation`: those are written per cell and name that
// cell's particular years and computed figures ("Year 3's revenue growth rate of 27.00%
// applied to a prior-year revenue of 1,464.10 produces -12.34"). Carrying one cell's sentence
// into an aggregate that counts several would describe the others wrongly - a fabricated
// detail, which is worse than no detail. The engine's exact per-cell sentence is still
// available, on the cell it actually belongs to.
export const GRID_WARNING_DESCRIPTIONS = {
  non_positive_base_year_revenue: 'Base year revenue is zero or negative.',
  tax_rate_outside_0_100_percent:
    "A forecast year's tax rate falls outside the usual 0%–100% range.",
  negative_da_percent: 'D&A is a negative percentage of revenue in at least one forecast year.',
  negative_capex_percent:
    'CapEx is a negative percentage of revenue in at least one forecast year — a net-divestment assumption rather than investment.',
  zero_revenue_lock:
    "The shifted growth rate brings a forecast year's revenue to exactly zero. Because each year's revenue is a percentage of the prior year's, every later year is zero too.",
  negative_revenue:
    'The shifted growth rate produces negative revenue in at least one forecast year — mechanically computed, but not a coherent forecast.',
  non_positive_terminal_year_fcf:
    "The shifted schedule's final-year UFCF is zero or negative, so Gordon Growth returns a zero or negative terminal value — often a negative enterprise value with it.",
}

/**
 * Distinct warnings introduced anywhere in the grid, most severe first, each with a footnote
 * number and the count of cells that raise it.
 *
 * The footnote number is what lets a marked cell say *which* warning it introduced rather
 * than only *that* it introduced one - necessary as soon as two different warnings appear in
 * the same grid, which two shifted drivers can easily produce.
 */
export function summarizeGridWarnings(rows) {
  const grouped = new Map()
  for (const row of rows) {
    for (const cell of row.cells) {
      for (const warning of cell.new_warnings) {
        const entry = grouped.get(warning.id)
        if (entry === undefined) {
          grouped.set(warning.id, {
            id: warning.id,
            label: ENDPOINT_WARNING_LABELS[warning.id] ?? warning.id,
            description: GRID_WARNING_DESCRIPTIONS[warning.id] ?? '',
            tier: warning.tier,
            cellCount: 1,
          })
          continue
        }
        entry.cellCount += 1
        // The same id can arrive at different tiers from different cells; report the most
        // severe. No explanation travels with it - see GRID_WARNING_DESCRIPTIONS above.
        if (TIER_SEVERITY[warning.tier] > TIER_SEVERITY[entry.tier]) {
          entry.tier = warning.tier
        }
      }
    }
  }
  return [...grouped.values()]
    .sort((a, b) => TIER_SEVERITY[b.tier] - TIER_SEVERITY[a.tier] || a.id.localeCompare(b.id))
    .map((entry, index) => ({ ...entry, note: index + 1 }))
}

/**
 * The footnote numbers for one cell's warnings, ascending, so the marker in the cell points
 * at specific entries in the list beneath the grid. Ids absent from the summary are skipped
 * rather than numbered arbitrarily.
 */
export function warningFootnotes(warnings, summary) {
  const notes = new Map(summary.map((entry) => [entry.id, entry.note]))
  return warnings
    .map((warning) => notes.get(warning.id))
    .filter((note) => note !== undefined)
    .sort((a, b) => a - b)
}

/**
 * Accessible text for a marked cell: what it introduced and in which forecast years, read out
 * in place rather than left to a hover-only tooltip. Years come from that cell's own warning,
 * so they are always the years that cell actually raised.
 */
export function describeCellWarnings(warnings) {
  return warnings
    .map((warning) => {
      const label = ENDPOINT_WARNING_LABELS[warning.id] ?? warning.id
      const years = formatWarningYears(warning.years)
      return years ? `${label} (${years})` : label
    })
    .join('; ')
}
