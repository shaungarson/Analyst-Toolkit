// Frozen, embedded Costco (COST) demo snapshot - the app's provider-independent DCF
// demonstration (roadmap step 4). Every number below is real, transcribed by hand from a
// live call to the deployed production API (`GET /api/company/COST`, 2026-08-31), which in
// turn is real SEC EDGAR XBRL data - not fabricated, not a fixture invented for this file.
// This module makes no network request of its own; loading a case in the UI only ever
// reads these constants, so the demo works with SEC EDGAR and Alpha Vantage both fully
// unavailable. See docs/decisions.md's Costco-candidate validation record for the
// completeness/quality checks run against this same data before it was chosen.
//
// Shape matches CompanyData exactly (profile/periods/source, same field names, same
// provenance structure) specifically so CompanySourcedData, SourcedHistoryPanel, and every
// provenance dot/detail panel render this identically to a live ticker-search result -
// nothing about the sourced-data UI needed to special-case "is this a demo."

// Each Costco 10-K's own filing metadata, factored out once so the many XBRL facts that
// cite the same filing (a 10-K reports the current year plus prior-year comparatives)
// don't repeat five identical fields apiece. This is a DRY transcription of real, static
// values - not derived or computed - the frozen snapshot is exactly as literal as if every
// field were repeated by hand.
const FILING_FY2025 = {
  form: '10-K',
  filed: '2025-10-08',
  accession_number: '0000909832-25-000101',
  source_url: 'https://www.sec.gov/Archives/edgar/data/909832/000090983225000101/0000909832-25-000101-index.htm',
}
const FILING_FY2024 = {
  form: '10-K',
  filed: '2024-10-09',
  accession_number: '0000909832-24-000049',
  source_url: 'https://www.sec.gov/Archives/edgar/data/909832/000090983224000049/0000909832-24-000049-index.htm',
}
const FILING_FY2023 = {
  form: '10-K',
  filed: '2023-10-11',
  accession_number: '0000909832-23-000042',
  source_url: 'https://www.sec.gov/Archives/edgar/data/909832/000090983223000042/0000909832-23-000042-index.htm',
}
const FILING_FY2022 = {
  form: '10-K',
  filed: '2022-10-05',
  accession_number: '0000909832-22-000021',
  source_url: 'https://www.sec.gov/Archives/edgar/data/909832/000090983222000021/0000909832-22-000021-index.htm',
}

const sec = (value, tag, fiscalYear, filing) => ({
  source: 'sec_edgar',
  value,
  unit: 'USD',
  tag,
  fiscal_year: fiscalYear,
  fiscal_period: 'FY',
  ...filing,
})

const reported = (component) => ({ status: 'reported', components: [component], formula: null })
const combined = (components) => ({ status: 'combined', components, formula: null })
const calculated = (formula) => ({ status: 'calculated', components: [], formula })

const EFFECTIVE_TAX_RATE_FORMULA = 'Income tax expense ÷ pretax income'
const CHANGE_IN_NWC_FORMULA =
  '[(current assets − cash) − (current liabilities − current debt)] for this period, minus the same calculation for the prior period'
const UNLEVERED_FCF_FORMULA = 'EBIT × (1 − effective tax rate) + D&A − CapEx − change in NWC'
const NET_DEBT_FORMULA = 'Total debt − cash'
const REVENUE_GROWTH_FORMULA = '(Revenue − prior period revenue) ÷ prior period revenue'
const OPERATING_MARGIN_FORMULA = 'EBIT ÷ revenue'

