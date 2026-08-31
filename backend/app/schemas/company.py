from typing import Literal

from pydantic import BaseModel


class ProvenanceComponent(BaseModel):
    """One underlying fact contributing to a FinancialPeriod value - a single SEC XBRL tag
    at a specific filing, or a single Alpha Vantage report field. A "combined" value (e.g.
    cash = cash-and-equivalents + short-term investments) has more than one component; a
    "reported" or "fallback" value has exactly one. Fields the source didn't supply for this
    component (e.g. Alpha Vantage never returns an accession number) stay None rather than
    being fabricated."""

    source: Literal["sec_edgar", "alpha_vantage"]
    value: float | None = None
    unit: str | None = None
    # SEC-only fields:
    tag: str | None = None
    fiscal_year: int | None = None
    fiscal_period: str | None = None
    form: str | None = None
    filed: str | None = None
    accession_number: str | None = None
    source_url: str | None = None
    # Alpha Vantage-only: the raw report field this component came from (e.g.
    # "totalRevenue") - Alpha Vantage's reports carry no filing date, form, or accession
    # equivalent, so those stay None for a "alpha_vantage" component.
    alpha_vantage_field: str | None = None


class FieldProvenance(BaseModel):
    """Where one FinancialPeriod value came from and how confidently. "reported" - a
    single SEC XBRL fact, taken directly. "combined" - summed from more than one SEC XBRL
    fact (e.g. debt, cash). "calculated" - derived by formula from other already-resolved
    values (e.g. UFCF, NWC change, tax rate) - never itself a single reported fact, so
    components is always empty and `formula` describes the calculation instead. "fallback"
    - Alpha Vantage supplied this field because SEC couldn't map it confidently for this
    period; never labeled "reported", since it did not come from SEC."""

    status: Literal["reported", "combined", "calculated", "fallback"]
    components: list[ProvenanceComponent] = []
    formula: str | None = None


class FinancialPeriod(BaseModel):
    fiscal_year_end: str
    revenue: float | None
    ebit: float | None
    pretax_income: float | None
    income_tax_expense: float | None
    effective_tax_rate: float | None
    depreciation_and_amortization: float | None
    capital_expenditures: float | None
    change_in_nwc: float | None
    unlevered_fcf: float | None
    cash: float | None
    total_debt: float | None
    net_debt: float | None
    revenue_growth: float | None
    operating_margin: float | None
    # Which provider this period's figures came from. "mixed" means at least one field
    # (e.g. debt, when a filer's XBRL debt tags couldn't be confidently mapped) fell back
    # to Alpha Vantage while others came from SEC - disclosed here rather than silently
    # blended. This stays as a coarse, period-level summary; `provenance` below carries the
    # real per-field detail.
    source: Literal["sec_edgar", "alpha_vantage", "mixed"]
    # Per-field detail, keyed by the same field names as this model (e.g. "revenue",
    # "unlevered_fcf"). A field with no entry here means neither provider supplied a value
    # for it (already reflected as None above) - never fabricated to fill the gap.
    provenance: dict[str, FieldProvenance] = {}


class CompanyProfile(BaseModel):
    ticker: str
    company_name: str
    sector: str | None
    industry: str | None
    exchange: str | None
    market_capitalization: float | None
    shares_outstanding: float | None
    # A dated comparison price, not a live quote - Alpha Vantage's own "latest trading day"
    # close when available. Deliberately not named "current_price": nothing about this app
    # streams or refreshes it, and the old name implied real-time data it never was.
    reference_price: float | None
    reference_price_as_of: str | None
    sec_cik: str | None
    sec_filings_url: str | None


class CompanyDataSource(BaseModel):
    fundamentals_provider: str
    # None when the Alpha Vantage quote fetch didn't succeed this request (rate limited,
    # unconfigured, unreachable) - honest disclosure that no reference price came from
    # anywhere, not a claim that Alpha Vantage supplied one.
    market_data_provider: str | None
    sec_filings_provider: str | None


class CompanyData(BaseModel):
    profile: CompanyProfile
    periods: list[FinancialPeriod]
    source: CompanyDataSource
