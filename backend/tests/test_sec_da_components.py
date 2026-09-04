"""Regressions for D&A component summation and the verified-filer map that governs it.

Most filers report one combined cash-flow D&A tag. Four of the seventeen-ticker basket report
none at all - Microsoft, Alphabet, Tesla and Intel - and tag only components. Component summation
is available only to filers explicitly verified against their own filed statements and added to
_DA_COMPONENT_VERIFIED_FILERS by CIK; two of these four were, and two were examined and refused:

  INTC   both components tagged annually, every year; the sum IS the two lines on its filed cash
         flow statement, exact in all five years.
  MSFT   both components tagged annually, every year; its own line is an extension tag that also
         carries a non-D&A "other" bucket, so the sum sits a few percent either side of it.
  GOOGL  reports intangible amortization only on 10-Qs - never as an annual fact - while its
         10-Ks disclose accumulated amortization of finite-lived intangibles. It HAS amortization;
         it is simply unavailable annually. Depreciation alone matches its cash-flow depreciation
         line exactly and is still not its D&A. REFUSED.
  TSLA   tags intangible amortization in one of five years, and depreciation alone runs 18-35%
         below its own filed aggregate in every year - including that one year, at -32.6%. Its
         filing reports no material impairments, so the residual is amortization and other
         depreciation, not impairment. REFUSED.

Fixtures are focused slices of real company facts from data.sec.gov. No network access - live
verification against the provider is a separate, bounded, manual step.

Filed reference figures below were read off the filers' own cash flow statements across several
10-Ks, not computed from the data they are checking.
"""

import json
import pathlib

import pytest

from app.services import sec_fundamentals

FIXTURES = pathlib.Path(__file__).parent / "fixtures" / "sec"

# Filed cash-flow aggregates, per fiscal year end. Where a filer restated a year between filings
# the most recent figure is used - Microsoft restated FY2025 from 34,153 to 29,433, so its own
# aggregate is not even a fixed target.
FILED_AGGREGATE = {
    "intc": {"2025-12-27": 11_706, "2024-12-28": 11_379, "2023-12-30": 9_602,
             "2022-12-31": 13_035, "2021-12-25": 11_792},
    "msft": {"2026-06-30": 38_534, "2025-06-30": 29_433, "2024-06-30": 20_958,
             "2023-06-30": 13_861, "2022-06-30": 14_460},
    "tsla": {"2025-12-31": 6_148, "2024-12-31": 5_368, "2023-12-31": 4_667,
             "2022-12-31": 3_747, "2021-12-31": 2_911},
}


def facts(name):
    return json.loads((FIXTURES / f"{name}_facts.json").read_text(encoding="utf-8"))


def periods(name, max_periods=5):
    return sec_fundamentals.extract_annual_periods(facts(name), max_periods)


def da(period):
    return period["values"]["depreciation_and_amortization"]


def da_tags(period):
    prov = period["provenance"].get("depreciation_and_amortization")
    return [c["tag"] for c in prov["components"]] if prov else []


def raw_tags(name):
    return facts(name)["facts"]["us-gaap"].keys()


# --- the combined tag is preferred, and that is a correctness rule ------------------------

def test_a_combined_tag_wins_even_when_both_components_are_also_reported():
    """Amazon reports DepreciationDepletionAndAmortization *and* both components. Summing
    whenever components happen to be present would replace an exact reported figure with an
    approximation: Amazon's components come to roughly 65% of its own combined line, because
    that line includes D&A this module does not decompose."""
    latest = periods("amzn")[0]

    assert da(latest) == pytest.approx(65_756_000_000)
    assert da_tags(latest) == ["DepreciationDepletionAndAmortization"]
    assert latest["provenance"]["depreciation_and_amortization"]["confidence"] == "direct"


def test_components_are_present_in_the_control_fixture_so_the_preference_is_exercised():
    """Guards the test above from passing vacuously: if a future fixture trim dropped the
    component tags, "the combined tag was used" would prove nothing."""
    assert "Depreciation" in raw_tags("amzn")
    assert "AmortizationOfIntangibleAssets" in raw_tags("amzn")


