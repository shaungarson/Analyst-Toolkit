import pytest
from pydantic import ValidationError

from app.calculations.real_estate import (
    amortization_schedule,
    cap_rate,
    cash_on_cash,
    dscr,
    debt_yield,
    equity_multiple,
    exit_value,
    irr,
    project_noi,
    real_estate_sensitivity,
    underwrite_real_estate,
)
from app.schemas.real_estate import RealEstateInputs

VALID_INPUTS = dict(
    purchase_price=1_000_000,
    going_in_noi=80_000,
    ltv=0.65,
    interest_rate=0.06,
    amortization_years=30,
    loan_maturity_years=30,
    hold_period_years=5,
    exit_cap_rate=0.08,
    noi_growth_rate=0.03,
    acquisition_cost_pct=0.02,
    disposition_cost_pct=0.02,
)


def test_cap_rate():
    assert cap_rate(80_000, 1_000_000) == pytest.approx(0.08)


def test_cash_on_cash():
    assert cash_on_cash(30_000, 200_000) == pytest.approx(0.15)


def test_equity_multiple():
    assert equity_multiple(220_000, 200_000) == pytest.approx(1.1)


def test_exit_value():
    assert exit_value(80_000, 0.08) == pytest.approx(1_000_000)


def test_irr_single_period_hand_computed():
    # -100,000 now, +110,000 in a year -> exactly 10%, solvable by hand:
    # -100000 + 110000 / (1 + r) = 0  =>  r = 0.10
    assert irr([-100_000, 110_000]) == pytest.approx(0.10, abs=1e-6)


def test_amortization_zero_interest_is_straight_line():
    # No interest: payment is just principal / number of months, so each year
    # the balance drops by exactly loan_amount / amortization_years.
    schedule, annual_debt_service = amortization_schedule(
        loan_amount=120_000, annual_rate=0.0, amortization_years=10, hold_period_years=3
    )
    assert annual_debt_service == pytest.approx(12_000)
    assert schedule[0]["ending_balance"] == pytest.approx(108_000)
    assert schedule[0]["interest"] == pytest.approx(0.0)
    assert schedule[0]["principal"] == pytest.approx(12_000)
    assert schedule[1]["ending_balance"] == pytest.approx(96_000)


def test_amortization_fully_amortizes_to_zero():
    # Hold period == amortization period -> loan should be fully paid off.
    schedule, _ = amortization_schedule(
        loan_amount=500_000, annual_rate=0.06, amortization_years=5, hold_period_years=5
    )
    assert schedule[-1]["ending_balance"] == pytest.approx(0.0, abs=0.01)
    # Total principal paid across all years should equal the original loan, within a few
    # cents of rounding drift (each year's interest/principal is rounded independently).
    total_principal = sum(row["principal"] for row in schedule)
    assert total_principal == pytest.approx(500_000, abs=0.05)


def test_amortization_stops_after_loan_paid_off():
    # Hold period extends beyond amortization period -> later years show no debt service.
    schedule, _ = amortization_schedule(
        loan_amount=100_000, annual_rate=0.05, amortization_years=2, hold_period_years=4
    )
    assert schedule[2]["debt_service"] == pytest.approx(0.0)
    assert schedule[2]["ending_balance"] == pytest.approx(0.0)
    assert schedule[3]["debt_service"] == pytest.approx(0.0)


def test_project_noi_flat_when_growth_is_zero():
    assert project_noi(100_000, 0.0, 3) == pytest.approx([100_000] * 3)


def test_project_noi_year_one_is_unescalated_growth_starts_year_two():
    # Going-in NOI is the Year 1 figure exactly - growth only shows up from Year 2 on.
    result = project_noi(100_000, 0.10, 3)
    assert result == pytest.approx([100_000, 110_000, 121_000])


def test_underwrite_no_debt_no_growth_no_costs_matches_hand_computed_irr_and_multiple():
    # Same scenario as the original V1 test, with growth/costs zeroed out - confirms the
    # multi-year model correctly generalizes the old flat-NOI behavior rather than just
    # replacing it. With LTV=0 there's no debt: initial equity == purchase price, and the
    # only cash flows are flat NOI each year plus exit sale proceeds (no costs). Purchase
    # $1,000,000, NOI $80,000/yr, 1-year hold, exit cap rate == going-in cap rate (8%) with
    # flat NOI -> exit price == purchase price == $1,000,000. Equity cash flows:
    # -1,000,000 now, +1,080,000 in year 1 -> IRR = 8% exactly.
    result = underwrite_real_estate(
        purchase_price=1_000_000,
        going_in_noi=80_000,
        ltv=0.0,
        interest_rate=0.06,
        amortization_years=30,
        loan_maturity_years=30,
        hold_period_years=1,
        exit_cap_rate=0.08,
        noi_growth_rate=0.0,
        acquisition_cost_pct=0.0,
        disposition_cost_pct=0.0,
    )
    assert result["initial_equity"] == pytest.approx(1_000_000)
    assert result["going_in_cap_rate"] == pytest.approx(0.08)
    assert result["exit"]["gross_sale_price"] == pytest.approx(1_000_000)
    assert result["irr"] == pytest.approx(0.08, abs=1e-6)
    assert result["equity_multiple"] == pytest.approx(1.08, abs=1e-6)


