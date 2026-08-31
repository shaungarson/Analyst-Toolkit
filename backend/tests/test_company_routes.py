"""Route-level tests for the company API surface (/api/company/{ticker}).

Exercises the FastAPI routing and, most importantly, response_model=CompanyData
serialization - whether the full nested schema (FinancialPeriod.provenance's
FieldProvenance/ProvenanceComponent models) actually validates a real mixed-provider
response, not just whether the underlying service function returns a plausible dict.
test_company_data.py already covers the merge/provenance logic directly; this file is
about whether the HTTP layer serializes it without silently dropping or rejecting fields.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import company_data

client = TestClient(app)

OVERVIEW = {
    "Symbol": "TEST",
    "Name": "Test Corp",
    "Sector": "TECHNOLOGY",
    "Industry": "SOFTWARE",
    "Exchange": "NYSE",
    "MarketCapitalization": "222042227000",
    "SharesOutstanding": "942134000",
}
INCOME_REPORTS = [
    {
        "fiscalDateEnding": "2025-12-31",
        "totalRevenue": "67536000000",
        "operatingIncome": "12492000000",
        "incomeBeforeTax": "10328000000",
        "incomeTaxExpense": "2166000000",
    },
    {
        "fiscalDateEnding": "2024-12-31",
        "totalRevenue": "62000000000",
        "operatingIncome": "11000000000",
        "incomeBeforeTax": "9500000000",
        "incomeTaxExpense": "1900000000",
    },
]
BALANCE_REPORTS = [
    {
        "fiscalDateEnding": "2025-12-31",
        "cashAndShortTermInvestments": "13641000000",
        "shortLongTermDebtTotal": "67154000000",
        "totalCurrentAssets": "35860000000",
        "totalCurrentLiabilities": "38658000000",
        "currentDebt": "5000000000",
    },
    {
        "fiscalDateEnding": "2024-12-31",
        "cashAndShortTermInvestments": "12000000000",
        "shortLongTermDebtTotal": "65000000000",
        "totalCurrentAssets": "34000000000",
        "totalCurrentLiabilities": "37000000000",
        "currentDebt": "4800000000",
    },
]
CASH_FLOW_REPORTS = [
    {
        "fiscalDateEnding": "2025-12-31",
        "depreciationDepletionAndAmortization": "5021000000",
        "capitalExpenditures": "1091000000",
    },
    {
        "fiscalDateEnding": "2024-12-31",
        "depreciationDepletionAndAmortization": "4800000000",
        "capitalExpenditures": "1000000000",
    },
]
QUOTE = {"05. price": "231.06", "07. latest trading day": "2025-12-30"}


def _sec_fact(val, end, start=None, fy=2025, fp="FY", accn="0000320193-25-000079", filed="2026-02-01"):
    fact = {"val": val, "end": end, "fy": fy, "fp": fp, "accn": accn, "filed": filed, "form": "10-K"}
    if start:
        fact["start"] = start
    return fact


@pytest.fixture(autouse=True)
def mock_providers(monkeypatch):
    monkeypatch.setattr("app.services.company_data.alpha_vantage.fetch_overview", lambda ticker: OVERVIEW)
    monkeypatch.setattr(
        "app.services.company_data.alpha_vantage.fetch_income_statement",
        lambda ticker: {"annualReports": INCOME_REPORTS},
    )
    monkeypatch.setattr(
        "app.services.company_data.alpha_vantage.fetch_balance_sheet",
        lambda ticker: {"annualReports": BALANCE_REPORTS},
    )
    monkeypatch.setattr(
        "app.services.company_data.alpha_vantage.fetch_cash_flow",
        lambda ticker: {"annualReports": CASH_FLOW_REPORTS},
    )
    monkeypatch.setattr("app.services.company_data.alpha_vantage.fetch_quote", lambda ticker: QUOTE)
    monkeypatch.setattr(
        "app.services.company_data.sec_edgar.lookup_cik",
        lambda ticker: {"cik": "0000320193", "title": "Test Corp", "filings_url": "https://example.com"},
    )
    # A real mixed-provenance shape: revenue is a direct SEC fact ("reported"), cash sums
    # two SEC facts ("combined"), everything else for this period is absent from SEC and
    # falls back to Alpha Vantage ("fallback") - one fixture exercising all three sourced
    # statuses plus the "calculated" ones (effective_tax_rate, UFCF, etc.) at once.
    monkeypatch.setattr(
        "app.services.company_data.sec_edgar.fetch_company_facts",
        lambda cik: {
            "facts": {
                "us-gaap": {
                    "Revenues": {"units": {"USD": [_sec_fact(70_000_000_000, "2025-12-31", start="2025-01-01")]}},
                    "OperatingIncomeLoss": {
                        "units": {"USD": [_sec_fact(13_000_000_000, "2025-12-31", start="2025-01-01")]}
                    },
                    "AssetsCurrent": {"units": {"USD": [_sec_fact(36_000_000_000, "2025-12-31")]}},
                    "LiabilitiesCurrent": {"units": {"USD": [_sec_fact(39_000_000_000, "2025-12-31")]}},
                    "CashAndCashEquivalentsAtCarryingValue": {
                        "units": {"USD": [_sec_fact(10_000_000_000, "2025-12-31")]}
                    },
                    "MarketableSecuritiesCurrent": {"units": {"USD": [_sec_fact(4_000_000_000, "2025-12-31")]}},
                }
            }
        },
    )
    company_data._fundamentals_cache.clear()
    company_data._quote_cache.clear()


def test_company_route_returns_200_and_serializes_full_provenance_shape():
    res = client.get("/api/company/TEST")
    assert res.status_code == 200
    body = res.json()

    assert body["profile"]["reference_price"] == pytest.approx(231.06)
    assert body["profile"]["reference_price_as_of"] == "2025-12-30"

    latest = body["periods"][0]
    assert latest["source"] == "mixed"

    revenue_prov = latest["provenance"]["revenue"]
    assert revenue_prov["status"] == "reported"
    assert revenue_prov["components"][0]["source"] == "sec_edgar"
    assert revenue_prov["components"][0]["tag"] == "Revenues"
    assert revenue_prov["components"][0]["source_url"].startswith("https://www.sec.gov/Archives/edgar/data/")
    # The schema's declared None defaults for fields this component doesn't have are
    # present and null, not silently dropped by serialization.
    assert revenue_prov["components"][0]["alpha_vantage_field"] is None

    cash_prov = latest["provenance"]["cash"]
    assert cash_prov["status"] == "combined"
    assert len(cash_prov["components"]) == 2

    fallback_prov = latest["provenance"]["income_tax_expense"]
    assert fallback_prov["status"] == "fallback"
    assert fallback_prov["components"][0]["source"] == "alpha_vantage"
    assert fallback_prov["components"][0]["alpha_vantage_field"] == "incomeTaxExpense"
    assert fallback_prov["components"][0]["tag"] is None

    ufcf_prov = latest["provenance"]["unlevered_fcf"]
    assert ufcf_prov["status"] == "calculated"
    assert ufcf_prov["components"] == []
    assert ufcf_prov["formula"]


def test_company_route_404s_when_neither_provider_recognizes_the_ticker(monkeypatch):
    monkeypatch.setattr("app.services.company_data.sec_edgar.lookup_cik", lambda ticker: None)

    def raise_not_found(ticker):
        from app.services.alpha_vantage import TickerNotFoundError

        raise TickerNotFoundError("no such ticker")

    monkeypatch.setattr("app.services.company_data.alpha_vantage.fetch_overview", raise_not_found)

    res = client.get("/api/company/NOPE")
    assert res.status_code == 404
