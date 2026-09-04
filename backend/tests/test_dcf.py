import pytest
from pydantic import ValidationError

from app.calculations import dcf
from app.calculations.dcf import (
    NonFiniteResultError,
    _bracket,
    _compute_dcf,
    _compute_dcf_core,
    dcf_sensitivity,
    discount_factor,
    _shift_driver,
    driver_dcf_sensitivity,
    driver_dcf_tornado,
    _growth_margin_shift,
    driver_growth_margin_sensitivity,
    GROWTH_MARGIN_DELTAS,
    new_endpoint_warnings,
    driver_warnings,
    gordon_growth_converges,
    implied_fcf_growth_rate,
    present_value,
    project_driver_years,
    project_fcf,
    run_dcf,
    run_driver_dcf,
    terminal_value,
)
from app.schemas.dcf import DCFInputs, DriverDCFInputs, ReverseDCFInputs

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


# --- Shared unrounded core -----------------------------------------------------------


def test_compute_dcf_agrees_with_run_dcf_before_rounding():
    # run_dcf's rounded value_per_share and _compute_dcf's raw one must agree to 2dp -
    # they're the same computation now, just one wraps the other with rounding.
    forward = run_dcf(**VALID_INPUTS)
    core = _compute_dcf(**VALID_INPUTS)
    assert core["value_per_share"] == pytest.approx(forward["value_per_share"], abs=0.005)


# --- Reverse DCF: implied_fcf_growth_rate ---------------------------------------------


def test_implied_growth_recovers_known_positive_rate_from_unrounded_target():
    # The target is generated from _compute_dcf directly (not run_dcf's rounded public
    # value) so this isolates the solver's own numerical correctness from any rounding.
    known_rate = 0.08
    target = _compute_dcf(**{**VALID_INPUTS, "fcf_growth_rate": known_rate})["value_per_share"]
    result = implied_fcf_growth_rate(
        target_price=target,
        base_year_fcf=VALID_INPUTS["base_year_fcf"],
        forecast_years=VALID_INPUTS["forecast_years"],
        wacc=VALID_INPUTS["wacc"],
        terminal_growth_rate=VALID_INPUTS["terminal_growth_rate"],
        net_debt=VALID_INPUTS["net_debt"],
        diluted_shares_outstanding=VALID_INPUTS["diluted_shares_outstanding"],
    )
    assert result["status"] == "solved"
    assert result["implied_fcf_growth_rate"] == pytest.approx(known_rate, abs=1e-4)


def test_implied_growth_recovers_known_negative_rate():
    # Covers requirement that a target below the zero-growth valuation is still solvable
    # through negative explicit-period growth, not just positive rates.
    known_rate = -0.05
    target = _compute_dcf(**{**VALID_INPUTS, "fcf_growth_rate": known_rate})["value_per_share"]
    result = implied_fcf_growth_rate(
        target_price=target,
        base_year_fcf=VALID_INPUTS["base_year_fcf"],
        forecast_years=VALID_INPUTS["forecast_years"],
        wacc=VALID_INPUTS["wacc"],
        terminal_growth_rate=VALID_INPUTS["terminal_growth_rate"],
        net_debt=VALID_INPUTS["net_debt"],
        diluted_shares_outstanding=VALID_INPUTS["diluted_shares_outstanding"],
    )
    assert result["status"] == "solved"
    assert result["implied_fcf_growth_rate"] == pytest.approx(known_rate, abs=1e-4)


def test_implied_growth_reconciles_a_realistic_rounded_reference_price():
    # Integration-style: a human types in a plain, already-rounded reference price (what
    # actually happens in the app), not the solver's own exact unrounded output. Confirms
    # the solve still lands within PRICE_TOLERANCE of a target that was never meant to be
    # exactly reachable to arbitrary precision.
    forward = run_dcf(**{**VALID_INPUTS, "fcf_growth_rate": 0.08})
    target = forward["value_per_share"]  # e.g. 395.69 - already rounded to the cent
    result = implied_fcf_growth_rate(
        target_price=target,
        base_year_fcf=VALID_INPUTS["base_year_fcf"],
        forecast_years=VALID_INPUTS["forecast_years"],
        wacc=VALID_INPUTS["wacc"],
        terminal_growth_rate=VALID_INPUTS["terminal_growth_rate"],
        net_debt=VALID_INPUTS["net_debt"],
        diluted_shares_outstanding=VALID_INPUTS["diluted_shares_outstanding"],
    )
    assert result["status"] == "solved"
    assert result["reconciled_value_per_share"] == pytest.approx(target, abs=0.005)


def test_implied_growth_target_below_floor_is_not_a_search_failure():
    # A large net cash position (negative net_debt) makes the floor -net_debt/shares a
    # positive number a modest target price can genuinely fall below - a closed-form fact
    # about these inputs, detected before any bisection is attempted.
    result = implied_fcf_growth_rate(
        target_price=500,
        base_year_fcf=100,
        forecast_years=5,
        wacc=0.10,
        terminal_growth_rate=0.02,
        net_debt=-100_000,
        diluted_shares_outstanding=100,
    )
    assert result["status"] == "target_below_floor"
    assert result["implied_fcf_growth_rate"] is None
    assert result["floor_value_per_share"] == pytest.approx(1000)


def test_implied_growth_target_at_floor_exactly_is_below_floor_not_solved():
    # The floor is a limit as g -> -1+, never attained - a target exactly at it must be
    # treated the same as one below it, not as a solvable edge case.
    floor = 100_000 / 100
    result = implied_fcf_growth_rate(
        target_price=floor,
        base_year_fcf=100,
        forecast_years=5,
        wacc=0.10,
        terminal_growth_rate=0.02,
        net_debt=-100_000,
        diluted_shares_outstanding=100,
    )
    assert result["status"] == "target_below_floor"


def test_implied_growth_not_bracketed_on_genuine_overflow():
    # A target so far beyond what's reachable that bracket expansion overflows float64
    # before finding an upper bound - a real computational limit, verified empirically
    # (1e290/1e300 both solve; 1e305 genuinely overflows at forecast_years=15).
    result = implied_fcf_growth_rate(
        target_price=1e305,
        base_year_fcf=100,
        forecast_years=15,
        wacc=0.10,
        terminal_growth_rate=0.02,
        net_debt=0,
        diluted_shares_outstanding=100,
    )
    assert result["status"] == "not_bracketed"
    assert result["implied_fcf_growth_rate"] is None
    # Still an honest, distinct status from target_below_floor - the floor is finite here.
    assert result["floor_value_per_share"] == pytest.approx(0)


def test_bracket_returns_none_when_step_cap_reached_without_overflow():
    # Directly exercises _bracket's own termination guarantee with a synthetic function
    # that never overflows, isolating the step-cap mechanism from float64's overflow
    # threshold (which the test above already covers separately). A target this far out
    # needs ~336 doublings from 0.05 to reach - past the 200-step cap - so this must
    # terminate via the cap, not by actually bracketing.
    result = _bracket(lambda g: g, f0=0.0, target_price=10**100)
    assert result is None


def test_implied_growth_rejects_non_convergent_wacc_terminal_growth_via_schema():
    with pytest.raises(ValidationError, match="WACC must be greater than"):
        ReverseDCFInputs(
            target_price=100,
            base_year_fcf=100,
            forecast_years=5,
            wacc=0.05,
            terminal_growth_rate=0.05,
            net_debt=200,
            diluted_shares_outstanding=100,
        )