def test_underwrite_with_growth_and_costs_hand_computed():
    # No debt (isolates growth/cost effects from amortization math, which is already
    # tested separately). Purchase $1,000,000, NOI $100,000/yr (10% going-in cap rate),
    # 10%/yr NOI growth, 2-year hold, 10% exit cap rate, 2% acquisition and disposition
    # costs.
    #
    # Acquisition costs = 1,000,000 * 0.02 = 20,000
    # Initial equity = 1,000,000 - 0 + 20,000 = 1,020,000
    # Year 1 NOI = 100,000 (unescalated); Year 2 NOI = 100,000 * 1.10 = 110,000
    # Exit NOI = 100,000 * 1.10^2 = 121,000
    # Gross sale price = 121,000 / 0.10 = 1,210,000
    # Disposition costs = 1,210,000 * 0.02 = 24,200
    # Net sale proceeds = 1,210,000 - 24,200 - 0 (no debt) = 1,185,800
    # Equity cash flows: -1,020,000, 100,000, 110,000 + 1,185,800 = 1,295,800
    # Total distributions = 100,000 + 110,000 + 1,185,800 = 1,395,800
    # Equity multiple = 1,395,800 / 1,020,000
    #
    # IRR solved independently by hand via the quadratic 1,295,800x^2 + 100,000x -
    # 1,020,000 = 0 (x = 1/(1+r)) -> r ~= 17.72%, checked against a loose tolerance
    # since manual root-finding isn't exact to 6 decimal places the way the other
    # fields here are.
    result = underwrite_real_estate(
        purchase_price=1_000_000,
        going_in_noi=100_000,
        ltv=0.0,
        interest_rate=0.06,
        amortization_years=30,
        loan_maturity_years=30,
        hold_period_years=2,
        exit_cap_rate=0.10,
        noi_growth_rate=0.10,
        acquisition_cost_pct=0.02,
        disposition_cost_pct=0.02,
    )
    assert result["acquisition_costs"] == pytest.approx(20_000)
    assert result["initial_equity"] == pytest.approx(1_020_000)
    assert result["annual_schedule"][0]["noi"] == pytest.approx(100_000)
    assert result["annual_schedule"][1]["noi"] == pytest.approx(110_000)
    assert result["exit"]["exit_noi"] == pytest.approx(121_000)
    assert result["exit"]["gross_sale_price"] == pytest.approx(1_210_000)
    assert result["exit"]["disposition_costs"] == pytest.approx(24_200)
    assert result["exit"]["net_sale_proceeds"] == pytest.approx(1_185_800)
    assert result["equity_multiple"] == pytest.approx(1_395_800 / 1_020_000, abs=1e-6)
    assert result["irr"] == pytest.approx(0.1772, abs=0.001)


def test_noi_growth_rate_out_of_bounds_is_rejected():
    with pytest.raises(ValidationError):
        RealEstateInputs(**{**VALID_INPUTS, "noi_growth_rate": 0.50})


def test_negative_acquisition_cost_is_rejected():
    with pytest.raises(ValidationError):
        RealEstateInputs(**{**VALID_INPUTS, "acquisition_cost_pct": -0.01})


def test_ltv_of_100_percent_is_rejected():
    # LTV == 1.0 would make initial equity exactly zero, which blows up cash-on-cash
    # and equity multiple (division by zero) - this must be caught at the input layer.
    with pytest.raises(ValidationError):
        RealEstateInputs(**{**VALID_INPUTS, "ltv": 1.0})


def test_zero_interest_rate_is_a_valid_input():
    # Interest-free financing is unusual but not invalid, and the amortization math
    # already handles it correctly (see test_amortization_zero_interest_is_straight_line).
    inputs = RealEstateInputs(**{**VALID_INPUTS, "interest_rate": 0.0})
    assert inputs.interest_rate == 0.0


def test_sensitivity_center_cell_matches_base_case_irr_exactly():
    # The center of the grid (delta 0, 0 -> the base case's own exit cap rate and hold
    # period) must reproduce the exact same IRR as calling underwrite_real_estate directly
    # with those same inputs - it's the same function under the hood, so any drift here
    # would mean the grid is silently testing different assumptions than what's displayed
    # as the headline result.
    base_result = underwrite_real_estate(**VALID_INPUTS)
    sensitivity = real_estate_sensitivity(**VALID_INPUTS)

    assert VALID_INPUTS["hold_period_years"] in sensitivity["hold_periods"]
    center_col = sensitivity["hold_periods"].index(VALID_INPUTS["hold_period_years"])

    center_row = next(
        row
        for row in sensitivity["rows"]
        if row["exit_cap_rate"] == pytest.approx(VALID_INPUTS["exit_cap_rate"])
    )
    assert center_row["irr_by_hold_period"][center_col] == pytest.approx(base_result["irr"])


