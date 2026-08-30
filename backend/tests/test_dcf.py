import pytest
from pydantic import ValidationError

from app.calculations.dcf import (
    NonFiniteResultError,
    dcf_sensitivity,
    discount_factor,
    gordon_growth_converges,
    present_value,
    project_fcf,
    run_dcf,
    terminal_value,
)
from app.schemas.dcf import DCFInputs

VALID_INPUTS = dict(
    base_year_fcf=100,
    fcf_growth_rate=0.05,
    forecast_years=5,
    wacc=0.10,
    terminal_growth_rate=0.02,
    net_debt=200,
    diluted_shares_outstanding=100,
)


def test_present_value_hand_computed():
    # 110 received in 1 year at a 10% discount rate is worth exactly 100 today.
    assert present_value(110, 0.10, 1) == pytest.approx(100)


def test_discount_factor_hand_computed():
    assert discount_factor(0.10, 1) == pytest.approx(1 / 1.10)


def test_project_fcf_flat_with_zero_growth():
    assert project_fcf(100, 0.0, 3) == [pytest.approx(100)] * 3


def test_project_fcf_with_growth_hand_computed():
    # 100 growing at 10%/yr for 3 years: 110, 121, 133.10
    result = project_fcf(100, 0.10, 3)
    assert result == pytest.approx([110, 121, 133.1])


def test_terminal_value_hand_computed():
    # Gordon growth: 100 * 1.02 / (0.10 - 0.02) = 102 / 0.08 = 1275
    assert terminal_value(100, wacc=0.10, terminal_growth_rate=0.02) == pytest.approx(1275)


def test_run_dcf_zero_growth_collapses_to_simple_perpetuity():
    # With 0% growth everywhere, a $100/yr cash flow discounted at 10% is just a
    # perpetuity: PV = CF / r = 100 / 0.10 = 1000, regardless of forecast length,
    # since forecasting it explicitly for 1 year and taking the rest as terminal
    # value should reproduce the same answer as the direct perpetuity formula.
    result = run_dcf(
        base_year_fcf=100,
        fcf_growth_rate=0.0,
        forecast_years=1,
        wacc=0.10,
        terminal_growth_rate=0.0,
        net_debt=200,
        diluted_shares_outstanding=100,
    )
    assert result["enterprise_value"] == pytest.approx(1000, abs=0.01)
    assert result["equity_value"] == pytest.approx(800, abs=0.01)
    assert result["value_per_share"] == pytest.approx(8.0, abs=0.001)


def test_wacc_must_exceed_terminal_growth_rate():
    with pytest.raises(ValidationError):
        DCFInputs(
            base_year_fcf=100,
            fcf_growth_rate=0.05,
            forecast_years=5,
            wacc=0.08,
            terminal_growth_rate=0.08,
            net_debt=0,
            diluted_shares_outstanding=10,
        )


def test_terminal_growth_rate_no_longer_capped_at_an_arbitrary_level():
    # The old 6% ceiling was an economic-judgment call (companies "can't" outgrow the
    # economy forever), not a mathematical requirement - removed in favor of Gordon
    # Growth's own convergence domain (see the tests below) plus analyst-facing warnings
    # instead of a hard block. 8% terminal growth under a 15% WACC must now validate.
    result = DCFInputs(
        base_year_fcf=100,
        fcf_growth_rate=0.05,
        forecast_years=5,
        wacc=0.15,
        terminal_growth_rate=0.08,
        net_debt=0,
        diluted_shares_outstanding=10,
    )
    assert result.terminal_growth_rate == 0.08


def test_gordon_growth_converges_hand_computed():
    # Comfortable base case.
    assert gordon_growth_converges(wacc=0.10, terminal_growth_rate=0.02) is True
    # Equal to WACC: ratio = 1.10 / 1.10 = 1.0, not < 1 in magnitude.
    assert gordon_growth_converges(wacc=0.10, terminal_growth_rate=0.10) is False
    # Deeply negative: ratio = (1 - 3.0) / 1.10 ~= -1.818, magnitude > 1 - the closed form
    # still returns a finite-looking number here, but it isn't the value of anything; g <
    # WACC alone (-3.0 < 0.10) is not sufficient, which is the mistake this function exists
    # to prevent from being reintroduced.
    assert gordon_growth_converges(wacc=0.10, terminal_growth_rate=-3.0) is False
    # Exactly at the lower convergence boundary -(2 + WACC): ratio = -1.10 / 1.10 = -1.0
    # exactly - excluded, matching the upper boundary's own exclusion at ratio = 1.0.
    assert gordon_growth_converges(wacc=0.10, terminal_growth_rate=-2.10) is False
    # Just inside that same boundary.
    assert gordon_growth_converges(wacc=0.10, terminal_growth_rate=-2.09) is True


