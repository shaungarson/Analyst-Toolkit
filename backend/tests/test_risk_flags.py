import pytest

from app.calculations.risk_flags import DSCR_REFERENCE_THRESHOLD, evaluate_risk_flags

# A scenario deliberately constructed to be clean on all three fronts: comfortable Year-1
# DSCR (low leverage), exit cap rate at or above going-in (no compression), and no
# sensitivity-grid cell dropping below a 1.0x equity multiple. Used as the baseline "nothing
# to flag" case - see test_evaluate_risk_flags_returns_empty_list_when_nothing_triggered.
SAFE_INPUTS = dict(
    purchase_price=1_000_000,
    going_in_noi=90_000,
    ltv=0.5,
    interest_rate=0.05,
    amortization_years=30,
    loan_maturity_years=10,
    hold_period_years=5,
    exit_cap_rate=0.09,
    noi_growth_rate=0.03,
    acquisition_cost_pct=0.01,
    disposition_cost_pct=0.01,
)


def _flag(flags, flag_id):
    return next((f for f in flags if f["id"] == flag_id), None)


def test_evaluate_risk_flags_returns_empty_list_when_nothing_triggered():
    assert evaluate_risk_flags(**SAFE_INPUTS) == []


def test_low_year1_dscr_flag_triggers_below_threshold():
    # 0% interest makes debt service exactly loan_amount / amortization_years, so DSCR is a
    # clean, hand-checkable number: loan = 1,000,000 * 0.65 = 650,000; debt service =
    # 650,000 / 13 = 50,000; DSCR = 55,000 / 50,000 = 1.10, below the 1.20 reference.
    # Exit cap rate is set equal to the going-in cap rate (5.5%) so cap-rate compression
    # doesn't also fire here - this test is about DSCR specifically.
    inputs = dict(
        purchase_price=1_000_000,
        going_in_noi=55_000,
        ltv=0.65,
        interest_rate=0.0,
        amortization_years=13,
        loan_maturity_years=13,
        hold_period_years=1,
        exit_cap_rate=0.055,
        noi_growth_rate=0.0,
        acquisition_cost_pct=0.0,
        disposition_cost_pct=0.0,
    )
    flag = _flag(evaluate_risk_flags(**inputs), "low_year1_dscr")
    assert flag is not None
    assert flag["observed_value"] == pytest.approx(1.10)
    assert flag["reference_value"] == pytest.approx(DSCR_REFERENCE_THRESHOLD)
    assert "1.10x" in flag["explanation"]
    assert "1.20x" in flag["explanation"]


def test_low_year1_dscr_flag_absent_at_reference_threshold():
    # Same clean 0%-interest construction as above, tuned so DSCR lands exactly on the
    # 1.20 reference (debt service = 60,000 / 1.20 = 50,000 -> amortization = 650,000 /
    # 50,000 = 13 years, going-in NOI = 60,000). The threshold is "below 1.20", so a DSCR of
    # exactly 1.20 must not trigger the flag.
    inputs = dict(
        purchase_price=1_000_000,
        going_in_noi=60_000,
        ltv=0.65,
        interest_rate=0.0,
        amortization_years=13,
        loan_maturity_years=13,
        hold_period_years=1,
        exit_cap_rate=0.06,
        noi_growth_rate=0.0,
        acquisition_cost_pct=0.0,
        disposition_cost_pct=0.0,
    )
    assert _flag(evaluate_risk_flags(**inputs), "low_year1_dscr") is None


def test_exit_cap_rate_compression_flag_triggers_when_exit_below_going_in():
    inputs = {**SAFE_INPUTS, "exit_cap_rate": 0.08}  # going-in cap rate is 9.0%
    flag = _flag(evaluate_risk_flags(**inputs), "exit_cap_rate_compression")
    assert flag is not None
    assert flag["observed_value"] == pytest.approx(0.08)
    assert flag["reference_value"] == pytest.approx(0.09)


def test_exit_cap_rate_compression_flag_absent_when_exit_equals_going_in():
    # SAFE_INPUTS sets exit_cap_rate == going_in_cap_rate (9.0% both) - equal is not "below",
    # so the flag must not fire.
    assert _flag(evaluate_risk_flags(**SAFE_INPUTS), "exit_cap_rate_compression") is None


def test_capital_loss_exposure_flag_triggers_with_expected_count_and_percentage():
    # Low leverage (so DSCR stays comfortably high, isolating this flag) but a thin 5%
    # going-in yield with a higher exit cap rate assumption (5.5%) - independently verified
    # (not just trusted from the code) that exactly 10 of the 25 grid cells fall below a
    # 1.0x equity multiple for this scenario.
    inputs = dict(
        purchase_price=1_000_000,
        going_in_noi=50_000,
        ltv=0.3,
        interest_rate=0.06,
        amortization_years=30,
        loan_maturity_years=10,
        hold_period_years=5,
        exit_cap_rate=0.055,
        noi_growth_rate=0.0,
        acquisition_cost_pct=0.02,
        disposition_cost_pct=0.02,
    )
    flags = evaluate_risk_flags(**inputs)
    assert _flag(flags, "low_year1_dscr") is None  # confirms this flag is isolated
    flag = _flag(flags, "capital_loss_exposure")
    assert flag is not None
    assert flag["observed_value"] == pytest.approx(40.0)
    assert flag["reference_value"] == pytest.approx(1.0)
    assert "10 of 25" in flag["explanation"]
    assert "40%" in flag["explanation"]


def test_capital_loss_exposure_flag_absent_when_no_cells_below_1x():
    assert _flag(evaluate_risk_flags(**SAFE_INPUTS), "capital_loss_exposure") is None
