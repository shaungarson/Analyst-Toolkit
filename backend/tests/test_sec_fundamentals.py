import pytest

from app.services import sec_fundamentals

# Fixture shapes mirror real SEC XBRL company-facts structure, confirmed against live data
# fetched for Apple, Caterpillar, and Walmart before writing this module - not guessed from
# documentation. Real, concrete findings each test below is anchored on:
#   - Caterpillar never adopted the ASC606 revenue tag and reports "Revenues" even in its
#     newest filings; this is why revenue needs a fallback chain, not just Apple's tag.
#   - Walmart's D&A tag changed from DepreciationDepletionAndAmortization to
#     DepreciationAmortizationAndAccretionNet starting FY2020 - a fallback chain that
#     stopped at the first tag would silently return no D&A for Walmart's 5 most recent
#     fiscal years.
#   - Apple's company facts contain a fact tagged fp="FY" whose duration is actually one
#     quarter (~90 days) - fp alone doesn't reliably identify an annual period.
#   - Walmart's February 2024 3-for-1 stock split means the as-originally-filed and later
#     restated share counts for the same fiscal year differ by exactly 3x - "most recently
#     filed wins" is required for a comparable, current figure, not just a tie-break.
#   - Apple has no ShortTermBorrowings tag at all (LongTermDebtNoncurrent +
#     LongTermDebtCurrent only); Caterpillar has no LongTermDebtCurrent tag at all
#     (LongTermDebtNoncurrent + ShortTermBorrowings only) - real, different, non-overlapping
#     debt compositions, not a hypothetical.


def _fact(val, end, start=None, fy=2025, fp="FY", accn="0001-25-000001", filed="2026-02-01", form="10-K"):
    fact = {"val": val, "end": end, "fy": fy, "fp": fp, "accn": accn, "filed": filed, "form": form}
    if start:
        fact["start"] = start
    return fact


def _facts(tags_to_facts, unit="USD"):
    """tags_to_facts: {tag_name: [fact, ...]}. Wraps into the real company-facts shape."""
    return {"facts": {"us-gaap": {tag: {"units": {unit: facts}} for tag, facts in tags_to_facts.items()}}}


ANNUAL = {"start": "2025-01-01"}  # a clean 364-day duration ending 2025-12-31


