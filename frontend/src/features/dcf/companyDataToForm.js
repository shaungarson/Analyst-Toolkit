// Maps a CompanyData API response to the sourced-field patch a company load applies to the
// DCF form. Every key here is always present in the returned object - to the new company's
// real value, or '' when this company/period doesn't have it - so a value left over from a
// previously loaded company can never survive a load whose own data doesn't cover it.
//
// This is the fix for a real cross-company bug: loading a company with a valid Base Year
// UFCF, then loading one whose latest `unlevered_fcf` is null (e.g. EOSE), used to leave the
// prior company's figure sitting in the form - `loadCompany` only set `sourced.baseYearFcf`
// inside an `if (latest?.unlevered_fcf != null)` guard, so a missing value meant the key was
// never in the patch object at all, and `{...prev, ...sourced}` has nothing to overwrite
// with. referencePrice already avoided this (see its own comment below); baseYearFcf,
// netDebt, and dilutedSharesOutstanding did not.
export function companyDataToSourcedFields(data) {
  const latest = data.periods[0]
  const baseYearFcf = latest?.unlevered_fcf != null ? String(Math.round(latest.unlevered_fcf)) : ''
  // Driver-Based DCF's own base-year figure (revenue, not UFCF) - same always-present-key
  // guarantee applies: a company whose latest period has no revenue must blank this, never
  // inherit a previously loaded company's figure.
  const baseYearRevenue = latest?.revenue != null ? String(Math.round(latest.revenue)) : ''
  const netDebt = latest?.net_debt != null ? String(Math.round(latest.net_debt)) : ''
  const dilutedSharesOutstanding =
    data.profile.shares_outstanding != null ? String(Math.round(data.profile.shares_outstanding)) : ''

  // Alpha Vantage's quote is independent of fundamentals (see the data-resilience
  // milestone). Every one of these five keys is always set - to the new company's real
  // value, or '' - rather than only when present, so a price (or its sourced-baseline
  // record) from a previously loaded company can never survive into a load whose own quote
  // came back empty.
  const referencePrice = data.profile.reference_price != null ? String(data.profile.reference_price) : ''
  const referencePriceDate = data.profile.reference_price_as_of ?? ''

  return {
    baseYearFcf,
    baseYearRevenue,
    netDebt,
    dilutedSharesOutstanding,
    referencePrice,
    referencePriceDate,
    referencePriceSourcedValue: referencePrice,
    referencePriceSourcedDate: referencePriceDate,
    referencePriceSourceTicker: referencePrice ? data.profile.ticker : '',
  }
}

// The Sourced/Adjusted/Analyst Input decision for one of the three SOURCEABLE_FIELDS
// (baseYearFcf, netDebt, dilutedSharesOutstanding), given that field's current form value
// and its value in the current sourcedSnapshot (both '' when not applicable). A blank form
// field is never badged - nothing to describe. A non-blank field with no sourced value for
// this company (sourcedValue === '', e.g. EOSE's null unlevered_fcf) reads "Analyst Input",
// exactly like referencePriceBadgeType already treats a price typed in with no quote
// available - never "Sourced", since nothing was actually sourced.
export function sourceableFieldBadgeType(formValue, sourcedValue) {
  if (!formValue) return null
  if (!sourcedValue) return 'analyst'
  return formValue === sourcedValue ? 'sourced' : 'adjusted'
}