def test_deeply_negative_terminal_growth_rejected_when_series_does_not_converge():
    # g < WACC alone is not sufficient for Gordon Growth to be valid - the underlying
    # geometric series also requires g > -(2 + WACC). At WACC=10%, that floor is -210%;
    # -300% sits outside it, even though -300% < 10% would pass a bare "g < WACC" check.
    with pytest.raises(ValidationError):
        DCFInputs(
            base_year_fcf=100,
            fcf_growth_rate=0.05,
            forecast_years=5,
            wacc=0.10,
            terminal_growth_rate=-3.0,
            net_debt=0,
            diluted_shares_outstanding=10,
        )


def test_deeply_negative_terminal_growth_accepted_within_convergence_domain():
    # -150% is far beyond the old (arbitrary) -5% floor, but still comfortably inside the
    # true convergence domain at WACC=10% (-210%), so it must validate rather than being
    # rejected by a leftover unit-confused floor.
    result = DCFInputs(
        base_year_fcf=100,
        fcf_growth_rate=0.05,
        forecast_years=5,
        wacc=0.10,
        terminal_growth_rate=-1.5,
        net_debt=0,
        diluted_shares_outstanding=10,
    )
    assert result.terminal_growth_rate == -1.5


def test_run_dcf_has_no_warnings_for_a_comfortable_base_case():
    result = run_dcf(**VALID_INPUTS)  # wacc=0.10, terminal_growth_rate=0.02: 8pp spread
    assert result["terminal_growth_warnings"] == []


def _warning(wacc, terminal_growth_rate, warning_id):
    result = run_dcf(
        base_year_fcf=100,
        fcf_growth_rate=0.05,
        forecast_years=5,
        wacc=wacc,
        terminal_growth_rate=terminal_growth_rate,
        net_debt=0,
        diluted_shares_outstanding=10,
    )
    return next(
        (w for w in result["terminal_growth_warnings"] if w["id"] == warning_id), None
    )


def test_narrow_spread_warning_tiers_hand_computed():
    warning_id = "narrow_wacc_terminal_growth_spread"
    assert _warning(0.10, 0.05, warning_id) is None  # 5pp spread - comfortable
    assert _warning(0.10, 0.075, warning_id)["tier"] == "caution"  # 2.5pp
    assert _warning(0.10, 0.085, warning_id)["tier"] == "high"  # 1.5pp
    assert _warning(0.10, 0.095, warning_id)["tier"] == "extreme"  # 0.5pp


def test_non_positive_terminal_cash_flow_warning_triggers_at_negative_100_percent():
    warning_id = "non_positive_terminal_cash_flow"
    assert _warning(0.10, -0.99, warning_id) is None
    assert _warning(0.10, -1.0, warning_id)["tier"] == "extreme"
    assert _warning(0.10, -1.5, warning_id)["tier"] == "extreme"


def test_project_fcf_below_negative_100_percent_alternates_sign_hand_computed():
    # -150% growth: (1 + -1.5) = -0.5, a negative base - each successive power flips sign
    # and grows in magnitude, rather than describing continued decline. 100 * -0.5 = -50;
    # -50 * -0.5 = 25; 25 * -0.5 = -12.5. This is the concrete math behind the warning below
    # -100% - the arithmetic itself stays well-defined, which is exactly why this is a
    # warning rather than a hard block (see CLAUDE.md Section 7).
    result = project_fcf(100, -1.5, 3)
    assert result == pytest.approx([-50, 25, -12.5])


def test_fcf_growth_rate_below_negative_100_percent_is_valid_not_rejected():
    # Computationally well-defined (proven above), so per CLAUDE.md Section 7 this is not
    # grounds for a hard block, even though the result is economically incoherent - that's
    # exactly what the warning below exists to flag instead.
    result = DCFInputs(**{**VALID_INPUTS, "fcf_growth_rate": -1.5})
    assert result.fcf_growth_rate == -1.5