def test_implied_growth_bisection_exhaustion_returns_not_bracketed_not_fabricated(monkeypatch):
    # MAX_BISECTION_STEPS forced down to 1 so the loop runs out without ever getting within
    # PRICE_TOLERANCE of the target - the bracket itself still forms fine (target=500 is
    # comfortably reachable), isolating bisection exhaustion from a bracketing failure. A
    # single midpoint (g=0.025, reconciling to ~$11.02) is nowhere near the $500 target -
    # confirmed directly against the unpatched loop before this fix existed, which fell
    # through to "solved" with exactly that unconverged midpoint. The fix must return
    # not_bracketed instead of fabricating a "solved" result out of a midpoint that was
    # never actually within tolerance.
    monkeypatch.setattr(dcf, "MAX_BISECTION_STEPS", 1)
    result = implied_fcf_growth_rate(
        target_price=500,
        base_year_fcf=100_000_000,
        forecast_years=5,
        wacc=0.10,
        terminal_growth_rate=0.02,
        net_debt=200_000_000,
        diluted_shares_outstanding=100_000_000,
    )
    assert result["status"] == "not_bracketed"
    assert result["implied_fcf_growth_rate"] is None
    assert result["reconciled_value_per_share"] is None


def test_implied_growth_solved_result_never_has_fcf_growth_warnings_field():
    # The domain g > -1 makes a solved rate at or below -100% mathematically impossible -
    # this isn't a restriction newly imposed on the solver, it's a fact about where a
    # unique root can exist at all (see implied_fcf_growth_rate's own docstring). The
    # response has no fcf_growth_warnings field at all, unlike DCFResults - there is
    # nothing in that domain for such a warning to ever describe.
    result = implied_fcf_growth_rate(
        target_price=1,
        base_year_fcf=100,
        forecast_years=5,
        wacc=0.10,
        terminal_growth_rate=0.02,
        net_debt=0,
        diluted_shares_outstanding=100,
    )
    assert "fcf_growth_warnings" not in result


# --- Driver-Based DCF -------------------------------------------------------------------

# Hand-calculated fixture (see the design report): a toy 3-year schedule with round inputs,
# computed independently outside the app before this code existed, then locked in here.
DRIVER_YEARS = [
    dict(
        revenue_growth_rate=0.10,
        ebit_margin=0.20,
        tax_rate=0.25,
        da_pct_of_revenue=0.04,
        capex_pct_of_revenue=0.05,
        nwc_investment_pct_of_revenue_change=0.10,
    ),
    dict(
        revenue_growth_rate=0.08,
        ebit_margin=0.20,
        tax_rate=0.25,
        da_pct_of_revenue=0.04,
        capex_pct_of_revenue=0.05,
        nwc_investment_pct_of_revenue_change=0.10,
    ),
    dict(
        revenue_growth_rate=0.06,
        ebit_margin=0.20,
        tax_rate=0.25,
        da_pct_of_revenue=0.04,
        capex_pct_of_revenue=0.05,
        nwc_investment_pct_of_revenue_change=0.10,
    ),
]
DRIVER_VALID_INPUTS = dict(
    base_year_revenue=1000,
    driver_years=DRIVER_YEARS,
    wacc=0.09,
    terminal_growth_rate=0.025,
    net_debt=200,
    diluted_shares_outstanding=100,
)


def test_project_driver_years_matches_hand_calculated_fixture():
    rows = project_driver_years(1000, DRIVER_YEARS)
    assert [r["revenue"] for r in rows] == pytest.approx([1100.00, 1188.00, 1259.28])
    assert [r["ebit"] for r in rows] == pytest.approx([220.00, 237.60, 251.856])
    assert [r["cash_taxes"] for r in rows] == pytest.approx([55.00, 59.40, 62.964])
    assert [r["nopat"] for r in rows] == pytest.approx([165.00, 178.20, 188.892])
    assert [r["da"] for r in rows] == pytest.approx([44.00, 47.52, 50.3712])
    assert [r["capex"] for r in rows] == pytest.approx([55.00, 59.40, 62.964])
    assert [r["delta_nwc"] for r in rows] == pytest.approx([10.00, 8.80, 7.128])
    assert [r["fcf"] for r in rows] == pytest.approx([144.00, 157.52, 169.1712])


def test_run_driver_dcf_matches_hand_calculated_fixture_to_the_cent():
    result = run_driver_dcf(**DRIVER_VALID_INPUTS)
    assert result["enterprise_value"] == pytest.approx(2455.28, abs=0.01)
    assert result["equity_value"] == pytest.approx(2255.28, abs=0.01)
    assert result["value_per_share"] == pytest.approx(22.55, abs=0.01)
    assert [year["fcf"] for year in result["forecast"]] == pytest.approx(
        [144.00, 157.52, 169.1712], abs=0.01
    )
    assert result["driver_warnings"] == []


def test_run_driver_dcf_forecast_rows_carry_every_intermediate_field():
    result = run_driver_dcf(**DRIVER_VALID_INPUTS)
    first_year = result["forecast"][0]
    assert first_year["year"] == 1
    assert first_year["revenue"] == pytest.approx(1100.00, abs=0.01)
    assert first_year["ebit"] == pytest.approx(220.00, abs=0.01)
    assert first_year["cash_taxes"] == pytest.approx(55.00, abs=0.01)
    assert first_year["nopat"] == pytest.approx(165.00, abs=0.01)
    assert first_year["da"] == pytest.approx(44.00, abs=0.01)
    assert first_year["capex"] == pytest.approx(55.00, abs=0.01)
    assert first_year["delta_nwc"] == pytest.approx(10.00, abs=0.01)
    assert first_year["fcf"] == pytest.approx(144.00, abs=0.01)
    assert 0 < first_year["discount_factor"] < 1
    assert first_year["present_value"] == pytest.approx(132.11, abs=0.01)


def test_compute_dcf_core_and_compute_driver_dcf_share_the_same_valuation_math():
    # Same shared-engine guarantee dcf_sensitivity's center-cell test proves for Quick DCF:
    # if project_driver_years produces the same fcfs Quick's flat growth would (here, by
    # construction: 0% growth/margin/tax/da/capex/nwc means every driver year's fcf is 0),
    # _compute_dcf_core must value that schedule identically regardless of which mode built
    # it - there is exactly one place valuation math is implemented, not two.
    zero_years = [
        dict(
            revenue_growth_rate=0.0,
            ebit_margin=0.0,
            tax_rate=0.0,
            da_pct_of_revenue=0.0,
            capex_pct_of_revenue=0.0,
            nwc_investment_pct_of_revenue_change=0.0,
        )
        for _ in range(3)
    ]
    from app.calculations.dcf import _compute_driver_dcf

    _, driver_core = _compute_driver_dcf(1000, zero_years, 0.09, 0.025, 200, 100)
    direct_core = _compute_dcf_core([0.0, 0.0, 0.0], 0.09, 0.025, 200, 100)
    assert driver_core["value_per_share"] == pytest.approx(direct_core["value_per_share"])


# --- Negative-EBIT year under the no-NOL cash-tax convention ----------------------------


def test_negative_ebit_year_pays_zero_cash_tax_and_earns_no_benefit():
    loss_year = dict(
        revenue_growth_rate=0.0,
        ebit_margin=-0.50,  # deeply unprofitable
        tax_rate=0.25,
        da_pct_of_revenue=0.04,
        capex_pct_of_revenue=0.05,
        nwc_investment_pct_of_revenue_change=0.0,
    )
    rows = project_driver_years(1000, [loss_year])
    row = rows[0]
    assert row["ebit"] == pytest.approx(-500.0)
    # No NOL carryforward: a loss pays zero cash tax, not a negative "tax benefit".
    assert row["cash_taxes"] == pytest.approx(0.0)
    assert row["nopat"] == pytest.approx(row["ebit"])  # untouched by tax when EBIT <= 0


