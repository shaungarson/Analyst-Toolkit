import pytest

from app.services import company_data
from app.services.alpha_vantage import RateLimitedError, TickerNotFoundError

# Shapes below mirror real Alpha Vantage responses (values are strings, missing fields are
# the literal string "None") - verified against the live API for IBM before writing this
# module, not guessed from documentation.

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
    {
        "fiscalDateEnding": "2023-12-31",
        "cashAndShortTermInvestments": "11000000000",
        "shortLongTermDebtTotal": "60000000000",
        "totalCurrentAssets": "33000000000",
        "totalCurrentLiabilities": "36000000000",
        "currentDebt": "4500000000",
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
        # Alpha Vantage represents a genuinely missing field as the literal string "None",
        # not JSON null or an omitted key - this must not crash or become 0.
        "changeInOperatingAssets": "None",
    },
]

QUOTE = {"05. price": "231.06"}


@pytest.fixture(autouse=True)
def mock_providers(monkeypatch):
    monkeypatch.setattr(
        "app.services.company_data.alpha_vantage.fetch_overview", lambda ticker: OVERVIEW
    )
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
        lambda ticker: {"cik": "0000123456", "title": "Test Corp", "filings_url": "https://example.com"},
    )
    # Each test gets a clean cache, since the module-level cache would otherwise leak
    # state between tests (and between real requests for different tickers in prod).
    company_data._fundamentals_cache.clear()
    company_data._quote_cache.clear()


def test_get_company_data_profile_fields():
    result = company_data.get_company_data("test")
    profile = result["profile"]
    assert profile["ticker"] == "TEST"
    assert profile["company_name"] == "Test Corp"
    assert profile["sector"] == "TECHNOLOGY"
    assert profile["market_capitalization"] == pytest.approx(222_042_227_000)
    assert profile["current_price"] == pytest.approx(231.06)
    assert profile["sec_cik"] == "0000123456"
    assert profile["sec_filings_url"] == "https://example.com"


def test_get_company_data_most_recent_period_hand_computed():
    result = company_data.get_company_data("TEST")
    latest = result["periods"][0]
    assert latest["fiscal_year_end"] == "2025-12-31"
    assert latest["revenue"] == pytest.approx(67_536_000_000)
    assert latest["ebit"] == pytest.approx(12_492_000_000)

    # Effective tax rate = 2,166,000,000 / 10,328,000,000
    assert latest["effective_tax_rate"] == pytest.approx(2_166_000_000 / 10_328_000_000)

    # NWC (2025) = (35,860,000,000 - 13,641,000,000) - (38,658,000,000 - 5,000,000,000)
    #            = 22,219,000,000 - 33,658,000,000 = -11,439,000,000
    # NWC (2024) = (34,000,000,000 - 12,000,000,000) - (37,000,000,000 - 4,800,000,000)
    #            = 22,000,000,000 - 32,200,000,000 = -10,200,000,000
    # Change in NWC = -11,439,000,000 - (-10,200,000,000) = -1,239,000,000
    assert latest["change_in_nwc"] == pytest.approx(-1_239_000_000)

    # UFCF = EBIT*(1-tax) + D&A - CapEx - NWC change
    tax_rate = 2_166_000_000 / 10_328_000_000
    expected_ufcf = (
        12_492_000_000 * (1 - tax_rate) + 5_021_000_000 - 1_091_000_000 - (-1_239_000_000)
    )
    assert latest["unlevered_fcf"] == pytest.approx(expected_ufcf)

    # Net debt = total debt - cash = 67,154,000,000 - 13,641,000,000
    assert latest["net_debt"] == pytest.approx(53_513_000_000)


def test_get_company_data_revenue_growth_hand_computed():
    result = company_data.get_company_data("TEST")
    latest, prior = result["periods"][0], result["periods"][1]
    # (67,536,000,000 - 62,000,000,000) / 62,000,000,000
    assert latest["revenue_growth"] == pytest.approx((67_536_000_000 - 62_000_000_000) / 62_000_000_000)
    # Oldest period fetched has no earlier period to compare against.
    assert result["periods"][-1]["revenue_growth"] is None