def test_fcf_growth_rate_exactly_negative_100_percent_is_valid():
    # Coherent (if extreme) - every explicit year is a clean $0, not alternating - so this
    # stays valid, unlike anything strictly below it.
    result = DCFInputs(**{**VALID_INPUTS, "fcf_growth_rate": -1.0})
    assert result.fcf_growth_rate == -1.0


def test_fcf_growth_rate_no_longer_capped_at_an_old_arbitrary_upper_bound():
    # The old le=1 (100%) ceiling was an unexplained economic-judgment bound, same pattern
    # as terminal growth's old 6% cap. 5000% growth must now validate.
    result = DCFInputs(**{**VALID_INPUTS, "fcf_growth_rate": 50.0})
    assert result.fcf_growth_rate == 50.0


def test_run_dcf_at_exactly_negative_100_percent_growth_all_years_are_zero():
    result = run_dcf(**{**VALID_INPUTS, "fcf_growth_rate": -1.0})
    assert [year["fcf"] for year in result["forecast"]] == [0.0] * VALID_INPUTS["forecast_years"]


def test_fcf_growth_warnings_empty_for_a_comfortable_growth_rate():
    result = run_dcf(**VALID_INPUTS)  # fcf_growth_rate=0.05
    assert result["fcf_growth_warnings"] == []


def test_fcf_growth_warnings_present_at_exactly_negative_100_percent():
    result = run_dcf(**{**VALID_INPUTS, "fcf_growth_rate": -1.0})
    warnings = result["fcf_growth_warnings"]
    assert len(warnings) == 1
    assert warnings[0]["id"] == "zero_explicit_period_fcf"
    assert warnings[0]["tier"] == "extreme"
    assert "$0" in warnings[0]["explanation"]


def test_fcf_growth_warnings_present_below_negative_100_percent():
    result = run_dcf(**{**VALID_INPUTS, "fcf_growth_rate": -1.5})
    warnings = result["fcf_growth_warnings"]
    assert len(warnings) == 1
    assert warnings[0]["id"] == "alternating_sign_explicit_period_fcf"
    assert warnings[0]["tier"] == "extreme"
    assert "alternates between negative and positive" in warnings[0]["explanation"]


def test_run_dcf_raises_non_finite_result_error_on_extreme_growth_rate():
    # Growth rate alone, large enough that (1 + g) ** t overflows Python's float range
    # (verified empirically at ~3.5-4e20 for a 15-year forecast) - exercises project_fcf's
    # own try/except OverflowError path specifically.
    with pytest.raises(NonFiniteResultError):
        run_dcf(**{**VALID_INPUTS, "fcf_growth_rate": 1e21, "forecast_years": 15})


def test_run_dcf_raises_non_finite_result_error_on_extreme_base_year_fcf():
    # base_year_fcf alone, independent of growth rate - proves the safety check isn't
    # relying on a growth-rate-only ceiling. This path never raises OverflowError (no **
    # involved once base_year_fcf itself is the problem) - it's caught by the isfinite()
    # check on terminal_value instead, a genuinely different code path than the test above.
    with pytest.raises(NonFiniteResultError):
        run_dcf(**{**VALID_INPUTS, "base_year_fcf": 1e307, "forecast_years": 15})


def test_dcf_sensitivity_center_cell_matches_base_case_value_per_share_exactly():
    # Same principle as the real estate sensitivity grid: the center of the grid (delta
    # 0, 0) must reproduce the exact same value per share as calling run_dcf directly
    # with the base-case WACC and terminal growth rate.
    base_result = run_dcf(**VALID_INPUTS)
    sensitivity = dcf_sensitivity(**VALID_INPUTS)

    assert VALID_INPUTS["terminal_growth_rate"] in sensitivity["terminal_growth_rates"]
    center_col = sensitivity["terminal_growth_rates"].index(VALID_INPUTS["terminal_growth_rate"])

    center_row = next(
        row for row in sensitivity["rows"] if row["wacc"] == pytest.approx(VALID_INPUTS["wacc"])
    )
    assert center_row["value_per_share_by_growth"][center_col] == pytest.approx(
        base_result["value_per_share"]
    )