# --- verified filers, checked against their filings in EVERY year ------------------------

def test_intel_reconstructs_its_filed_aggregate_exactly_in_every_year():
    """Intel's two components are literally the two D&A lines on its cash flow statement. Not
    just the latest year - checking only the latest year is what let an earlier version of this
    milestone ship an unsupported reconstruction."""
    for period in periods("intc"):
        filed = FILED_AGGREGATE["intc"][period["fiscal_year_end"]] * 1_000_000
        assert da(period) == pytest.approx(filed), period["fiscal_year_end"]
        assert da_tags(period) == ["Depreciation", "AmortizationOfIntangibleAssets"]


def test_microsoft_reconstructs_within_a_few_percent_in_every_year_and_not_in_one_direction():
    """Microsoft's own line is msft:DepreciationAmortizationAndOther, a company extension tag the
    companyfacts API never exposes, and its "and other" bucket is not D&A and can fall either
    way. The deviation is small but genuinely two-sided - it must not be described as
    conservative, which an earlier version of this milestone wrongly claimed."""
    deviations = []
    for period in periods("msft"):
        filed = FILED_AGGREGATE["msft"][period["fiscal_year_end"]] * 1_000_000
        assert da_tags(period) == ["Depreciation", "AmortizationOfIntangibleAssets"]
        deviations.append((da(period) - filed) / filed)

    assert all(abs(d) < 0.05 for d in deviations), deviations
    assert max(deviations) > 0 and min(deviations) < 0, (
        "deviation is two-sided; a one-sided assertion would re-encode the 'conservative' error"
    )


# --- filers examined and deliberately not verified ---------------------------------------------------------------

def test_alphabet_is_refused_because_its_amortization_is_unavailable_not_zero():
    """One of the two refusals this map records. Alphabet's depreciation-only figure matches its
    cash-flow depreciation line exactly, which is why it looked complete - but that line is not
    its D&A. Serving depreciation alone is arithmetically identical to asserting that Alphabet's
    intangible amortization is zero, which its own filings contradict."""
    for period in periods("googl"):
        assert da(period) is None, period["fiscal_year_end"]
        assert "depreciation_and_amortization" not in period["provenance"]
        # Specifically not the depreciation-only figure an earlier version returned.
        assert da(period) != 21_136_000_000


def test_alphabet_does_report_intangible_amortization_just_never_as_an_annual_fact():
    """The evidence behind the refusal: this is not a filer without the concept, it is a filer
    whose annual figure is unavailable. Real 10-Q facts and
    the 10-K accumulated-amortization disclosure are both carried in the fixture."""
    amortization = facts("googl")["facts"]["us-gaap"]["AmortizationOfIntangibleAssets"]
    forms = {f["form"] for f in amortization["units"]["USD"]}

    assert forms == {"10-Q"}, "if an annual fact ever appears, this refusal must be revisited"
    assert any(f["val"] > 0 for f in amortization["units"]["USD"])
    assert "FiniteLivedIntangibleAssetsAccumulatedAmortization" in raw_tags("googl")


def test_tesla_is_refused_in_every_year_including_the_one_it_tags_both_components():
    """The regression that prevents Tesla being presented as complete on insufficient evidence.

    Tesla is refused at the filer level: it is not in the verified map, so it never reaches the
    component path in any year. That matters most in FY2021, the one year it tags both
    components - a purely structural rule would have admitted exactly that year, and it is still
    32.6% below Tesla's own filed aggregate, because us-gaap:Depreciation is not even its whole
    depreciation."""
    for period in periods("tsla"):
        assert da(period) is None, period["fiscal_year_end"]
        assert "depreciation_and_amortization" not in period["provenance"]

    by_year = {p["fiscal_year_end"]: p for p in periods("tsla")}
    # The two specific wrong answers earlier versions produced.
    assert da(by_year["2025-12-31"]) != 5_030_000_000
    assert da(by_year["2021-12-31"]) != 1_961_000_000