def test_negative_ebit_year_still_resolves_to_a_finite_valuation():
    result = run_driver_dcf(
        base_year_revenue=1000,
        driver_years=[
            dict(
                revenue_growth_rate=0.05,
                ebit_margin=-0.10,
                tax_rate=0.25,
                da_pct_of_revenue=0.04,
                capex_pct_of_revenue=0.05,
                nwc_investment_pct_of_revenue_change=0.05,
            ),
            dict(
                revenue_growth_rate=0.05,
                ebit_margin=0.15,
                tax_rate=0.25,
                da_pct_of_revenue=0.04,
                capex_pct_of_revenue=0.05,
                nwc_investment_pct_of_revenue_change=0.05,
            ),
        ],
        wacc=0.09,
        terminal_growth_rate=0.025,
        net_debt=200,
        diluted_shares_outstanding=100,
    )
    assert isinstance(result["value_per_share"], float)


# --- Non-finite intermediate driver calculations -----------------------------------------


def test_run_driver_dcf_raises_non_finite_result_error_on_extreme_base_year_revenue():
    # 1.7e308 * 1.10 (year 1's growth) exceeds float64's ~1.7977e308 ceiling and overflows
    # to inf via plain multiplication (no ** involved, unlike project_fcf's OverflowError
    # path) - exercises _compute_driver_dcf's per-row _require_finite("revenue", ...) check.
    with pytest.raises(NonFiniteResultError):
        run_driver_dcf(
            base_year_revenue=1.7e308,
            driver_years=DRIVER_YEARS,
            wacc=0.09,
            terminal_growth_rate=0.025,
            net_debt=200,
            diluted_shares_outstanding=100,
        )


def test_run_driver_dcf_raises_non_finite_result_error_on_extreme_growth_compounding():
    extreme_years = [{**DRIVER_YEARS[0], "revenue_growth_rate": 1e100} for _ in range(15)]
    with pytest.raises(NonFiniteResultError):
        run_driver_dcf(
            base_year_revenue=1000,
            driver_years=extreme_years,
            wacc=0.09,
            terminal_growth_rate=0.025,
            net_debt=200,
            diluted_shares_outstanding=100,
        )


def test_driver_sensitivity_raises_when_the_base_case_itself_overflows():
    with pytest.raises(NonFiniteResultError):
        driver_dcf_sensitivity(
            base_year_revenue=1.7e308,
            driver_years=DRIVER_YEARS,
            wacc=0.09,
            terminal_growth_rate=0.025,
            net_debt=200,
            diluted_shares_outstanding=100,
        )


# --- driver_warnings ----------------------------------------------------------------------


def test_driver_warnings_empty_for_the_comfortable_fixture():
    rows = project_driver_years(1000, DRIVER_YEARS)
    assert driver_warnings(1000, DRIVER_YEARS, rows) == []


def test_driver_warnings_non_positive_base_year_revenue():
    rows = project_driver_years(0, DRIVER_YEARS)
    warnings = driver_warnings(0, DRIVER_YEARS, rows)
    base_warning = next(w for w in warnings if w["id"] == "non_positive_base_year_revenue")
    assert base_warning["year"] == 0
    assert base_warning["tier"] == "extreme"


def test_driver_warnings_tax_rate_outside_0_100_percent():
    years = [{**DRIVER_YEARS[0], "tax_rate": 1.5}]
    rows = project_driver_years(1000, years)
    warnings = driver_warnings(1000, years, rows)
    w = next(x for x in warnings if x["id"] == "tax_rate_outside_0_100_percent")
    assert w["year"] == 1
    assert w["tier"] == "caution"

    negative_tax_years = [{**DRIVER_YEARS[0], "tax_rate": -0.1}]
    negative_rows = project_driver_years(1000, negative_tax_years)
    negative_warnings = driver_warnings(1000, negative_tax_years, negative_rows)
    assert any(x["id"] == "tax_rate_outside_0_100_percent" for x in negative_warnings)


def test_driver_warnings_negative_da_and_capex_percent():
    years = [{**DRIVER_YEARS[0], "da_pct_of_revenue": -0.02, "capex_pct_of_revenue": -0.01}]
    rows = project_driver_years(1000, years)
    warnings = driver_warnings(1000, years, rows)
    ids = {w["id"] for w in warnings}
    assert "negative_da_percent" in ids
    assert "negative_capex_percent" in ids
    assert all(w["tier"] == "caution" for w in warnings if w["id"] in ids)


def test_driver_warnings_zero_revenue_lock_flagged_once_not_every_subsequent_year():
    # -100% growth in year 2 zeroes revenue permanently - years 3-5 are a mechanical
    # consequence, not a new event, so only year 2 should carry the warning.
    years = [
        {**DRIVER_YEARS[0], "revenue_growth_rate": 0.05},
        {**DRIVER_YEARS[0], "revenue_growth_rate": -1.0},
        {**DRIVER_YEARS[0], "revenue_growth_rate": 0.10},
        {**DRIVER_YEARS[0], "revenue_growth_rate": 0.10},
        {**DRIVER_YEARS[0], "revenue_growth_rate": 0.10},
    ]
    rows = project_driver_years(1000, years)
    assert rows[1]["revenue"] == pytest.approx(0.0)
    assert rows[2]["revenue"] == pytest.approx(0.0)  # locked - not restored by +10% growth
    assert rows[4]["revenue"] == pytest.approx(0.0)

    warnings = driver_warnings(1000, years, rows)
    zero_lock_warnings = [w for w in warnings if w["id"] == "zero_revenue_lock"]
    assert len(zero_lock_warnings) == 1
    assert zero_lock_warnings[0]["year"] == 2
    assert "no subsequent" in zero_lock_warnings[0]["explanation"].lower()


def test_driver_warnings_negative_revenue_does_not_assume_a_predictable_pattern():
    # -150% growth in year 1 flips revenue negative (1000 * -0.5 = -500). Year 2 then applies
    # a completely unremarkable +20% growth rate - but applied to an already-negative prior
    # revenue, that makes it *more* negative (-500 * 1.2 = -600), not "flip back positive".
    # Proves the warning logic doesn't assume any predictable sign pattern (alternating or
    # otherwise) the way Quick DCF's single exponentiated rate does - each year's sign is a
    # genuine consequence of that year's own rate applied to whatever the prior year left.
    years = [
        {**DRIVER_YEARS[0], "revenue_growth_rate": -1.5},
        {**DRIVER_YEARS[0], "revenue_growth_rate": 0.2},
    ]
    rows = project_driver_years(1000, years)
    assert rows[0]["revenue"] == pytest.approx(-500.0)
    assert rows[1]["revenue"] == pytest.approx(-600.0)  # a normal +20% rate, still negative

    warnings = driver_warnings(1000, years, rows)
    negative_warnings = [w for w in warnings if w["id"] == "negative_revenue"]
    # Both years are independently negative here, and neither is a zero-lock, so both are
    # flagged on their own merits - not collapsed into a single "alternating" warning.
    assert {w["year"] for w in negative_warnings} == {1, 2}
    assert "not a predictable alternating pattern" in negative_warnings[0]["explanation"]


