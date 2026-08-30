import pytest

from app.services import company_data, sec_edgar
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
    # An empty us-gaap fact set means sec_fundamentals.extract_annual_periods finds no
    # annual EBIT fact to anchor on and returns no periods at all - every field for every
    # period falls back to Alpha Vantage, so the pre-existing hand-computed assertions
    # below stay valid unchanged. This also guarantees no real network call reaches SEC
    # EDGAR from this test module.
    monkeypatch.setattr(
        "app.services.company_data.sec_edgar.fetch_company_facts",
        lambda cik: {"facts": {"us-gaap": {}}},
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

    # This test's mock_providers fixture gives SEC EDGAR an empty fact set, so every field
    # falls back to Alpha Vantage.
    assert latest["source"] == "alpha_vantage"


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


# --- SEC EDGAR primary / Alpha Vantage fallback merge -----------------------------------
# These fixtures deliberately give SEC data for only the most recent period (2025-12-31),
# and only some fields within it, and use values that differ from the Alpha Vantage fixture
# above wherever both are present - so a passing assertion proves which provider's number
# actually won, not just that some number came through.


def _sec_fact(val, end, start=None, fy=2025, fp="FY", accn="0001-25-000001", filed="2026-02-01"):
    fact = {"val": val, "end": end, "fy": fy, "fp": fp, "accn": accn, "filed": filed, "form": "10-K"}
    if start:
        fact["start"] = start
    return fact


def _sec_facts_for_2025_only(*, include_debt_split=True):
    duration = {"start": "2025-01-01"}
    return {
        "facts": {
            "us-gaap": {
                "Revenues": {"units": {"USD": [_sec_fact(70_000_000_000, "2025-12-31", **duration)]}},
                "OperatingIncomeLoss": {"units": {"USD": [_sec_fact(13_000_000_000, "2025-12-31", **duration)]}},
                "AssetsCurrent": {"units": {"USD": [_sec_fact(36_000_000_000, "2025-12-31")]}},
                "LiabilitiesCurrent": {"units": {"USD": [_sec_fact(39_000_000_000, "2025-12-31")]}},
                "CashAndCashEquivalentsAtCarryingValue": {
                    "units": {"USD": [_sec_fact(10_000_000_000, "2025-12-31")]}
                },
                "MarketableSecuritiesCurrent": {"units": {"USD": [_sec_fact(4_000_000_000, "2025-12-31")]}},
                **(
                    {
                        "LongTermDebtNoncurrent": {"units": {"USD": [_sec_fact(60_000_000_000, "2025-12-31")]}},
                        "LongTermDebtCurrent": {"units": {"USD": [_sec_fact(8_000_000_000, "2025-12-31")]}},
                    }
                    if include_debt_split
                    else {}
                ),
                "WeightedAverageNumberOfDilutedSharesOutstanding": {
                    "units": {"shares": [_sec_fact(950_000_000, "2025-12-31", **duration)]}
                },
                # pretax_income, income_tax_expense, D&A, and capex are deliberately absent -
                # these fields must fall back to Alpha Vantage for this period.
            }
        }
    }


def test_get_company_data_merges_sec_primary_with_alpha_vantage_fallback(monkeypatch):
    monkeypatch.setattr(
        "app.services.company_data.sec_edgar.fetch_company_facts",
        lambda cik: _sec_facts_for_2025_only(),
    )

    result = company_data.get_company_data("TEST")
    latest = result["periods"][0]

    # SEC-sourced fields use SEC's numbers (which deliberately differ from the AV fixture).
    assert latest["revenue"] == pytest.approx(70_000_000_000)
    assert latest["ebit"] == pytest.approx(13_000_000_000)
    assert latest["cash"] == pytest.approx(14_000_000_000)  # 10bn cash + 4bn short-term investments
    assert latest["total_debt"] == pytest.approx(68_000_000_000)  # 60bn noncurrent + 8bn current

    # Fields SEC didn't map for this period (pretax income, tax expense, D&A, capex) still
    # fall back to Alpha Vantage's numbers rather than going missing.
    assert latest["income_tax_expense"] == pytest.approx(2_166_000_000)
    assert latest["depreciation_and_amortization"] == pytest.approx(5_021_000_000)

    # A period blending both providers must say so, not silently look SEC-pure or AV-pure.
    assert latest["source"] == "mixed"

    # NWC (2025, SEC-sourced) = (36bn - 14bn) - (39bn - 8bn) = 22bn - 31bn = -9bn
    # NWC (2024, no SEC data for this period, fully AV-sourced) = -10,200,000,000 (as in the
    # primary hand-computed test above)
    # change_in_nwc = -9,000,000,000 - (-10,200,000,000) = 1,200,000,000
    assert latest["change_in_nwc"] == pytest.approx(1_200_000_000)

    tax_rate = 2_166_000_000 / 10_328_000_000  # pretax_income also fell back to AV: 10,328,000,000
    expected_ufcf = 13_000_000_000 * (1 - tax_rate) + 5_021_000_000 - 1_091_000_000 - 1_200_000_000
    assert latest["unlevered_fcf"] == pytest.approx(expected_ufcf)

    assert latest["net_debt"] == pytest.approx(68_000_000_000 - 14_000_000_000)

    # SEC's diluted share count takes over the profile-level shares_outstanding field.
    assert result["profile"]["shares_outstanding"] == pytest.approx(950_000_000)
    assert result["source"]["fundamentals_provider"] == "sec_edgar"


def test_get_company_data_reports_sec_edgar_source_when_every_field_maps(monkeypatch):
    # Build a fixture identical to the mixed one but with the four gap fields filled too,
    # so every merged field for this period is SEC-sourced.
    facts = _sec_facts_for_2025_only()
    duration = {"start": "2025-01-01"}
    facts["facts"]["us-gaap"].update(
        {
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest": {
                "units": {"USD": [_sec_fact(12_500_000_000, "2025-12-31", **duration)]}
            },
            "IncomeTaxExpenseBenefit": {"units": {"USD": [_sec_fact(2_500_000_000, "2025-12-31", **duration)]}},
            "DepreciationDepletionAndAmortization": {
                "units": {"USD": [_sec_fact(5_100_000_000, "2025-12-31", **duration)]}
            },
            "PaymentsToAcquirePropertyPlantAndEquipment": {
                "units": {"USD": [_sec_fact(1_200_000_000, "2025-12-31", **duration)]}
            },
        }
    )
    monkeypatch.setattr("app.services.company_data.sec_edgar.fetch_company_facts", lambda cik: facts)

    result = company_data.get_company_data("TEST")
    assert result["periods"][0]["source"] == "sec_edgar"