const PERIODS = [
  {
    fiscal_year_end: '2025-08-31',
    revenue: 275235000000,
    ebit: 10383000000,
    pretax_income: 10818000000,
    income_tax_expense: 2719000000,
    effective_tax_rate: 0.2513403586614901,
    depreciation_and_amortization: 2426000000,
    capital_expenditures: 5498000000,
    change_in_nwc: -1747000000,
    unlevered_fcf: 6448333056.017748,
    cash: 15284000000,
    total_debt: 7267000000,
    net_debt: -8017000000,
    revenue_growth: 0.08167323631476146,
    operating_margin: 0.03772412665540356,
    source: 'sec_edgar',
    provenance: {
      revenue: reported(sec(275235000000, 'RevenueFromContractWithCustomerExcludingAssessedTax', 2025, FILING_FY2025)),
      ebit: reported(sec(10383000000, 'OperatingIncomeLoss', 2025, FILING_FY2025)),
      pretax_income: reported(
        sec(10818000000, 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 2025, FILING_FY2025),
      ),
      income_tax_expense: reported(sec(2719000000, 'IncomeTaxExpenseBenefit', 2025, FILING_FY2025)),
      depreciation_and_amortization: reported(sec(2426000000, 'DepreciationDepletionAndAmortization', 2025, FILING_FY2025)),
      capital_expenditures: reported(sec(5498000000, 'PaymentsToAcquirePropertyPlantAndEquipment', 2025, FILING_FY2025)),
      cash: combined([
        sec(14161000000, 'CashAndCashEquivalentsAtCarryingValue', 2025, FILING_FY2025),
        sec(1123000000, 'ShortTermInvestments', 2025, FILING_FY2025),
      ]),
      total_debt: combined([
        sec(5713000000, 'LongTermDebtNoncurrent', 2025, FILING_FY2025),
        sec(1401000000, 'FinanceLeaseLiabilityNoncurrent', 2025, FILING_FY2025),
        sec(75000000, 'LongTermDebtCurrent', 2025, FILING_FY2025),
        sec(78000000, 'FinanceLeaseLiabilityCurrent', 2025, FILING_FY2025),
      ]),
      effective_tax_rate: calculated(EFFECTIVE_TAX_RATE_FORMULA),
      change_in_nwc: calculated(CHANGE_IN_NWC_FORMULA),
      unlevered_fcf: calculated(UNLEVERED_FCF_FORMULA),
      net_debt: calculated(NET_DEBT_FORMULA),
      revenue_growth: calculated(REVENUE_GROWTH_FORMULA),
      operating_margin: calculated(OPERATING_MARGIN_FORMULA),
    },
  },
  {
    fiscal_year_end: '2024-09-01',
    revenue: 254453000000,
    ebit: 9285000000,
    pretax_income: 9740000000,
    income_tax_expense: 2373000000,
    effective_tax_rate: 0.24363449691991787,
    depreciation_and_amortization: 2237000000,
    capital_expenditures: 4710000000,
    change_in_nwc: -255000000,
    unlevered_fcf: 4804853696.098562,
    cash: 11144000000,
    total_debt: 7395000000,
    net_debt: -3749000000,
    revenue_growth: 0.05020017334599034,
    operating_margin: 0.036490039417888566,
    source: 'sec_edgar',
    provenance: {
      revenue: reported(sec(254453000000, 'RevenueFromContractWithCustomerExcludingAssessedTax', 2025, FILING_FY2025)),
      ebit: reported(sec(9285000000, 'OperatingIncomeLoss', 2025, FILING_FY2025)),
      pretax_income: reported(
        sec(9740000000, 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 2025, FILING_FY2025),
      ),
      income_tax_expense: reported(sec(2373000000, 'IncomeTaxExpenseBenefit', 2025, FILING_FY2025)),
      depreciation_and_amortization: reported(sec(2237000000, 'DepreciationDepletionAndAmortization', 2025, FILING_FY2025)),
      capital_expenditures: reported(sec(4710000000, 'PaymentsToAcquirePropertyPlantAndEquipment', 2025, FILING_FY2025)),
      cash: combined([
        sec(9906000000, 'CashAndCashEquivalentsAtCarryingValue', 2025, FILING_FY2025),
        sec(1238000000, 'ShortTermInvestments', 2025, FILING_FY2025),
      ]),
      total_debt: combined([
        sec(5794000000, 'LongTermDebtNoncurrent', 2025, FILING_FY2025),
        sec(1351000000, 'FinanceLeaseLiabilityNoncurrent', 2025, FILING_FY2025),
        sec(103000000, 'LongTermDebtCurrent', 2025, FILING_FY2025),
        sec(147000000, 'FinanceLeaseLiabilityCurrent', 2025, FILING_FY2025),
      ]),
      effective_tax_rate: calculated(EFFECTIVE_TAX_RATE_FORMULA),
      change_in_nwc: calculated(CHANGE_IN_NWC_FORMULA),
      unlevered_fcf: calculated(UNLEVERED_FCF_FORMULA),
      net_debt: calculated(NET_DEBT_FORMULA),
      revenue_growth: calculated(REVENUE_GROWTH_FORMULA),
      operating_margin: calculated(OPERATING_MARGIN_FORMULA),
    },
  },
  {
    fiscal_year_end: '2023-09-03',
    revenue: 242290000000,
    ebit: 8114000000,
    pretax_income: 8487000000,
    income_tax_expense: 2195000000,
    effective_tax_rate: 0.25863084717803697,
    depreciation_and_amortization: 2077000000,
    capital_expenditures: 4323000000,
    change_in_nwc: -1667000000,
    unlevered_fcf: 5436469305.997408,
    cash: 15234000000,
    total_debt: 6458000000,
    net_debt: -8776000000,
    revenue_growth: 0.06757316460604351,
    operating_margin: 0.033488794419910026,
    source: 'sec_edgar',
    provenance: {
      revenue: reported(sec(242290000000, 'RevenueFromContractWithCustomerExcludingAssessedTax', 2025, FILING_FY2025)),
      ebit: reported(sec(8114000000, 'OperatingIncomeLoss', 2025, FILING_FY2025)),
      pretax_income: reported(
        sec(8487000000, 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 2025, FILING_FY2025),
      ),
      income_tax_expense: reported(sec(2195000000, 'IncomeTaxExpenseBenefit', 2025, FILING_FY2025)),
      depreciation_and_amortization: reported(sec(2077000000, 'DepreciationDepletionAndAmortization', 2025, FILING_FY2025)),
      capital_expenditures: reported(sec(4323000000, 'PaymentsToAcquirePropertyPlantAndEquipment', 2025, FILING_FY2025)),
      cash: combined([
        sec(13700000000, 'CashAndCashEquivalentsAtCarryingValue', 2024, FILING_FY2024),
        sec(1534000000, 'ShortTermInvestments', 2024, FILING_FY2024),
      ]),
      total_debt: combined([
        sec(5377000000, 'LongTermDebtNoncurrent', 2024, FILING_FY2024),
        sec(1081000000, 'LongTermDebtCurrent', 2024, FILING_FY2024),
      ]),
      effective_tax_rate: calculated(EFFECTIVE_TAX_RATE_FORMULA),
      change_in_nwc: calculated(CHANGE_IN_NWC_FORMULA),
      unlevered_fcf: calculated(UNLEVERED_FCF_FORMULA),
      net_debt: calculated(NET_DEBT_FORMULA),
      revenue_growth: calculated(REVENUE_GROWTH_FORMULA),
      operating_margin: calculated(OPERATING_MARGIN_FORMULA),
    },
  },
  {
    fiscal_year_end: '2022-08-28',
    revenue: 226954000000,
    ebit: 7793000000,
    pretax_income: 7840000000,
    income_tax_expense: 1925000000,
    effective_tax_rate: 0.24553571428571427,
    depreciation_and_amortization: 1900000000,
    capital_expenditures: 3891000000,
    change_in_nwc: 1081000000,
    unlevered_fcf: 2807540178.5714283,
    cash: 11049000000,
    total_debt: 6645000000,
    net_debt: -4404000000,
    revenue_growth: 0.15834817714580282,
    operating_margin: 0.03433735470624003,
    source: 'sec_edgar',
    provenance: {
      revenue: reported(sec(226954000000, 'RevenueFromContractWithCustomerExcludingAssessedTax', 2024, FILING_FY2024)),
      ebit: reported(sec(7793000000, 'OperatingIncomeLoss', 2024, FILING_FY2024)),
      pretax_income: reported(
        sec(7840000000, 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 2024, FILING_FY2024),
      ),
      income_tax_expense: reported(sec(1925000000, 'IncomeTaxExpenseBenefit', 2024, FILING_FY2024)),
      depreciation_and_amortization: reported(sec(1900000000, 'DepreciationDepletionAndAmortization', 2024, FILING_FY2024)),
      capital_expenditures: reported(sec(3891000000, 'PaymentsToAcquirePropertyPlantAndEquipment', 2024, FILING_FY2024)),
      cash: combined([
        sec(10203000000, 'CashAndCashEquivalentsAtCarryingValue', 2023, FILING_FY2023),
        sec(846000000, 'ShortTermInvestments', 2023, FILING_FY2023),
      ]),
      total_debt: combined([
        sec(6484000000, 'LongTermDebtNoncurrent', 2023, FILING_FY2023),
        sec(73000000, 'LongTermDebtCurrent', 2023, FILING_FY2023),
        sec(88000000, 'OtherShortTermBorrowings', 2022, FILING_FY2022),
      ]),
      effective_tax_rate: calculated(EFFECTIVE_TAX_RATE_FORMULA),
      change_in_nwc: calculated(CHANGE_IN_NWC_FORMULA),
      unlevered_fcf: calculated(UNLEVERED_FCF_FORMULA),
      net_debt: calculated(NET_DEBT_FORMULA),
      revenue_growth: calculated(REVENUE_GROWTH_FORMULA),
      operating_margin: calculated(OPERATING_MARGIN_FORMULA),
    },
  },
  {
    fiscal_year_end: '2021-08-29',
    revenue: 195929000000,
    ebit: 6708000000,
    pretax_income: 6680000000,
    income_tax_expense: 1601000000,
    effective_tax_rate: 0.23967065868263474,
    depreciation_and_amortization: 1781000000,
    capital_expenditures: 3588000000,
    change_in_nwc: -1368000000,
    unlevered_fcf: 4661289221.556887,
    cash: 12175000000,
    total_debt: 7532000000,
    net_debt: -4643000000,
    // No prior period in this 5-year window to compare against - null here, same as the
    // live pipeline returns for any oldest displayed period, not a demo-specific gap.
    revenue_growth: null,
    operating_margin: 0.034236891935343926,
    source: 'sec_edgar',
    provenance: {
      revenue: reported(sec(195929000000, 'RevenueFromContractWithCustomerExcludingAssessedTax', 2023, FILING_FY2023)),
      ebit: reported(sec(6708000000, 'OperatingIncomeLoss', 2023, FILING_FY2023)),
      pretax_income: reported(
        sec(6680000000, 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 2023, FILING_FY2023),
      ),
      income_tax_expense: reported(sec(1601000000, 'IncomeTaxExpenseBenefit', 2023, FILING_FY2023)),
      depreciation_and_amortization: reported(sec(1781000000, 'DepreciationDepletionAndAmortization', 2023, FILING_FY2023)),
      capital_expenditures: reported(sec(3588000000, 'PaymentsToAcquirePropertyPlantAndEquipment', 2023, FILING_FY2023)),
      cash: combined([
        sec(11258000000, 'CashAndCashEquivalentsAtCarryingValue', 2022, FILING_FY2022),
        sec(917000000, 'ShortTermInvestments', 2022, FILING_FY2022),
      ]),
      total_debt: combined([
        sec(6692000000, 'LongTermDebtNoncurrent', 2022, FILING_FY2022),
        sec(799000000, 'LongTermDebtCurrent', 2022, FILING_FY2022),
        sec(41000000, 'OtherShortTermBorrowings', 2022, FILING_FY2022),
      ]),
      effective_tax_rate: calculated(EFFECTIVE_TAX_RATE_FORMULA),
      change_in_nwc: calculated(CHANGE_IN_NWC_FORMULA),
      unlevered_fcf: calculated(UNLEVERED_FCF_FORMULA),
      net_debt: calculated(NET_DEBT_FORMULA),
      operating_margin: calculated(OPERATING_MARGIN_FORMULA),
      // No revenue_growth key: the live pipeline never attaches calculated provenance for
      // a null value (see _calculated_provenance), so this omission is itself accurate.
    },
  },
]