def test_tesla_tags_both_components_in_exactly_one_year():
    """Guards the test above from passing for the wrong reason: Tesla must actually exhibit the
    sporadic pattern, otherwise it would prove nothing about structural rules being insufficient."""
    amortization_years = {
        p["fiscal_year_end"]
        for p in periods("tsla")
        if sec_fundamentals._select_component(
            facts("tsla")["facts"]["us-gaap"],
            sec_fundamentals._DA_COMPONENT_AMORTIZATION_TAGS,
            p["fiscal_year_end"], False, "USD",
        )
    }
    assert amortization_years == {"2021-12-31"}


def test_component_summation_is_restricted_to_explicitly_verified_filers():
    """The map itself, stated directly. Approval is by CIK, and by reconciliation against the
    filer's own statements - not by any structural property of its facts."""
    check = sec_fundamentals._da_component_summation_is_verified
    for name, expected in [("msft", True), ("intc", True), ("googl", False), ("tsla", False),
                           ("amzn", False)]:
        assert check(facts(name)) is expected, name


def test_an_unapproved_filer_is_refused_even_with_both_components_in_every_year():
    """The correction this map exists for. Structural evidence - both component tags, every
    year - is necessary but not sufficient, and an unknown filer cannot be reconciled after the
    app has already served its number. So it stays unmapped until someone checks it and adds it
    deliberately."""
    annual = {"fy": 2025, "fp": "FY", "form": "10-K", "accn": "0001-25-000001",
              "filed": "2026-02-01"}
    years = [("2025-01-01", "2025-12-31"), ("2024-01-01", "2024-12-31"),
             ("2023-01-01", "2023-12-31")]

    def facts_for(cik):
        def series(base):
            return [dict(annual, start=s, end=e, val=base + i * 10_000_000)
                    for i, (s, e) in enumerate(years)]
        return {
            "cik": cik,
            "facts": {"us-gaap": {
                "Revenues": {"units": {"USD": series(9_000_000_000)}},
                "Depreciation": {"units": {"USD": series(800_000_000)}},
                "AmortizationOfIntangibleAssets": {"units": {"USD": series(60_000_000)}},
            }},
        }

    unapproved = sec_fundamentals.extract_annual_periods(facts_for(1234567), max_periods=5)
    assert unapproved, "the filer must resolve to periods - only its D&A is withheld"
    for period in unapproved:
        assert da(period) is None, period["fiscal_year_end"]
        assert "depreciation_and_amortization" not in period["provenance"]

    # Same facts, an approved CIK: the difference is the approval, nothing structural.
    approved = sec_fundamentals.extract_annual_periods(facts_for(789019), max_periods=5)
    assert da(approved[0]) == pytest.approx(800_000_000 + 60_000_000)
    assert da_tags(approved[0]) == ["Depreciation", "AmortizationOfIntangibleAssets"]


def test_a_gap_in_the_extra_prior_balance_year_does_not_erase_the_displayed_years():
    """The caller requests one period more than it displays, purely to supply the prior-year
    balance sheet for a working-capital delta. D&A is never read from that extra year, so a
    missing component there must cost only that year - an earlier filer-level rule would have
    withheld D&A from all five displayed years instead."""
    company_facts = facts("msft")
    by_tag = company_facts["facts"]["us-gaap"]
    ends = sec_fundamentals._annual_period_ends(by_tag, 6)
    assert len(ends) == 6, "fixture must carry the extra prior-balance year for this to mean anything"

    oldest = ends[-1]
    amortization = by_tag["AmortizationOfIntangibleAssets"]["units"]["USD"]
    by_tag["AmortizationOfIntangibleAssets"]["units"]["USD"] = [
        f for f in amortization if f["end"] != oldest
    ]

    result = sec_fundamentals.extract_annual_periods(company_facts, max_periods=6)

    for period in result[:5]:
        assert da(period) is not None, period["fiscal_year_end"]
        assert da_tags(period) == ["Depreciation", "AmortizationOfIntangibleAssets"]
    assert da(result[5]) is None
    assert result[5]["fiscal_year_end"] == oldest