def test_dcf_sensitivity_invalid_wacc_growth_combinations_are_null_not_crashes():
    # A tight base-case spread (WACC 6.5%, terminal growth 5.5%) means some grid
    # combinations push WACC to or below terminal growth - those must come back as null,
    # not raise an exception or silently divide by zero/negative in the Gordon Growth
    # formula.
    sensitivity = dcf_sensitivity(
        **{**VALID_INPUTS, "wacc": 0.065, "terminal_growth_rate": 0.055}
    )
    growth_idx = sensitivity["terminal_growth_rates"].index(0.06)
    wacc_row = next(row for row in sensitivity["rows"] if row["wacc"] == pytest.approx(0.055))
    assert wacc_row["value_per_share_by_growth"][growth_idx] is None

    # But a comfortably wide combination in the same grid should still compute normally.
    wide_row = next(row for row in sensitivity["rows"] if row["wacc"] == pytest.approx(0.075))
    growth_low_idx = sensitivity["terminal_growth_rates"].index(0.045)
    assert wide_row["value_per_share_by_growth"][growth_low_idx] is not None


def test_dcf_sensitivity_nulls_cells_outside_convergence_domain_not_just_wacc_le_growth():
    # Base case sits just inside the lower convergence boundary at its own WACC (-2.09 vs a
    # floor of -2.10 at wacc=0.10), so the grid's low-WACC/most-negative-growth corner
    # crosses that boundary - a case the old "WACC <= growth" check would never catch, since
    # growth here is nowhere near WACC. Proves the grid's null-check uses the full
    # convergence domain, not just the upper bound.
    sensitivity = dcf_sensitivity(
        base_year_fcf=100,
        fcf_growth_rate=0.05,
        forecast_years=5,
        wacc=0.10,
        terminal_growth_rate=-2.09,
        net_debt=0,
        diluted_shares_outstanding=10,
    )
    growth_low_idx = sensitivity["terminal_growth_rates"].index(-2.1)
    low_wacc_row = next(row for row in sensitivity["rows"] if row["wacc"] == pytest.approx(0.09))
    assert low_wacc_row["value_per_share_by_growth"][growth_low_idx] is None

    # But the grid's least-negative growth value at its highest WACC is comfortably inside
    # the domain and must still compute normally.
    growth_high_idx = sensitivity["terminal_growth_rates"].index(-2.08)
    high_wacc_row = next(row for row in sensitivity["rows"] if row["wacc"] == pytest.approx(0.11))
    assert high_wacc_row["value_per_share_by_growth"][growth_high_idx] is not None


def test_dcf_sensitivity_grid_has_five_by_five_shape_in_the_typical_case():
    sensitivity = dcf_sensitivity(**VALID_INPUTS)
    assert len(sensitivity["rows"]) == 5
    assert len(sensitivity["terminal_growth_rates"]) == 5
    assert all(len(row["value_per_share_by_growth"]) == 5 for row in sensitivity["rows"])


def test_dcf_sensitivity_raises_when_the_base_case_itself_overflows():
    # If the analyst's own inputs can't be computed, the whole request must fail cleanly
    # rather than return an ostensibly-successful grid with its own center cell blank.
    with pytest.raises(NonFiniteResultError):
        dcf_sensitivity(**{**VALID_INPUTS, "base_year_fcf": 1e307, "forecast_years": 15})


def test_dcf_sensitivity_off_base_cell_overflow_becomes_null_not_a_crash():
    # Base case (2.1pp spread) stays finite; the grid's narrowest-spread corner (spread
    # shrunk by the full +/-1pp deltas to 0.1pp) pushes terminal value past the float
    # ceiling - numerically verified directly before writing this test. This is a genuinely
    # different null-cause than gordon_growth_converges (confirmed below), proving the new
    # overflow catch is a distinct code path, not a restatement of the existing one.
    base_year_fcf, wacc, tgr = 1e306, 0.041, 0.02
    assert gordon_growth_converges(wacc - 0.01, tgr + 0.01) is True  # mathematically valid

    sensitivity = dcf_sensitivity(
        base_year_fcf=base_year_fcf,
        fcf_growth_rate=0.05,
        forecast_years=5,
        wacc=wacc,
        terminal_growth_rate=tgr,
        net_debt=200,
        diluted_shares_outstanding=100,
    )
    narrow_row = next(row for row in sensitivity["rows"] if row["wacc"] == pytest.approx(0.031))
    narrow_col = sensitivity["terminal_growth_rates"].index(0.03)
    assert narrow_row["value_per_share_by_growth"][narrow_col] is None

    # The base (center) cell itself must still compute normally in the same response.
    base_row = next(row for row in sensitivity["rows"] if row["wacc"] == pytest.approx(wacc))
    base_col = sensitivity["terminal_growth_rates"].index(tgr)
    assert base_row["value_per_share_by_growth"][base_col] is not None
