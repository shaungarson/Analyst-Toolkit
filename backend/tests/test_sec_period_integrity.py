"""Regressions for the SEC period-discovery data-integrity milestone.

Every fixture under tests/fixtures/sec is a focused slice of real company facts from
data.sec.gov - annual 10-K facts only, capped per tag, and only the tags each behaviour needs.
Real values, so a test that passes here is a statement about how the app handles the actual
filings; small, so testing four behaviours does not put ~65 MB of third-party data in the repo.

No network access: these run in ordinary CI. Live verification against the provider is a
separate, bounded, manual step - never a CI test.
"""

import datetime
import json
import pathlib

import pytest

from app.services import sec_fundamentals

FIXTURES = pathlib.Path(__file__).parent / "fixtures" / "sec"


def facts(name):
    return json.loads((FIXTURES / f"{name}_facts.json").read_text(encoding="utf-8"))


def periods(name, max_periods=5):
    return sec_fundamentals.extract_annual_periods(facts(name), max_periods)


def days_between(a, b):
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


# --- silent staleness: the milestone's priority defect ------------------------------------

def test_a_tag_that_stops_being_reported_cannot_rewind_a_company_by_a_decade():
    """Johnson & Johnson stopped tagging OperatingIncomeLoss after FY2014 while continuing to
    report revenue. Anchoring discovery on that one tag made the app serve FY2014 financials as
    J&J's latest period - with "reported" provenance and no warning - so every derived figure
    came from eleven-year-old data. The union anchor finds the real recent years instead."""
    result = periods("jnj")

    assert result, "J&J must resolve to periods, not to nothing"
    assert result[0]["fiscal_year_end"] == "2025-12-28"
    # The specific wrong answer this defect produced.
    assert all(p["fiscal_year_end"] != "2014-12-28" for p in result)


def test_returned_periods_are_a_contiguous_run_of_fiscal_years():
    """The backstop, independent of which tag anchors discovery. The property is contiguity, not
    distance from the newest year: legitimate history is several years deep and each year is
    about twelve months older than the last, so a decade-wide step between adjacent periods is
    the signal that the older side belongs to a tag that stopped being reported.

    J&J is exactly that case - revenue runs to FY2025, operating income stops at FY2014 - so the
    union anchor surfaces both and this guard has to cut the join between them."""
    result = periods("jnj")
    ends = [p["fiscal_year_end"] for p in result]

    assert len(ends) > 1, "the contiguity rule is only meaningful across several periods"
    for older, newer in zip(ends[1:], ends[:-1]):
        assert days_between(older, newer) <= sec_fundamentals._MAX_PERIOD_STALENESS_DAYS
    # And the FY2014 tail specifically is gone.
    assert min(ends) >= "2020-01-01"


def test_a_field_absent_from_current_years_is_reported_absent_not_backfilled_from_an_old_one():
    """The honest outcome the fix produces: J&J's recent years genuinely have no operating
    income, so ebit is None. Refusing is correct; quietly substituting FY2014's figure was not."""
    latest = periods("jnj")[0]

    assert latest["values"]["ebit"] is None
    assert "ebit" not in latest["provenance"]


def test_stale_candidates_are_dropped_even_when_they_are_the_only_anchor_available():
    """Synthetic, because no filer in the basket does this: if every anchor tag is stale, the
    result is no periods - which the caller handles as "SEC could not map this filer" - rather
    than a confident-looking set of decade-old figures."""
    stale = {
        "facts": {
            "us-gaap": {
                "OperatingIncomeLoss": {
                    "units": {
                        "USD": [
                            {"form": "10-K", "start": "2014-01-01", "end": "2014-12-31", "val": 1.0}
                        ]
                    }
                },
                "NetIncomeLoss": {
                    "units": {
                        "USD": [
                            {"form": "10-K", "start": "2025-01-01", "end": "2025-12-31", "val": 2.0}
                        ]
                    }
                },
            }
        }
    }
    assert sec_fundamentals.extract_annual_periods(stale, 5) == []


def test_an_ordinary_filer_keeps_every_period_it_reports():
    """The guard must not trim a normal company. Costco's five most recent years are all
    current relative to each other."""
    result = periods("cost")
    assert len(result) == 4
    assert result[0]["fiscal_year_end"] == "2025-08-31"


# --- CapEx fallback ------------------------------------------------------------------------

def test_capex_resolves_through_the_productive_assets_tag():
    """PepsiCo reports no PaymentsToAcquirePropertyPlantAndEquipment fact at all - the tag is
    absent from its facts entirely - and reports PaymentsToAcquireProductiveAssets for every
    annual period. Six of the seventeen-ticker basket behave this way."""
    latest = periods("pep")[0]

    assert latest["values"]["capital_expenditures"] is not None
    tags = [c["tag"] for c in latest["provenance"]["capital_expenditures"]["components"]]
    assert tags == ["PaymentsToAcquireProductiveAssets"]


def test_the_original_capex_tag_still_wins_where_a_filer_reports_it():
    """Costco is the control: adding a fallback must not change a filer the first tag covers."""
    latest = periods("cost")[0]

    assert latest["values"]["capital_expenditures"] is not None
    tags = [c["tag"] for c in latest["provenance"]["capital_expenditures"]["components"]]
    assert tags == ["PaymentsToAcquirePropertyPlantAndEquipment"]


def test_pepsico_resolves_its_periods_without_a_mapped_revenue_tag():
    """The union anchor from the other direction: PepsiCo reports no mapped revenue tag in this
    slice, so EBIT alone has to carry period discovery."""
    result = periods("pep")
    assert result[0]["fiscal_year_end"] == "2025-12-27"


# --- documented scope boundary --------------------------------------------------------------

def test_ford_current_debt_stays_unmapped_and_is_not_guessed_at():
    """Deliberately out of scope, and pinned so the limitation is a tested fact rather than only
    a note. Ford reports no undifferentiated current-debt line annually - its debt sits in
    segment-dimensioned facts (Automotive vs Ford Credit) that this module does not read - so
    net working capital stays undefined. Adding a tag would not fix it, and treating the absence
    as zero would silently misstate NWC."""
    latest = periods("f")[0]

    assert latest["values"]["current_debt"] is None
    assert latest["values"]["total_debt"] is None


@pytest.mark.parametrize("name", ["jnj", "pep", "cost", "f"])
def test_every_fixture_resolves_to_current_periods(name):
    result = periods(name)
    assert result, f"{name} must resolve to at least one period"
    assert result[0]["fiscal_year_end"] >= "2025-01-01"