def test_sensitivity_hold_period_never_drops_below_one_year():
    # Base hold period of 1 year: the -2 and -1 deltas would go to -1 and 0, which must
    # clamp to 1 instead of producing an invalid (or duplicate) hold period.
    sensitivity = real_estate_sensitivity(**{**VALID_INPUTS, "hold_period_years": 1})
    assert min(sensitivity["hold_periods"]) == 1
    assert len(sensitivity["hold_periods"]) == len(set(sensitivity["hold_periods"]))


def test_sensitivity_grid_has_five_by_five_shape_in_the_typical_case():
    # Away from any clamping edge cases, the grid should be the full 5 cap rates x 5 hold
    # periods.
    sensitivity = real_estate_sensitivity(**VALID_INPUTS)
    assert len(sensitivity["rows"]) == 5
    assert len(sensitivity["hold_periods"]) == 5
    assert all(len(row["irr_by_hold_period"]) == 5 for row in sensitivity["rows"])


def test_sensitivity_hold_period_never_exceeds_loan_maturity():
    # Loan maturity equal to the base hold period: the +1/+2 deltas would want to test
    # hold periods beyond loan maturity, which must never happen - the grid must never
    # silently model financing that has contractually matured.
    sensitivity = real_estate_sensitivity(
        **{**VALID_INPUTS, "loan_maturity_years": VALID_INPUTS["hold_period_years"]}
    )
    assert max(sensitivity["hold_periods"]) == VALID_INPUTS["hold_period_years"]


def test_dscr_hand_computed():
    assert dscr(100_000, 80_000) == pytest.approx(1.25)


def test_dscr_is_none_when_debt_service_is_zero():
    # Undefined once the loan is paid off (or there was never any debt service to begin
    # with) - there's nothing to cover, so a ratio doesn't mean anything.
    assert dscr(100_000, 0) is None


def test_debt_yield_hand_computed():
    assert debt_yield(80_000, 1_000_000) == pytest.approx(0.08)


def test_debt_yield_is_none_when_loan_amount_is_zero():
    assert debt_yield(80_000, 0) is None


def test_underwrite_dscr_is_none_in_years_after_loan_payoff():
    # Amortization (5 years) shorter than the hold period (7 years): the loan pays off
    # mid-hold, so the annual_schedule's own dscr field - not just the standalone dscr()
    # helper in isolation - must show None for the years with zero debt service, while
    # Year 1 (which still has real debt service) shows a normal defined value.
    result = underwrite_real_estate(
        purchase_price=10_000_000,
        going_in_noi=650_000,
        ltv=0.65,
        interest_rate=0.06,
        amortization_years=5,
        loan_maturity_years=10,
        hold_period_years=7,
        exit_cap_rate=0.0675,
        noi_growth_rate=0.03,
        acquisition_cost_pct=0.015,
        disposition_cost_pct=0.02,
    )
    schedule = result["annual_schedule"]
    assert schedule[0]["dscr"] is not None
    assert result["going_in_dscr"] is not None
    assert schedule[5]["debt_service"] == pytest.approx(0.0)
    assert schedule[5]["dscr"] is None
    assert schedule[6]["dscr"] is None


def test_dscr_and_debt_yield_hand_computed_in_full_underwrite():
    # 0% interest makes debt service exactly loan_amount / amortization_years
    # (straight-line), so DSCR and debt yield both come out to clean, hand-checkable
    # numbers rather than needing amortization math to verify by hand.
    # Loan = 1,000,000 * 0.5 = 500,000; annual debt service = 500,000 / 25 = 20,000
    # DSCR = 100,000 / 20,000 = 5.0
    # Debt yield = 100,000 / 500,000 = 0.20
    result = underwrite_real_estate(
        purchase_price=1_000_000,
        going_in_noi=100_000,
        ltv=0.5,
        interest_rate=0.0,
        amortization_years=25,
        loan_maturity_years=25,
        hold_period_years=1,
        exit_cap_rate=0.10,
        noi_growth_rate=0.0,
        acquisition_cost_pct=0.0,
        disposition_cost_pct=0.0,
    )
    assert result["going_in_dscr"] == pytest.approx(5.0)
    assert result["annual_schedule"][0]["dscr"] == pytest.approx(5.0)
    assert result["debt_yield"] == pytest.approx(0.20)


def test_loan_maturity_shorter_than_hold_period_is_rejected():
    with pytest.raises(ValidationError):
        RealEstateInputs(
            **{**VALID_INPUTS, "loan_maturity_years": VALID_INPUTS["hold_period_years"] - 1}
        )


def test_loan_maturity_equal_to_hold_period_is_valid():
    # Inclusive boundary: the loan maturing in the same year as exit is fine, since the
    # sale proceeds pay off the loan anyway - that's already how exit works today.
    inputs = RealEstateInputs(
        **{**VALID_INPUTS, "loan_maturity_years": VALID_INPUTS["hold_period_years"]}
    )
    assert inputs.loan_maturity_years == VALID_INPUTS["hold_period_years"]