def test_driver_warnings_mathematically_precise_wording_does_not_claim_alternation():
    # The wording must never assert revenue *does* alternate the way Quick DCF's own
    # "alternates between negative and positive" phrasing does for its single flat rate -
    # Driver mode's per-year rates give no such guarantee. It's fine for the explanation to
    # explicitly *deny* a predictable pattern (see the test above); it must never claim one.
    years = [{**DRIVER_YEARS[0], "revenue_growth_rate": -1.2}]
    rows = project_driver_years(1000, years)
    warnings = driver_warnings(1000, years, rows)
    negative_warning = next(w for w in warnings if w["id"] == "negative_revenue")
    assert "alternates between negative and positive" not in negative_warning["explanation"]


# Final-year UFCF drives the Gordon Growth terminal value, so its sign is checked on its own,
# independently of whether any individual driver looks unusual. A flat-revenue schedule keeps
# delta NWC at zero, so the sign is set purely by NOPAT + D&A - CapEx and lands on an exact
# 0.0 rather than a floating-point near-miss.
def _flat_revenue_year(**overrides):
    return {
        **DRIVER_YEARS[0],
        "revenue_growth_rate": 0.0,
        "ebit_margin": 0.10,
        "tax_rate": 0.25,
        "da_pct_of_revenue": 0.025,
        "capex_pct_of_revenue": 0.10,
        "nwc_investment_pct_of_revenue_change": 0.0,
        **overrides,
    }


def test_driver_warnings_no_terminal_year_warning_when_final_year_fcf_is_positive():
    years = [_flat_revenue_year(capex_pct_of_revenue=0.05)]
    rows = project_driver_years(1000, years)
    assert rows[-1]["fcf"] > 0
    warnings = driver_warnings(1000, years, rows)
    assert [w for w in warnings if w["id"] == "non_positive_terminal_year_fcf"] == []


def test_driver_warnings_terminal_year_fcf_of_exactly_zero_is_flagged():
    years = [_flat_revenue_year()]
    rows = project_driver_years(1000, years)
    assert rows[-1]["fcf"] == 0.0
    warnings = driver_warnings(1000, years, rows)
    w = next(x for x in warnings if x["id"] == "non_positive_terminal_year_fcf")
    assert w["year"] == 1
    assert w["tier"] == "extreme"


def test_driver_warnings_negative_terminal_year_fcf_is_flagged_with_no_other_warning():
    # The case that motivated this warning: an ordinary reinvestment-heavy growth forecast
    # where every individual driver sits in a perfectly normal range - tax rate inside
    # 0%-100%, D&A and CapEx both positive, revenue positive and growing every year - so no
    # other warning fires, yet the final year's UFCF is negative and the Gordon Growth
    # terminal value (and with it enterprise value) comes out negative.
    years = [
        dict(
            revenue_growth_rate=0.25,
            ebit_margin=0.05,
            tax_rate=0.25,
            da_pct_of_revenue=0.04,
            capex_pct_of_revenue=0.12,
            nwc_investment_pct_of_revenue_change=0.15,
        )
        for _ in range(5)
    ]
    rows = project_driver_years(1000, years)
    assert rows[-1]["fcf"] < 0
    warnings = driver_warnings(1000, years, rows)
    assert [w["id"] for w in warnings] == ["non_positive_terminal_year_fcf"]
    w = warnings[0]
    assert w["year"] == 5
    assert w["tier"] == "extreme"

    # Not a block: the valuation still computes and still returns the warning alongside it.
    result = run_driver_dcf(1000, years, 0.09, 0.025, 0.0, 100.0)
    assert result["terminal_value"] < 0
    assert result["value_per_share"] < 0
    assert any(x["id"] == "non_positive_terminal_year_fcf" for x in result["driver_warnings"])


def test_driver_warnings_terminal_year_check_reads_the_final_year_not_an_earlier_one():
    # An early negative year that recovers to a positive final year is NOT flagged - the
    # terminal value depends on the last explicit year alone, not on any interior dip.
    years = [
        _flat_revenue_year(capex_pct_of_revenue=0.30),
        _flat_revenue_year(capex_pct_of_revenue=0.05),
    ]
    rows = project_driver_years(1000, years)
    assert rows[0]["fcf"] < 0 and rows[-1]["fcf"] > 0
    warnings = driver_warnings(1000, years, rows)
    assert [w for w in warnings if w["id"] == "non_positive_terminal_year_fcf"] == []


# --- driver_dcf_sensitivity ----------------------------------------------------------------


def test_driver_sensitivity_center_cell_matches_base_case_value_per_share_exactly():
    base_result = run_driver_dcf(**DRIVER_VALID_INPUTS)
    sensitivity = driver_dcf_sensitivity(**DRIVER_VALID_INPUTS)

    assert DRIVER_VALID_INPUTS["terminal_growth_rate"] in sensitivity["terminal_growth_rates"]
    center_col = sensitivity["terminal_growth_rates"].index(DRIVER_VALID_INPUTS["terminal_growth_rate"])
    center_row = next(
        row for row in sensitivity["rows"]
        if row["wacc"] == pytest.approx(DRIVER_VALID_INPUTS["wacc"])
    )
    assert center_row["value_per_share_by_growth"][center_col] == pytest.approx(
        base_result["value_per_share"]
    )


def test_driver_sensitivity_nulls_cells_outside_convergence_domain():
    sensitivity = driver_dcf_sensitivity(
        **{**DRIVER_VALID_INPUTS, "wacc": 0.065, "terminal_growth_rate": 0.055}
    )
    growth_idx = sensitivity["terminal_growth_rates"].index(0.06)
    wacc_row = next(row for row in sensitivity["rows"] if row["wacc"] == pytest.approx(0.055))
    assert wacc_row["value_per_share_by_growth"][growth_idx] is None


# --- Schema: hard bounds removed except where math requires them -------------------------


def test_driver_dcf_inputs_accepts_tax_rate_above_100_percent():
    # No longer hard-blocked - surfaces as a driver_warnings entry instead (see above).
    result = DriverDCFInputs(**{**DRIVER_VALID_INPUTS, "driver_years": [{**DRIVER_YEARS[0], "tax_rate": 1.5}]})
    assert result.driver_years[0].tax_rate == 1.5


def test_driver_dcf_inputs_accepts_negative_da_and_capex_percent():
    years = [{**DRIVER_YEARS[0], "da_pct_of_revenue": -0.02, "capex_pct_of_revenue": -0.01}]
    result = DriverDCFInputs(**{**DRIVER_VALID_INPUTS, "driver_years": years})
    assert result.driver_years[0].da_pct_of_revenue == -0.02
    assert result.driver_years[0].capex_pct_of_revenue == -0.01


def test_driver_dcf_inputs_accepts_non_positive_base_year_revenue():
    result = DriverDCFInputs(**{**DRIVER_VALID_INPUTS, "base_year_revenue": 0})
    assert result.base_year_revenue == 0


def test_driver_dcf_inputs_rejects_more_than_fifteen_driver_years():
    with pytest.raises(ValidationError):
        DriverDCFInputs(**{**DRIVER_VALID_INPUTS, "driver_years": DRIVER_YEARS * 6})


def test_driver_dcf_inputs_rejects_non_convergent_wacc_terminal_growth():
    with pytest.raises(ValidationError, match="WACC must be greater than"):
        DriverDCFInputs(**{**DRIVER_VALID_INPUTS, "wacc": 0.02, "terminal_growth_rate": 0.05})