// profile.reference_price/reference_price_as_of stay null here, matching what the live API
// actually returned (Alpha Vantage's quote was unavailable) - the demo's reference price is
// applied separately below, from a different, explicitly-cited source, never presented as
// if SEC EDGAR or Alpha Vantage had supplied it.
//
// company_name/industry/exchange/market_capitalization, unlike reference_price, are static
// profile facts rather than a per-case editable input, so they're set directly here instead
// of applied separately - company_name and exchange are SEC/Costco-IR-sourced (the SEC
// registrant name is "COSTCO WHOLESALE CORP /NEW"; "/NEW" is a legacy EDGAR conformed-name
// suffix tied to Costco's 1997 name change, not part of its current user-facing name);
// industry uses the same "membership warehouses" description SEC filings and Costco's own
// IR materials both use. market_capitalization is dated market data, not an SEC fact - see
// COSTCO_MARKET_CAP_DATE/SOURCE below, disclosed the same way the reference price is.
export const COSTCO_COMPANY_DATA = {
  profile: {
    ticker: 'COST',
    company_name: 'Costco Wholesale Corporation',
    sector: null,
    industry: 'Membership Warehouses',
    exchange: 'Nasdaq Global Select Market',
    market_capitalization: 418600000000,
    shares_outstanding: 444803000,
    reference_price: null,
    reference_price_as_of: null,
    sec_cik: '0000909832',
    sec_filings_url:
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=909832&type=10-K&dateb=&owner=include&count=40',
  },
  periods: PERIODS,
  source: { fundamentals_provider: 'sec_edgar', market_data_provider: null, sec_filings_provider: 'sec_edgar' },
}