# --- completeness: a missing component is never a zero -------------------------------------

def test_a_missing_component_yields_no_value_rather_than_a_zero_addback():
    """Synthetic. Either component missing must produce None: emitting the other one alone is
    arithmetically the same as asserting the missing one is zero, while looking like an ordinary
    reported figure."""
    annual = {
        "start": "2025-01-01", "end": "2025-12-31", "fy": 2025, "fp": "FY",
        "form": "10-K", "accn": "0001-25-000001", "filed": "2026-02-01",
    }
    for present, value in [("AmortizationOfIntangibleAssets", 40_000_000),
                           ("Depreciation", 900_000_000)]:
        company_facts = {
            "facts": {
                "us-gaap": {
                    "Revenues": {"units": {"USD": [dict(annual, val=1_000_000_000)]}},
                    present: {"units": {"USD": [dict(annual, val=value)]}},
                }
            }
        }
        latest = sec_fundamentals.extract_annual_periods(company_facts, max_periods=5)[0]

        assert latest["values"]["depreciation_and_amortization"] is None, present
        assert "depreciation_and_amortization" not in latest["provenance"]


# --- false positives: why the component list is explicit and not a name pattern -------------

def test_finance_lease_amortization_is_never_summed_into_da():
    """The decisive exclusion. It is real amortization, but Microsoft's two components already
    sit within ~1% of its filed line - adding its 5,403 of finance-lease amortization would
    overshoot by 15%."""
    assert "FinanceLeaseRightOfUseAssetAmortization" in raw_tags("msft")
    for period in periods("msft"):
        assert "FinanceLeaseRightOfUseAssetAmortization" not in da_tags(period)


def test_an_oci_pension_movement_matching_the_word_unamortized_is_not_da():
    """Intel reports OtherComprehensiveIncomeDefinedBenefitPlansNetUnamortizedGainLossArising
    DuringPeriodNetOfTax every year. It matches an /amorti/ pattern and is not an expense at
    all, let alone D&A - and Intel is a filer the gate admits, so a pattern-based chain would
    have corrupted a figure that is otherwise exact."""
    oci = (
        "OtherComprehensiveIncomeDefinedBenefitPlansNetUnamortizedGainLoss"
        "ArisingDuringPeriodNetOfTax"
    )
    assert oci in raw_tags("intc")
    for period in periods("intc"):
        assert oci not in da_tags(period)


def test_financing_cost_amortization_is_not_a_component_slot():
    """Tesla reports AmortizationOfFinancingCosts. Tesla is refused outright now, so this pins
    the exclusion at the slot definition rather than relying on that refusal."""
    assert "AmortizationOfFinancingCosts" in raw_tags("tsla")
    slots = (
        sec_fundamentals._DA_COMPONENT_DEPRECIATION_TAGS
        + sec_fundamentals._DA_COMPONENT_AMORTIZATION_TAGS
    )
    for excluded in ("AmortizationOfFinancingCosts", "FinanceLeaseRightOfUseAssetAmortization",
                     "DepreciationNonproduction"):
        assert excluded not in slots


def test_admitted_filers_use_only_the_two_reviewed_slots():
    """One assertion over both admitted filers: whatever else they tag, D&A is built from the
    explicit slot list and nothing else."""
    allowed = set(sec_fundamentals._DA_COMPONENT_DEPRECIATION_TAGS) | set(
        sec_fundamentals._DA_COMPONENT_AMORTIZATION_TAGS
    )
    for name in ("msft", "intc"):
        for period in periods(name):
            assert set(da_tags(period)) == allowed, f"{name} {period['fiscal_year_end']}"