# --- Driver sensitivity (tornado) --------------------------------------------------------

TORNADO_OTHER_FIELDS = (
    "ebit_margin",
    "tax_rate",
    "da_pct_of_revenue",
    "capex_pct_of_revenue",
    "nwc_investment_pct_of_revenue_change",
)

# One forecast year, revenue landing exactly on zero at the base case, a 100% tax rate, and
# no D&A or CapEx. This puts the base case precisely on the max(EBIT, 0) kink, which is what
# makes both perturbed endpoints land on the SAME side of base - the property the span metric
# has to survive. Hand-checked: at base revenue 0, FCF is 0 - 0.10 x (0 - 1000) = +100; at
# -1pp revenue is -10 (EBIT -2, no tax owed) giving FCF 99; at +1pp revenue is +10 (EBIT 2,
# fully taxed to NOPAT 0) giving FCF 99 as well. Both directions reduce value identically.
KINK_INPUTS = dict(
    base_year_revenue=1000,
    driver_years=[
        dict(
            revenue_growth_rate=-1.0,
            ebit_margin=0.20,
            tax_rate=1.0,
            da_pct_of_revenue=0.0,
            capex_pct_of_revenue=0.0,
            nwc_investment_pct_of_revenue_change=0.10,
        )
    ],
    wacc=0.10,
    terminal_growth_rate=0.02,
    net_debt=0,
    diluted_shares_outstanding=100,
)


def test_shift_driver_moves_every_forecast_year_and_leaves_other_drivers_untouched():
    shifted = _shift_driver(DRIVER_YEARS, "revenue_growth_rate", 0.01)
    # Parallel shift: the fade shape (10% -> 8% -> 6%) is preserved, not flattened.
    assert [y["revenue_growth_rate"] for y in shifted] == pytest.approx([0.11, 0.09, 0.07])
    for original, moved in zip(DRIVER_YEARS, shifted):
        for field in TORNADO_OTHER_FIELDS:
            assert moved[field] == original[field]
    # The input list is never mutated - the base case has to stay valuable as given.
    assert [y["revenue_growth_rate"] for y in DRIVER_YEARS] == pytest.approx([0.10, 0.08, 0.06])


def test_driver_tornado_computes_its_own_base_matching_run_driver_dcf():
    result = driver_dcf_tornado(**DRIVER_VALID_INPUTS)
    assert result["base_value_per_share"] == run_driver_dcf(**DRIVER_VALID_INPUTS)["value_per_share"]
    assert result["shift"] == 0.01


def test_driver_tornado_covers_each_of_the_six_operating_drivers_exactly_once():
    result = driver_dcf_tornado(**DRIVER_VALID_INPUTS)
    assert sorted(row["driver"] for row in result["rows"]) == sorted(
        [
            "revenue_growth_rate",
            "ebit_margin",
            "tax_rate",
            "da_pct_of_revenue",
            "capex_pct_of_revenue",
            "nwc_investment_pct_of_revenue_change",
        ]
    )
    # WACC and terminal growth are deliberately absent - they aren't operating drivers.
    assert all(row["driver"] not in ("wacc", "terminal_growth_rate") for row in result["rows"])


def test_driver_tornado_reports_the_per_year_path_it_actually_tested():
    result = driver_dcf_tornado(**DRIVER_VALID_INPUTS)
    by_driver = {row["driver"]: row for row in result["rows"]}
    # A varying (fade) row carries its real path, which is exactly why a single
    # "base -> perturbed" pair can't describe every row in the UI.
    assert by_driver["revenue_growth_rate"]["base_path"] == pytest.approx([0.10, 0.08, 0.06])
    # A flat row reads as one repeated value.
    assert by_driver["ebit_margin"]["base_path"] == pytest.approx([0.20, 0.20, 0.20])


def test_driver_tornado_deltas_are_measured_against_the_base_case():
    result = driver_dcf_tornado(**DRIVER_VALID_INPUTS)
    base = result["base_value_per_share"]
    for row in result["rows"]:
        if row["down_value_per_share"] is not None:
            assert row["down_delta"] == pytest.approx(row["down_value_per_share"] - base, abs=0.01)
        if row["up_value_per_share"] is not None:
            assert row["up_delta"] == pytest.approx(row["up_value_per_share"] - base, abs=0.01)


def test_driver_tornado_orders_complete_rows_by_descending_tested_range():
    rows = driver_dcf_tornado(**DRIVER_VALID_INPUTS)["rows"]
    assert all(row["complete"] for row in rows)
    ranges = [row["tested_range"] for row in rows]
    assert ranges == sorted(ranges, reverse=True)

    by_driver = {row["driver"]: rows.index(row) for row in rows}
    # A live demonstration of why every row has to disclose its own tested path: on this
    # fixture D&A and CapEx (4% and 5% of revenue) top the ranking, ahead of three years of
    # compounding revenue growth, because the same 1pp is a ~25% relative move for them and
    # a much smaller one for the others. That ordering is correct *given* the standardized
    # shift - it is not a claim that D&A is the most important assumption in the model.
    assert rows[0]["driver"] in ("da_pct_of_revenue", "capex_pct_of_revenue")

    # D&A and CapEx enter FCF with equal and opposite weight, so their ranges tie exactly.
    # Ties resolve to the canonical driver order via a stable sort, never arbitrarily.
    da, capex = by_driver["da_pct_of_revenue"], by_driver["capex_pct_of_revenue"]
    assert rows[da]["tested_range"] == rows[capex]["tested_range"]
    assert da < capex

    # When the endpoints straddle base - the ordinary case - the tested range and the
    # endpoint-to-endpoint distance agree exactly. They only diverge in the same-side case
    # covered below, so this metric change is not a silent re-ranking of normal companies.
    for row in rows:
        assert row["tested_range"] == pytest.approx(
            abs(row["up_value_per_share"] - row["down_value_per_share"]), abs=0.01
        )


def test_driver_tornado_tested_range_includes_the_base_when_endpoints_share_a_side():
    """The regression this metric exists for. At the max(EBIT, 0) kink both perturbed
    endpoints land on the same side of base and are identical to each other, so an
    endpoint-to-endpoint measure would collapse to exactly zero and rank this driver last -
    despite both directions genuinely moving the valuation. Including the base value in the
    range keeps the real movement visible."""
    result = driver_dcf_tornado(**KINK_INPUTS)
    base = result["base_value_per_share"]
    growth = next(row for row in result["rows"] if row["driver"] == "revenue_growth_rate")

    assert growth["complete"]
    # Both directions move value the same way - neither is an "upside".
    assert growth["down_delta"] < 0
    assert growth["up_delta"] < 0
    assert growth["down_value_per_share"] == growth["up_value_per_share"]

    # The endpoint-only measure would have been zero here...
    assert growth["up_value_per_share"] - growth["down_value_per_share"] == 0
    # ...but the driver really did move value, and the tested range says so.
    assert growth["tested_range"] > 0
    assert growth["tested_range"] == pytest.approx(base - growth["down_value_per_share"], abs=0.01)


def test_driver_tornado_same_side_row_outranks_a_genuinely_flat_one():
    """Consequence of the metric above, stated as ordering rather than arithmetic: a driver
    whose two endpoints share a side must still rank ahead of one that moved nothing at
    all."""
    rows = driver_dcf_tornado(**KINK_INPUTS)["rows"]
    positions = {row["driver"]: i for i, row in enumerate(rows)}
    # At a base revenue of exactly zero, margin/tax/D&A/CapEx all multiply zero and cannot
    # move value; revenue growth (via the kink) and NWC investment can.
    assert rows[positions["revenue_growth_rate"]]["tested_range"] > 0
    assert rows[positions["ebit_margin"]]["tested_range"] == 0.0
    assert positions["revenue_growth_rate"] < positions["ebit_margin"]


