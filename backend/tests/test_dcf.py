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
    driver_dcf_sensitivity,
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
