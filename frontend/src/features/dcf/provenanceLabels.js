// Shared provenance vocabulary used by both CompanySourcedData (latest-period panel) and
// SourcedHistoryPanel (multi-year table), so the status labels and descriptions can't
// drift between the two views of the same underlying data. Kept as plain constants in
// their own file (not alongside the ProvenanceDot component) so JSX fast-refresh isn't
// disabled for the module that renders it.

export const STATUS_LABEL = {
  reported: 'Reported',
  combined: 'Combined',
  calculated: 'Calculated',
  fallback: 'Fallback',
}

// One line per status - the dot's tooltip and any expanded detail view both read from
// this, so the explanation can't drift from the label. "Combined" and "calculated" are
// deliberately distinct: combined still traces to one or more actual filed SEC facts,
// calculated derives a value from other already-sourced fields via a formula and has no
// single fact behind it at all.
export const STATUS_DESCRIPTION = {
  reported: 'A single value taken directly from one SEC filing.',
  combined: 'Summed from more than one SEC XBRL fact (e.g. cash + short-term investments).',
  calculated: 'Derived by formula from other already-sourced fields, not a single filed fact.',
  fallback: "SEC data could not be confidently mapped for this field; Alpha Vantage supplied it instead.",
}

export const SOURCE_LABEL = {
  sec_edgar: 'SEC EDGAR',
  alpha_vantage: 'Alpha Vantage',
}