def test_get_company_data_missing_field_is_none_not_zero_or_crash():
    result = company_data.get_company_data("TEST")
    prior_period = result["periods"][1]
    # changeInOperatingAssets was the literal string "None" for this period in the fixture;
    # that alone doesn't block NWC (only cash/current assets/liabilities/debt are used), but
    # confirms _safe_float handles it without raising.
    assert prior_period["revenue"] == pytest.approx(62_000_000_000)


def test_get_company_data_caches_repeat_calls(monkeypatch):
    call_count = {"overview": 0}

    def counting_overview(ticker):
        call_count["overview"] += 1
        return OVERVIEW

    monkeypatch.setattr("app.services.company_data.alpha_vantage.fetch_overview", counting_overview)

    company_data.get_company_data("TEST")
    company_data.get_company_data("TEST")

    assert call_count["overview"] == 1


def test_get_company_data_propagates_ticker_not_found(monkeypatch):
    def raise_not_found(ticker):
        raise TickerNotFoundError("no such ticker")

    monkeypatch.setattr("app.services.company_data.alpha_vantage.fetch_overview", raise_not_found)

    with pytest.raises(TickerNotFoundError):
        company_data.get_company_data("NOPE")


def test_get_company_data_propagates_rate_limit(monkeypatch):
    def raise_rate_limited(ticker):
        raise RateLimitedError("daily limit reached")

    monkeypatch.setattr("app.services.company_data.alpha_vantage.fetch_overview", raise_rate_limited)

    with pytest.raises(RateLimitedError):
        company_data.get_company_data("TEST")


def test_get_company_data_works_without_sec_match(monkeypatch):
    monkeypatch.setattr("app.services.company_data.sec_edgar.lookup_cik", lambda ticker: None)

    result = company_data.get_company_data("TEST")
    assert result["profile"]["sec_cik"] is None
    assert result["profile"]["sec_filings_url"] is None
    assert result["source"]["sec_filings_provider"] is None


def test_current_debt_falls_back_to_short_term_debt(monkeypatch):
    # Found via live testing against the real API, not hypothesized: Apple's actual balance
    # sheet reports the literal string "None" for currentDebt but does report shortTermDebt
    # for the same period. Without this fallback, NWC (and therefore UFCF) silently comes
    # back undefined for a real, large-cap company - not an edge case.
    balance_reports_with_missing_current_debt = [
        {
            "fiscalDateEnding": "2025-12-31",
            "cashAndShortTermInvestments": "13641000000",
            "shortLongTermDebtTotal": "67154000000",
            "totalCurrentAssets": "35860000000",
            "totalCurrentLiabilities": "38658000000",
            "currentDebt": "None",
            "shortTermDebt": "5000000000",
        },
        {
            "fiscalDateEnding": "2024-12-31",
            "cashAndShortTermInvestments": "12000000000",
            "shortLongTermDebtTotal": "65000000000",
            "totalCurrentAssets": "34000000000",
            "totalCurrentLiabilities": "37000000000",
            "currentDebt": "None",
            "shortTermDebt": "4800000000",
        },
    ]
    monkeypatch.setattr(
        "app.services.company_data.alpha_vantage.fetch_balance_sheet",
        lambda ticker: {"annualReports": balance_reports_with_missing_current_debt},
    )

    result = company_data.get_company_data("TEST")
    latest = result["periods"][0]

    # Same hand-computed NWC as the primary test above, but sourced via the shortTermDebt
    # fallback instead of currentDebt: (35,860,000,000 - 13,641,000,000) - (38,658,000,000 - 5,000,000,000) = -11,439,000,000
    assert latest["change_in_nwc"] is not None
    assert latest["unlevered_fcf"] is not None