def test_driver_tornado_nwc_direction_reverses_when_revenue_is_declining():
    """NWC investment is a percentage of the year-over-year *change* in revenue, so when
    revenue is shrinking a higher percentage releases cash rather than consuming it. This is
    a real sign reversal in the engine, not a hypothetical - it's why the chart can never
    label its endpoints as fixed upside/downside sides."""
    growing = dict(DRIVER_VALID_INPUTS)
    declining = dict(
        DRIVER_VALID_INPUTS,
        driver_years=[dict(year, revenue_growth_rate=-0.10) for year in DRIVER_YEARS],
    )

    def nwc_up_delta(inputs):
        rows = driver_dcf_tornado(**inputs)["rows"]
        row = next(r for r in rows if r["driver"] == "nwc_investment_pct_of_revenue_change")
        return row["up_delta"]

    # Growing revenue: more NWC investment consumes cash, so +1pp lowers value.
    assert nwc_up_delta(growing) < 0
    # Declining revenue: the same +1pp releases cash, raising value.
    assert nwc_up_delta(declining) > 0


def test_driver_tornado_marks_a_one_sided_row_incomplete_and_sorts_it_after_complete_rows():
    """A perturbed side that overflows must go null without taking the other five drivers -
    or its own opposite direction - down with it. Tuned so the base case and the -1pp side
    both compute while +1pp on revenue growth tips into overflow."""
    inputs = dict(
        base_year_revenue=2.3e305,
        driver_years=[
            dict(
                revenue_growth_rate=0.5,
                ebit_margin=0.20,
                tax_rate=0.25,
                da_pct_of_revenue=0.04,
                capex_pct_of_revenue=0.05,
                nwc_investment_pct_of_revenue_change=0.10,
            )
            for _ in range(15)
        ],
        wacc=0.09,
        terminal_growth_rate=0.025,
        net_debt=0,
        diluted_shares_outstanding=100,
    )
    result = driver_dcf_tornado(**inputs)
    rows = result["rows"]
    by_driver = {row["driver"]: row for row in rows}
    growth = by_driver["revenue_growth_rate"]

    assert growth["complete"] is False
    assert growth["up_value_per_share"] is None
    assert growth["up_delta"] is None
    assert growth["tested_range"] is None
    # The computable direction is still reported rather than discarded.
    assert growth["down_value_per_share"] is not None

    # At this scale several drivers go one-sided and others stay complete, which is the
    # mix the ordering rule exists for - a partly-failed chart still renders in full.
    complete = [i for i, row in enumerate(rows) if row["complete"]]
    incomplete = [i for i, row in enumerate(rows) if not row["complete"]]
    assert complete and incomplete
    # Nulling is not direction-specific: one row loses its up side, another its down side.
    assert by_driver["da_pct_of_revenue"]["up_delta"] is None
    assert by_driver["capex_pct_of_revenue"]["down_delta"] is None

    # Every complete row sorts ahead of every incomplete one, however large the incomplete
    # row's one available delta happens to be...
    assert max(complete) < min(incomplete)
    # ...and incomplete rows are then ordered by that available absolute delta, descending.
    available = [
        abs(next(d for d in (rows[i]["down_delta"], rows[i]["up_delta"]) if d is not None))
        for i in incomplete
    ]
    assert available == sorted(available, reverse=True)


def test_driver_tornado_raises_when_the_base_case_itself_overflows():
    """Same rule the sensitivity grids apply to their own base cell: if the analyst's own
    unperturbed inputs can't be computed, fail cleanly rather than return a chart measured
    against a base that doesn't exist."""
    with pytest.raises(NonFiniteResultError):
        driver_dcf_tornado(
            base_year_revenue=1e308,
            driver_years=[dict(DRIVER_YEARS[0], revenue_growth_rate=5.0) for _ in range(15)],
            wacc=0.09,
            terminal_growth_rate=0.025,
            net_debt=0,
            diluted_shares_outstanding=100,
        )


# --- Tornado endpoint warnings -----------------------------------------------------------

# A low-D&A company, which is the ordinary case that makes a -1pp shift produce a negative
# D&A percentage: 0.88% of revenue is Costco's real figure, and -1pp takes it to -0.12%.
LOW_DA_INPUTS = dict(
    base_year_revenue=1000,
    driver_years=[
        dict(
            revenue_growth_rate=0.05,
            ebit_margin=0.0343,
            tax_rate=0.2455,
            da_pct_of_revenue=0.0088,
            capex_pct_of_revenue=0.0183,
            nwc_investment_pct_of_revenue_change=-0.03,
        )
        for _ in range(3)
    ],
    wacc=0.075,
    terminal_growth_rate=0.025,
    net_debt=0,
    diluted_shares_outstanding=100,
)


def test_new_endpoint_warnings_reports_only_what_the_perturbation_introduced():
    base = [{"year": 1, "id": "negative_capex_percent", "tier": "caution", "explanation": "x"}]
    endpoint = [
        {"year": 1, "id": "negative_capex_percent", "tier": "caution", "explanation": "x"},
        {"year": 2, "id": "negative_da_percent", "tier": "caution", "explanation": "y"},
    ]
    result = new_endpoint_warnings(base, endpoint)
    # The pre-existing warning is the analyst's own, not something this shift caused.
    assert [w["id"] for w in result] == ["negative_da_percent"]
    assert result[0]["years"] == [2]


def test_new_endpoint_warnings_groups_one_id_across_every_year_it_newly_affects():
    endpoint = [
        {"year": y, "id": "negative_da_percent", "tier": "caution", "explanation": "y"}
        for y in (3, 1, 2)
    ]
    result = new_endpoint_warnings([], endpoint)
    # One entry, not three - a flat driver row trips the same warning in every year.
    assert len(result) == 1
    assert result[0]["years"] == [1, 2, 3]


def test_new_endpoint_warnings_catches_an_existing_warning_extending_to_new_years():
    base = [{"year": 1, "id": "negative_revenue", "tier": "high", "explanation": "z"}]
    endpoint = [
        {"year": 1, "id": "negative_revenue", "tier": "high", "explanation": "z"},
        {"year": 2, "id": "negative_revenue", "tier": "high", "explanation": "z"},
    ]
    result = new_endpoint_warnings(base, endpoint)
    # Compared by (year, id), so year 2 is newly affected even though the id already existed.
    assert result[0]["years"] == [2]


def test_new_endpoint_warnings_reports_the_most_severe_tier_for_a_grouped_id():
    endpoint = [
        {"year": 1, "id": "negative_revenue", "tier": "caution", "explanation": "mild"},
        {"year": 2, "id": "negative_revenue", "tier": "extreme", "explanation": "severe"},
    ]
    result = new_endpoint_warnings([], endpoint)
    assert result[0]["tier"] == "extreme"
    assert result[0]["explanation"] == "severe"


def test_new_endpoint_warnings_orders_most_severe_first():
    endpoint = [
        {"year": 1, "id": "negative_da_percent", "tier": "caution", "explanation": "a"},
        {"year": 1, "id": "negative_revenue", "tier": "extreme", "explanation": "b"},
    ]
    assert [w["tier"] for w in new_endpoint_warnings([], endpoint)] == ["extreme", "caution"]


