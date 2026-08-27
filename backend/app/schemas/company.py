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
    market_data_provider: str
    sec_filings_provider: str | None


class CompanyData(BaseModel):
    profile: CompanyProfile
    periods: list[FinancialPeriod]
    source: CompanyDataSource
