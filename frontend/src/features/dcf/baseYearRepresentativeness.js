import { compactCurrency } from '../../lib/format.js'
import { THIN_OBSERVATIONS } from './driverHistory.js'

// Quick DCF seeds Base Year UFCF from the latest reported year. That figure is correctly
// sourced, and this module never disputes it. What it does is answer a different question the
// workspace previously left silent: is that year a representative starting point?
//
// Unlevered FCF subtracts the change in net working capital, which is a difference of two
// balance-sheet stocks and can swing far harder than the underlying business. Coca-Cola's
// FY2025 UFCF is $0.97B against $8.9B the year before, almost entirely because working capital
// absorbed $9.27B. Nothing about that figure is wrong; it is simply not a run rate.
//
// The trigger deliberately reuses Driver mode's existing NWC evidence rather than inventing a
// second statistic. That verdict is already computed for every loaded company, already
// validated, and already carries a stated reason - and it is the app's own judgment about
// whether this company's working-capital behaviour can be characterised at all.
//
// Two limits are stated rather than papered over:
//
// 1. It is a PROXY. NWC reliability measures the dispersion of the ΔNWC/Δrevenue ratio across
//    years, not whether any single year is representative. It under-fires by design: a one-off
//    distortion inside an otherwise stable history is not caught. Measured against the four
//    archetypes, it flags Costco, Coca-Cola and Microsoft, and stays silent on NVIDIA - whose
//    $65B working-capital build accompanies 65% revenue growth and is proportionate rather than
//    anomalous. That silence is the intended behaviour, not a gap.
// 2. It is EVIDENCE OF RISK, never proof of error. No copy here may say or imply that the
//    reported figure is wrong, and nothing is blocked, substituted, or recomputed.
//
// Deliberately not built: any normalized replacement value or one-click adoption. A
// median-of-five UFCF ignores growth and scale, and the scale-aware alternative (median
// historical UFCF margin × latest revenue) was tested across the same four companies and
// failed - margins span 10.6-32.3% for Microsoft and 10.9-45.5% for NVIDIA, and it would assert
// an $87B benchmark against Microsoft's $35B actual during a disclosed capex regime change. See
// "Base-year representativeness" in docs/decisions.md.

const RELIABLE = 'ok'

/**
 * Whether this company's working-capital history is too unreliable to say what a typical year
 * looks like - the single trigger both surfaces below share.
 *
 * False when no company is loaded or the driver has no verdict at all: absence of evidence is
 * not evidence of risk, and a caution nobody can substantiate is worse than silence. The
 * no-company guard lives here rather than at each call site so all three consumers - the
 * caution, the CAGR qualification, and the Explain This Valuation suppression - can never
 * disagree about whether this company has a problem.
 */
export function nwcEvidenceIsUnreliable(history) {
  if (!history?.periodCount) return false
  const reliability = history?.drivers?.nwcInvestmentPct?.reliability
  if (!reliability) return false
  return reliability !== RELIABLE
}

/**
 * The latest period's ΔNWC as a direction and a magnitude, so the sign is readable as cash.
 * A positive change in net working capital consumed cash (an investment); a negative one
 * released it. Null when the figure is missing, non-finite, or exactly zero - there is no
 * movement to describe, and "a $0 working-capital investment" is noise.
 */
export function workingCapitalMovement(changeInNwc) {
  if (!Number.isFinite(changeInNwc) || changeInNwc === 0) return null
  return {
    direction: changeInNwc > 0 ? 'investment' : 'release',
    amount: Math.abs(changeInNwc),
    label: `${compactCurrency(Math.abs(changeInNwc))} working-capital ${
      changeInNwc > 0 ? 'investment' : 'release'
    }`,
  }
}

/**
 * The Base Year UFCF caution, or null.
 *
 * Gated on `badgeType === 'sourced'` as well as the evidence: once the analyst edits the field
 * it is their own figure, and a warning aimed at the automatic seed no longer describes what is
 * in the box. Adjusted and analyst-entered values carry no caution.
 */
export function baseYearCaution({ history, latestPeriod, badgeType }) {
  if (badgeType !== 'sourced') return null
  if (!nwcEvidenceIsUnreliable(history)) return null

  const nwc = history.drivers.nwcInvestmentPct
  const movement = workingCapitalMovement(latestPeriod?.change_in_nwc)
  const fiscalYear = latestPeriod?.fiscal_year_end?.slice(0, 4) ?? null

  return {
    reliability: nwc.reliability,
    // The reason only - never the Driver-mode note, which ends by telling the analyst to edit a
    // driver row that does not exist in Quick DCF.
    reason: nwc.reason ?? null,
    movement,
    fiscalYear,
    headline: movement
      ? `${fiscalYear ? `FY${fiscalYear}` : 'The latest reported year'} included a ${movement.label}.`
      : `${fiscalYear ? `FY${fiscalYear}` : 'The latest reported year'} may not be a representative starting point.`,
  }
}

// What each non-`ok` verdict actually means, said in its own terms. Calling all three
// "unreliable" overstated two of them: a `thin` history is genuinely usable - Driver mode will
// seed a driver from it - and it is the narrowness of the evidence that limits it, while
// `insufficient` is an absence of evidence rather than evidence that misleads. Only `unstable`
// is a statement that the history itself does not hold together.
const CAGR_QUALIFICATION_LEAD = {
  unstable: 'Working-capital history is unstable for this company',
  thin: `Only ${THIN_OBSERVATIONS === 2 ? 'two' : THIN_OBSERVATIONS} usable working-capital observations provide limited evidence`,
  insufficient: 'Working-capital history is too limited to assess',
}

// The consequence is the same whichever verdict produced it, so it is stated once: the CAGR is
// an endpoint-to-endpoint measure over the same periods whose working-capital behaviour is in
// question, and its endpoints carry whatever those years' ΔNWC did.
const CAGR_QUALIFICATION_CONSEQUENCE =
  'so this CAGR may reflect working-capital timing rather than the underlying business.'

/**
 * A concise, tier-aware qualification for the historical UFCF CAGR line, or null.
 *
 * Not gated on the Base Year field's badge: this describes the history itself, so it stands
 * whatever the analyst has since typed into the base-year box. The CAGR stays visible - it is
 * real, and hiding it would remove evidence rather than qualify it.
 */
export function historicalCagrQualification(history) {
  if (!nwcEvidenceIsUnreliable(history)) return null

  const lead = CAGR_QUALIFICATION_LEAD[history.drivers.nwcInvestmentPct.reliability]
  // An unrecognised verdict is not described rather than described wrongly; the caution and the
  // Explain This Valuation suppression still apply, since both key off the same non-`ok` test.
  if (!lead) return null
  return `${lead}, ${CAGR_QUALIFICATION_CONSEQUENCE}`
}