def test_driver_tornado_flags_the_negative_da_endpoint_an_ordinary_company_produces():
    """The finding this feature exists for: a company whose D&A is under 1% of revenue has
    its -1pp endpoint land on a negative D&A percentage, which the engine warns about when
    entered directly - and on real inputs that endpoint drives a top-ranked row. It is
    neither clamped nor skipped, so it has to be visibly marked."""
    rows = driver_dcf_tornado(**LOW_DA_INPUTS)["rows"]
    da = next(row for row in rows if row["driver"] == "da_pct_of_revenue")

    assert [w["id"] for w in da["down_new_warnings"]] == ["negative_da_percent"]
    # Flat row, so every forecast year is affected, reported as one grouped entry.
    assert da["down_new_warnings"][0]["years"] == [1, 2, 3]
    assert da["down_new_warnings"][0]["explanation"]
    # The perturbation is still valued, not refused.
    assert da["down_value_per_share"] is not None
    # The opposite direction introduces nothing.
    assert da["up_new_warnings"] == []


def test_driver_tornado_leaves_unaffected_endpoints_unflagged():
    rows = driver_dcf_tornado(**LOW_DA_INPUTS)["rows"]
    for row in rows:
        if row["driver"] == "da_pct_of_revenue":
            continue
        assert row["down_new_warnings"] == []
        assert row["up_new_warnings"] == []


def test_driver_tornado_does_not_re_report_a_warning_the_base_case_already_raises():
    """A base case that already warns must not have that warning attributed to the shift."""
    already_negative_da = dict(
        LOW_DA_INPUTS,
        driver_years=[dict(y, da_pct_of_revenue=-0.02) for y in LOW_DA_INPUTS["driver_years"]],
    )
    rows = driver_dcf_tornado(**already_negative_da)["rows"]
    da = next(row for row in rows if row["driver"] == "da_pct_of_revenue")
    # Both endpoints are still negative D&A, but the base already was, so neither direction
    # introduced anything.
    assert da["down_new_warnings"] == []
    assert da["up_new_warnings"] == []


def test_driver_tornado_reports_no_warnings_for_an_uncomputable_endpoint():
    inputs = dict(
        base_year_revenue=2.3e305,
        driver_years=[
            dict(
                revenue_growth_rate=0.5,
                ebit_margin=0.20,
                tax_rate=0.25,
                da_pct_of_revenue=0.04,
                capex_pct_of_revenue=0.05,
                nwc_investment_pct_of_revenue_change=0.10,
            )
            for _ in range(15)
        ],
        wacc=0.09,
        terminal_growth_rate=0.025,
        net_debt=0,
        diluted_shares_outstanding=100,
    )
    rows = driver_dcf_tornado(**inputs)["rows"]
    growth = next(row for row in rows if row["driver"] == "revenue_growth_rate")
    assert growth["up_value_per_share"] is None
    # No valuation means no warnings to compare - empty, never a fabricated entry.
    assert growth["up_new_warnings"] == []


# --- Driver sensitivity (two-way): revenue growth x EBIT margin --------------------------

# Two schedules whose only meaningful difference is how much margin each point of revenue
# carries. Together they are the finding this grid exists for: the same engine, the same
# standardized shifts, and revenue growth destroys value in one while creating it in the
# other. Neither axis has a direction that can be assumed in advance.
INTERACTION_INPUTS = dict(
    base_year_revenue=1000,
    driver_years=[
        dict(
            revenue_growth_rate=0.25,
            ebit_margin=0.18,
            tax_rate=0.25,
            da_pct_of_revenue=0.04,
            capex_pct_of_revenue=0.12,
            nwc_investment_pct_of_revenue_change=0.15,
        )
        for _ in range(5)
    ],
    wacc=0.09,
    terminal_growth_rate=0.025,
    net_debt=200,
    diluted_shares_outstanding=100,
)

# The reinvestment-heavy forecast reproduced in decisions.md, where every individual driver
# sits in a normal range and no driver warning fires, yet the schedule is value-destroying.
REINVESTMENT_HEAVY_INPUTS = dict(
    INTERACTION_INPUTS,
    driver_years=[
        {**INTERACTION_INPUTS["driver_years"][0], "ebit_margin": 0.05} for _ in range(5)
    ],
)


def _cell(result, growth_delta, margin_delta):
    row = next(r for r in result["rows"] if r["revenue_growth_delta"] == growth_delta)
    return row["cells"][result["ebit_margin_deltas"].index(margin_delta)]


def test_growth_margin_grid_is_five_by_five_on_uniform_1pp_steps():
    result = driver_growth_margin_sensitivity(**DRIVER_VALID_INPUTS)

    assert result["step"] == 0.01
    assert result["ebit_margin_deltas"] == list(GROWTH_MARGIN_DELTAS)
    assert [row["revenue_growth_delta"] for row in result["rows"]] == list(GROWTH_MARGIN_DELTAS)
    assert all(len(row["cells"]) == 5 for row in result["rows"])


def test_growth_margin_grid_values_the_unperturbed_schedule_exactly_once():
    """Twenty-five valuations, not twenty-six: the centre cell is the base case, so it reuses
    the run the deltas are already measured against instead of valuing the identical schedule
    a second time."""
    calls = []
    real_run = dcf.run_driver_dcf

    def counting_run(**kwargs):
        calls.append(kwargs["driver_years"])
        return real_run(**kwargs)

    original = dcf.run_driver_dcf
    dcf.run_driver_dcf = counting_run
    try:
        result = dcf.driver_growth_margin_sensitivity(**DRIVER_VALID_INPUTS)
    finally:
        dcf.run_driver_dcf = original

    assert len(calls) == 25
    # And exactly one of those is the analyst's own unshifted schedule.
    assert sum(1 for driver_years in calls if driver_years == DRIVER_YEARS) == 1
    centre = _cell(result, 0.0, 0.0)
    assert centre["value_per_share"] == result["base_value_per_share"]
    assert centre["delta"] == 0.0


def test_growth_margin_base_cell_matches_run_driver_dcf_exactly():
    """The centre cell is the analyst's own unperturbed case, so it must agree with the
    valuation shown everywhere else - not a separately-rounded recomputation of it."""
    result = driver_growth_margin_sensitivity(**DRIVER_VALID_INPUTS)
    direct = run_driver_dcf(**DRIVER_VALID_INPUTS)

    centre = _cell(result, 0.0, 0.0)
    assert centre["value_per_share"] == direct["value_per_share"]
    assert result["base_value_per_share"] == direct["value_per_share"]
    assert centre["delta"] == 0.0
    # Compared against itself, so it can never introduce a warning of its own.
    assert centre["new_warnings"] == []


def test_growth_margin_inner_single_axis_cells_match_the_tornado():
    """The four cells one step out along a single axis test exactly what the tornado's
    revenue-growth and EBIT-margin rows test, so the two views must agree there. This is the
    whole of the overlap: the +/-2pp cells and every off-axis combination have no tornado
    equivalent at all."""
    grid = driver_growth_margin_sensitivity(**DRIVER_VALID_INPUTS)
    tornado = driver_dcf_tornado(**DRIVER_VALID_INPUTS)
    rows = {row["driver"]: row for row in tornado["rows"]}

    assert _cell(grid, -0.01, 0.0)["value_per_share"] == rows["revenue_growth_rate"]["down_value_per_share"]
    assert _cell(grid, 0.01, 0.0)["value_per_share"] == rows["revenue_growth_rate"]["up_value_per_share"]
    assert _cell(grid, 0.0, -0.01)["value_per_share"] == rows["ebit_margin"]["down_value_per_share"]
    assert _cell(grid, 0.0, 0.01)["value_per_share"] == rows["ebit_margin"]["up_value_per_share"]


