from typing import Literal

from pydantic import BaseModel


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
    # blended. Full per-field provenance (XBRL tag, accession number, filing date) is
    # retained internally (app/services/sec_fundamentals.py) for a future milestone, not
    # exposed on this model yet.
    source: Literal["sec_edgar", "alpha_vantage", "mixed"]


class CompanyProfile(BaseModel):
    ticker: str
    company_name: str
    sector: str | None
    industry: str | None
    exchange: str | None
    market_capitalization: float | None
    shares_outstanding: float | None
    current_price: float | None
    sec_cik: str | None
    sec_filings_url: str | None


class CompanyDataSource(BaseModel):
    fundamentals_provider: str
    # None when the Alpha Vantage quote fetch didn't succeed this request (rate limited,
    # unconfigured, unreachable) - honest disclosure that no current price came from
    # anywhere, not a claim that Alpha Vantage supplied one.
    market_data_provider: str | None
    sec_filings_provider: str | None


class CompanyData(BaseModel):
    profile: CompanyProfile
    periods: list[FinancialPeriod]
    source: CompanyDataSource