def test_revenue_falls_back_to_older_tag_when_modern_tag_absent():
    # Caterpillar's real pattern: no RevenueFromContractWithCustomerExcludingAssessedTax at
    # all, only Revenues - even in current-year filings.
    facts = _facts(
        {
            "OperatingIncomeLoss": [_fact(11_151_000_000, "2025-12-31", **ANNUAL)],
            "Revenues": [_fact(67_589_000_000, "2025-12-31", **ANNUAL)],
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["revenue"] == pytest.approx(67_589_000_000)
    assert periods[0]["provenance"]["revenue"]["components"][0]["tag"] == "Revenues"


def test_da_falls_back_through_tag_migrated_over_time():
    # Walmart's real pattern: DepreciationDepletionAndAmortization stops after FY2019;
    # DepreciationAmortizationAndAccretionNet is what actually covers FY2020 onward.
    facts = _facts(
        {
            "OperatingIncomeLoss": [_fact(29_825_000_000, "2025-12-31", **ANNUAL)],
            "DepreciationAmortizationAndAccretionNet": [_fact(14_203_000_000, "2025-12-31", **ANNUAL)],
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["depreciation_and_amortization"] == pytest.approx(14_203_000_000)


def test_missing_concept_is_none_not_zero_or_crash():
    facts = _facts({"OperatingIncomeLoss": [_fact(1_000_000_000, "2025-12-31", **ANNUAL)]})
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["revenue"] is None
    assert "revenue" not in periods[0]["provenance"]


def test_quarterly_stub_mislabeled_fy_is_excluded_by_duration():
    # Confirmed live in Apple's real data: a fact end-dated in FY2020 tagged fp="FY" whose
    # start date is only ~90 days before end (an actual Q4 figure, not the fiscal year).
    facts = _facts(
        {
            "OperatingIncomeLoss": [
                _fact(66_288_000_000, "2020-09-26", start="2019-09-29", fy=2020, fp="FY"),  # real annual fact
                _fact(20_000_000_000, "2020-09-26", start="2020-06-28", fy=2020, fp="FY"),  # mislabeled quarter
            ]
        }
    )
    period_ends = sec_fundamentals._annual_period_ends(facts["facts"]["us-gaap"], max_periods=5)
    assert period_ends == ["2020-09-26"]

    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["ebit"] == pytest.approx(66_288_000_000)


def test_most_recently_filed_duplicate_fact_wins():
    # Confirmed live: Walmart's Feb-2024 3-for-1 split means the same fiscal year's diluted
    # share count is reported two different ways depending on which 10-K you read - only
    # the later, restated, split-adjusted figure is comparable to a current share price.
    # Walmart's fiscal year runs Feb 1 - Jan 31; FY2023 ended 2023-01-31.
    facts = _facts(
        {"OperatingIncomeLoss": [_fact(1_000_000_000, "2023-01-31", start="2022-02-01", fy=2023)]}
    )
    facts["facts"]["us-gaap"]["WeightedAverageNumberOfDilutedSharesOutstanding"] = {
        "units": {
            "shares": [
                _fact(
                    2_734_000_000, "2023-01-31", start="2022-02-01", fy=2023, accn="0001-23-000020", filed="2023-03-17"
                ),
                _fact(
                    8_202_000_000, "2023-01-31", start="2022-02-01", fy=2024, accn="0001-24-000056", filed="2024-03-15"
                ),
            ]
        }
    }

    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["diluted_shares_outstanding"] == pytest.approx(8_202_000_000)


def test_wrong_unit_is_not_matched():
    facts = _facts({"OperatingIncomeLoss": [_fact(1_000_000_000, "2025-12-31", **ANNUAL)]})
    # Same tag, same period, but tagged under a currency this app doesn't expect.
    facts["facts"]["us-gaap"]["OperatingIncomeLoss"]["units"]["EUR"] = [
        _fact(999_000_000, "2025-12-31", **ANNUAL)
    ]
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["ebit"] == pytest.approx(1_000_000_000)


# --- cash (cash + short-term investments, matching this app's existing combined meaning) -


def test_cash_sums_split_cash_and_short_term_investments_without_double_counting():
    # Apple's real pattern: cash and short-term investments (marketable securities) are
    # reported as two separate line items that must both be counted.
    facts = _facts(
        {
            "OperatingIncomeLoss": [_fact(1, "2025-12-31", **ANNUAL)],
            "CashAndCashEquivalentsAtCarryingValue": [_fact(35_934_000_000, "2025-12-31")],
            "MarketableSecuritiesCurrent": [_fact(30_000_000_000, "2025-12-31")],
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["cash"] == pytest.approx(65_934_000_000)
    components = periods[0]["provenance"]["cash"]["components"]
    assert {c["tag"] for c in components} == {
        "CashAndCashEquivalentsAtCarryingValue",
        "MarketableSecuritiesCurrent",
    }
    assert periods[0]["provenance"]["cash"]["confidence"] == "calculated"


def test_cash_with_no_short_term_investments_reported_is_cash_alone():
    # Walmart's real pattern: no short-term-investments balance-sheet tag exists at all
    # (Walmart genuinely carries none), not a mapping gap.
    facts = _facts(
        {
            "OperatingIncomeLoss": [_fact(1, "2025-12-31", **ANNUAL)],
            "CashAndCashEquivalentsAtCarryingValue": [_fact(10_727_000_000, "2025-12-31")],
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["cash"] == pytest.approx(10_727_000_000)


def test_cash_falls_back_to_secs_own_combined_tag():
    # Caterpillar's real pre-2021 pattern: cash and short-term investments reported as one
    # already-combined SEC tag, not split. Must not be summed on top of anything else.
    facts = _facts(
        {
            "OperatingIncomeLoss": [_fact(1, "2020-12-31", start="2020-01-01", fy=2020)],
            "CashCashEquivalentsAndShortTermInvestments": [_fact(9_352_000_000, "2020-12-31")],
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["cash"] == pytest.approx(9_352_000_000)
    assert periods[0]["provenance"]["cash"]["confidence"] == "direct"


def test_cash_is_none_when_no_recognized_tag_is_present():
    facts = _facts({"OperatingIncomeLoss": [_fact(1, "2025-12-31", **ANNUAL)]})
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    assert periods[0]["values"]["cash"] is None


# --- debt (non-overlapping interest-bearing components, confidence-flagged) -------------


def test_debt_sums_split_current_and_noncurrent_components():
    # Apple's real composition: no ShortTermBorrowings tag exists at all.
    facts = _facts(
        {
            "OperatingIncomeLoss": [_fact(1, "2025-12-31", **ANNUAL)],
            "LongTermDebtNoncurrent": [_fact(78_328_000_000, "2025-12-31")],
            "LongTermDebtCurrent": [_fact(12_350_000_000, "2025-12-31")],
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    values = periods[0]["values"]
    assert values["total_debt"] == pytest.approx(90_678_000_000)
    assert values["current_debt"] == pytest.approx(12_350_000_000)


def test_debt_handles_composition_with_no_current_portion_tag():
    # Caterpillar's real composition: no LongTermDebtCurrent tag at all - current debt is
    # ShortTermBorrowings alone, not zero and not unmapped.
    facts = _facts(
        {
            "OperatingIncomeLoss": [_fact(1, "2025-12-31", **ANNUAL)],
            "LongTermDebtNoncurrent": [_fact(30_696_000_000, "2025-12-31")],
            "ShortTermBorrowings": [_fact(5_514_000_000, "2025-12-31")],
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    values = periods[0]["values"]
    assert values["total_debt"] == pytest.approx(36_210_000_000)
    assert values["current_debt"] == pytest.approx(5_514_000_000)


def test_debt_includes_finance_lease_liabilities_but_never_operating_lease():
    facts = _facts(
        {
            "OperatingIncomeLoss": [_fact(1, "2025-12-31", **ANNUAL)],
            "LongTermDebtNoncurrent": [_fact(33_401_000_000, "2025-12-31")],
            "LongTermDebtCurrent": [_fact(2_598_000_000, "2025-12-31")],
            "FinanceLeaseLiabilityNoncurrent": [_fact(5_923_000_000, "2025-12-31")],
            "FinanceLeaseLiabilityCurrent": [_fact(800_000_000, "2025-12-31")],
            # Present in the fixture to prove it is deliberately never touched.
            "OperatingLeaseLiabilityNoncurrent": [_fact(999_000_000_000, "2025-12-31")],
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    values = periods[0]["values"]
    assert values["total_debt"] == pytest.approx(33_401_000_000 + 2_598_000_000 + 5_923_000_000 + 800_000_000)
    assert values["current_debt"] == pytest.approx(2_598_000_000 + 800_000_000)


def test_debt_uses_combined_tag_only_when_no_split_tags_exist_and_current_debt_is_unknown():
    facts = _facts(
        {
            "OperatingIncomeLoss": [_fact(1, "2025-12-31", **ANNUAL)],
            "LongTermDebt": [_fact(50_000_000_000, "2025-12-31")],
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    values = periods[0]["values"]
    assert values["total_debt"] == pytest.approx(50_000_000_000)
    assert values["current_debt"] is None


def test_debt_is_fully_none_when_no_recognized_tag_at_all():
    facts = _facts({"OperatingIncomeLoss": [_fact(1, "2025-12-31", **ANNUAL)]})
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=5)
    values = periods[0]["values"]
    assert values["total_debt"] is None
    assert values["current_debt"] is None


# --- period discovery ---------------------------------------------------------------------


def test_extract_annual_periods_respects_max_periods_and_orders_most_recent_first():
    facts = _facts(
        {
            "OperatingIncomeLoss": [
                _fact(1, "2023-12-31", start="2023-01-01", fy=2023),
                _fact(2, "2024-12-31", start="2024-01-01", fy=2024),
                _fact(3, "2025-12-31", start="2025-01-01", fy=2025),
            ]
        }
    )
    periods = sec_fundamentals.extract_annual_periods(facts, max_periods=2)
    assert [p["fiscal_year_end"] for p in periods] == ["2025-12-31", "2024-12-31"]