def test_growth_margin_off_axis_cell_applies_both_shifts_together():
    """An off-axis cell is not either single-axis result - it is the schedule with both
    drivers moved at once, which is the only reason this grid exists."""
    result = driver_growth_margin_sensitivity(**DRIVER_VALID_INPUTS)
    both = run_driver_dcf(
        **{
            **DRIVER_VALID_INPUTS,
            "driver_years": _growth_margin_shift(DRIVER_YEARS, 0.02, -0.02),
        }
    )
    assert _cell(result, 0.02, -0.02)["value_per_share"] == both["value_per_share"]


def test_growth_margin_shift_preserves_a_varying_row_shape():
    """A Fade or Custom row moves as a whole rather than being flattened - the same
    guarantee _shift_driver already makes, held across the two-driver composition."""
    shifted = _growth_margin_shift(DRIVER_YEARS, 0.02, -0.01)

    assert [y["revenue_growth_rate"] for y in shifted] == pytest.approx([0.12, 0.10, 0.08])
    assert [y["ebit_margin"] for y in shifted] == pytest.approx([0.19, 0.19, 0.19])
    # Every other driver untouched in every year.
    for original, moved in zip(DRIVER_YEARS, shifted):
        for field in (
            "tax_rate",
            "da_pct_of_revenue",
            "capex_pct_of_revenue",
            "nwc_investment_pct_of_revenue_change",
        ):
            assert moved[field] == original[field]


def test_growth_margin_grid_shows_growth_reversing_direction_across_the_margin_axis():
    """The finding the grid is built to surface, and the reason its legend must not claim a
    direction for either axis: on one schedule, at the low-margin end more revenue growth
    reduces value per share, while at the high-margin end the same shifts increase it.

    Deliberately asserted from the computed cells rather than from any closed-form rule. A
    per-year cash-flow coefficient explains the local relationship but does not determine the
    total valuation response, which also runs through compounding into later years,
    discounting, each year's own driver path, and the terminal value built off the final
    year."""
    result = driver_growth_margin_sensitivity(**INTERACTION_INPUTS)

    low_margin = [_cell(result, g, -0.02)["value_per_share"] for g in GROWTH_MARGIN_DELTAS]
    high_margin = [_cell(result, g, 0.02)["value_per_share"] for g in GROWTH_MARGIN_DELTAS]

    assert low_margin == sorted(low_margin, reverse=True)
    assert high_margin == sorted(high_margin)


def test_growth_margin_grid_growth_axis_inverts_throughout_a_reinvestment_heavy_schedule():
    """decisions.md's reinvestment-heavy case, where no individual driver looks unusual: here
    more revenue growth reduces value in every margin column tested, not just the low ones."""
    result = driver_growth_margin_sensitivity(**REINVESTMENT_HEAVY_INPUTS)

    for index in range(len(GROWTH_MARGIN_DELTAS)):
        column = [row["cells"][index]["value_per_share"] for row in result["rows"]]
        assert column == sorted(column, reverse=True)


def test_growth_margin_grid_margin_axis_rises_on_an_ordinary_positive_revenue_schedule():
    """Not a claim that the margin axis always rises - it is increasing only where revenue is
    positive and the tax rate is at or below 100%, neither of which this engine requires."""
    result = driver_growth_margin_sensitivity(**INTERACTION_INPUTS)

    for row in result["rows"]:
        values = [cell["value_per_share"] for cell in row["cells"]]
        assert values == sorted(values)


def test_growth_margin_grid_reports_the_paths_it_actually_shifted():
    result = driver_growth_margin_sensitivity(**DRIVER_VALID_INPUTS)

    assert result["base_revenue_growth_path"] == [0.10, 0.08, 0.06]
    assert result["base_ebit_margin_path"] == [0.20, 0.20, 0.20]


def test_growth_margin_grid_deltas_are_measured_against_the_base_case():
    result = driver_growth_margin_sensitivity(**DRIVER_VALID_INPUTS)
    base = result["base_value_per_share"]

    for row in result["rows"]:
        for cell in row["cells"]:
            if cell["value_per_share"] is None:
                assert cell["delta"] is None
            else:
                assert cell["delta"] == pytest.approx(round(cell["value_per_share"] - base, 2))


def test_growth_margin_grid_raises_when_the_base_case_itself_overflows():
    """Same rule as the tornado and both WACC grids: an uncomputable base case fails the
    request cleanly rather than returning a grid with a blank centre."""
    with pytest.raises(NonFiniteResultError):
        driver_growth_margin_sensitivity(
            **{
                **DRIVER_VALID_INPUTS,
                "driver_years": [
                    {**DRIVER_YEARS[0], "revenue_growth_rate": 1e100} for _ in range(15)
                ],
            }
        )


def test_growth_margin_grid_nulls_an_uncomputable_cell_without_losing_the_rest():
    """A schedule sitting just under the float ceiling: the base case still computes, so the
    grid is returned, and only the cells whose combined shift tips it over go null."""
    result = driver_growth_margin_sensitivity(
        base_year_revenue=1.693e300,
        driver_years=[{**DRIVER_YEARS[0], "revenue_growth_rate": 2.40} for _ in range(15)],
        wacc=0.09,
        terminal_growth_rate=0.025,
        net_debt=200,
        diluted_shares_outstanding=100,
    )

    cells = [cell for row in result["rows"] for cell in row["cells"]]
    assert _cell(result, 0.0, 0.0)["value_per_share"] is not None
    assert any(cell["value_per_share"] is None for cell in cells)
    assert any(cell["value_per_share"] is not None for cell in cells)
    for cell in cells:
        if cell["value_per_share"] is None:
            assert cell["delta"] is None
            assert cell["new_warnings"] == []


def test_growth_margin_grid_marks_cells_that_introduce_a_new_warning():
    """The warning has to come from the shifts themselves, not from the base schedule: at a
    3.5% EBIT margin the base case's final-year UFCF is positive, and a -2pp margin shift
    drives it non-positive - which the engine flags."""
    inputs = dict(
        DRIVER_VALID_INPUTS,
        driver_years=[{**DRIVER_YEARS[0], "ebit_margin": 0.035} for _ in range(3)],
    )
    result = driver_growth_margin_sensitivity(**inputs)

    warned = _cell(result, 0.0, -0.02)
    assert "non_positive_terminal_year_fcf" in {w["id"] for w in warned["new_warnings"]}
    # Valued and reported, never clamped away or dropped.
    assert warned["value_per_share"] is not None
    # The base case raises no warning of its own, so nothing is re-reported as newly caused.
    assert _cell(result, 0.0, 0.0)["new_warnings"] == []


def test_growth_margin_grid_does_not_re_report_a_warning_the_base_case_already_raises():
    already_negative_capex = dict(
        DRIVER_VALID_INPUTS,
        driver_years=[{**year, "capex_pct_of_revenue": -0.01} for year in DRIVER_YEARS],
    )
    result = driver_growth_margin_sensitivity(**already_negative_capex)

    for row in result["rows"]:
        for cell in row["cells"]:
            assert "negative_capex_percent" not in {w["id"] for w in cell["new_warnings"]}