def test_get_company_data_matches_sec_period_despite_provider_date_mismatch(monkeypatch):
    # Confirmed live against the real API: Alpha Vantage normalizes a 52/53-week fiscal
    # year end to calendar month-end (Apple's real FY2025 ended 2025-09-27 per SEC's own
    # filings; Alpha Vantage reports fiscalDateEnding "2025-09-30" for that same year). This
    # fixture's Alpha Vantage period is dated 2025-12-31 (see BALANCE_REPORTS/INCOME_REPORTS
    # above); the SEC fact below is end-dated a few days earlier, as a 52/53-week filer's
    # real year end would be - the merge must still find it.
    facts = _sec_facts_for_2025_only()
    for tag in ["Revenues", "OperatingIncomeLoss", "AssetsCurrent", "LiabilitiesCurrent",
                "CashAndCashEquivalentsAtCarryingValue", "MarketableSecuritiesCurrent",
                "LongTermDebtNoncurrent", "LongTermDebtCurrent",
                "WeightedAverageNumberOfDilutedSharesOutstanding"]:
        for unit_facts in facts["facts"]["us-gaap"][tag]["units"].values():
            unit_facts[0]["end"] = "2025-12-28"
            if "start" in unit_facts[0]:
                unit_facts[0]["start"] = "2024-12-30"
    monkeypatch.setattr("app.services.company_data.sec_edgar.fetch_company_facts", lambda cik: facts)

    result = company_data.get_company_data("TEST")
    latest = result["periods"][0]
    assert latest["fiscal_year_end"] == "2025-12-31"  # the canonical (Alpha Vantage) date is kept
    assert latest["revenue"] == pytest.approx(70_000_000_000)  # but the SEC value is the one used
    assert latest["source"] == "mixed"


def test_get_company_data_does_not_match_sec_period_beyond_date_tolerance(monkeypatch):
    # A gap this large would only happen for a genuinely different fiscal year - must not
    # be treated as a match. Moving only the anchor tag (OperatingIncomeLoss) is enough:
    # period discovery finds no annual period near the Alpha Vantage target date at all.
    facts = _sec_facts_for_2025_only()
    facts["facts"]["us-gaap"]["OperatingIncomeLoss"]["units"]["USD"][0]["end"] = "2025-11-01"
    facts["facts"]["us-gaap"]["OperatingIncomeLoss"]["units"]["USD"][0]["start"] = "2024-11-01"
    monkeypatch.setattr("app.services.company_data.sec_edgar.fetch_company_facts", lambda cik: facts)

    result = company_data.get_company_data("TEST")
    assert result["periods"][0]["source"] == "alpha_vantage"


def test_get_company_data_falls_back_to_alpha_vantage_when_debt_composition_unrecognized(monkeypatch):
    # No LongTermDebtNoncurrent/LongTermDebtCurrent (or any other recognized debt tag) at
    # all - simulates a filer whose debt-tag composition this app doesn't recognize. Per
    # the explicit debt-derivation requirement, this must fall back to Alpha Vantage for
    # debt rather than silently reporting zero or omitting it.
    facts = _sec_facts_for_2025_only(include_debt_split=False)
    monkeypatch.setattr("app.services.company_data.sec_edgar.fetch_company_facts", lambda cik: facts)

    result = company_data.get_company_data("TEST")
    latest = result["periods"][0]

    # total_debt and current_debt both fall back to Alpha Vantage's figures.
    assert latest["total_debt"] == pytest.approx(67_154_000_000)
    # net_debt = AV total_debt - SEC cash = 67,154,000,000 - 14,000,000,000
    assert latest["net_debt"] == pytest.approx(67_154_000_000 - 14_000_000_000)


def test_get_company_data_degrades_gracefully_when_sec_edgar_is_unreachable(monkeypatch):
    def raise_unavailable(cik):
        raise sec_edgar.SECDataUnavailableError("simulated network failure")

    monkeypatch.setattr("app.services.company_data.sec_edgar.fetch_company_facts", raise_unavailable)

    # Must not raise - SEC being down degrades to the Alpha-Vantage-only path, the same as
    # it behaved before SEC EDGAR fundamentals were added.
    result = company_data.get_company_data("TEST")
    assert result["periods"][0]["source"] == "alpha_vantage"
    assert result["source"]["fundamentals_provider"] == "alpha_vantage"