// Alpha Vantage's quote was unavailable when this snapshot was built (2026-08-31), so the
// reference price comes from a named third-party market-data site instead - a real,
// dated, single-sourced closing price, not invented and not presented as SEC- or
// Alpha-Vantage-sourced. If this ever needs refreshing, the same rule applies: only ever
// replace it with another real, dated, attributable figure - never a placeholder.
export const COSTCO_REFERENCE_PRICE = '943.88'
export const COSTCO_REFERENCE_PRICE_DATE = '2026-08-31'
export const COSTCO_REFERENCE_PRICE_SOURCE_LABEL = 'stockanalysis.com'
export const COSTCO_REFERENCE_PRICE_SOURCE_URL = 'https://stockanalysis.com/stocks/cost/history/'

// Same rule as the reference price above: a real, dated, single-sourced figure, cited by
// name and never implied to be live or SEC-sourced. Independent of COSTCO_REFERENCE_PRICE
// (a different stockanalysis.com page - the dedicated market-cap page, not the historical
// close table) - deliberately not derived from shares_outstanding * reference price, since
// that would be this app's own arithmetic presented as if it were the sourced figure.
export const COSTCO_MARKET_CAP_DATE = '2026-08-31'
export const COSTCO_MARKET_CAP_SOURCE_LABEL = 'stockanalysis.com'
export const COSTCO_MARKET_CAP_SOURCE_URL = 'https://stockanalysis.com/stocks/cost/market-cap/'

export const COSTCO_FINANCIALS_FISCAL_YEAR_END = '2025-08-31'
export const COSTCO_FINANCIALS_FILED = '2025-10-08'

// WACC and terminal growth are the same across every case, by design - only the
// explicit-period FCF growth assumption changes, so the three results isolate exactly one
// variable. Values are ordinary, defensible assumptions for a large, low-leverage,
// low-beta retailer - not tuned to land near (or away from) the reference price.
export const COSTCO_SHARED_ASSUMPTIONS = {
  forecastYears: '5',
  wacc: '7.5',
  terminalGrowthRate: '2.5',
}

export const COSTCO_CASES = [
  {
    id: 'downside',
    label: 'Downside',
    fcfGrowthRate: '4',
    description: 'A slower growth path - membership and warehouse growth cool off in a tougher macro environment.',
  },
  {
    id: 'base',
    label: 'Base',
    fcfGrowthRate: '8',
    description:
      "An illustrative FCF-growth assumption, set roughly in line with Costco's most recently reported revenue growth - not a UFCF growth trend, and not company guidance.",
  },
  {
    id: 'upside',
    label: 'Upside',
    fcfGrowthRate: '12',
    description: 'A stronger growth path - accelerated new-warehouse openings and membership growth.',
  },
]
