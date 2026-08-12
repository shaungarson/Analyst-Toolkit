import pytest

from app.calculations.real_estate import (
    amortization_schedule,
    cap_rate,
    cash_on_cash,
    equity_multiple,
    exit_value,
    irr,
    underwrite_real_estate,
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


def test_underwrite_no_debt_matches_hand_computed_irr_and_multiple():
    # With LTV=0 there's no debt: initial equity == purchase price, and the only
    # cash flows are flat NOI each year plus the exit sale proceeds (no costs modeled).
    # Purchase $1,000,000, NOI $80,000/yr, 1-year hold, exit cap rate == going-in cap
    # rate (8%) with flat NOI -> exit price == purchase price == $1,000,000.
    # Equity cash flows: -1,000,000 now, +1,080,000 in year 1 -> IRR = 8% exactly.
    result = underwrite_real_estate(
        purchase_price=1_000_000,
        going_in_noi=80_000,
        ltv=0.0,
        interest_rate=0.06,
        amortization_years=30,
        hold_period_years=1,
        exit_cap_rate=0.08,
    )
    assert result["initial_equity"] == pytest.approx(1_000_000)
    assert result["going_in_cap_rate"] == pytest.approx(0.08)
    assert result["exit"]["gross_sale_price"] == pytest.approx(1_000_000)
    assert result["irr"] == pytest.approx(0.08, abs=1e-6)
    assert result["equity_multiple"] == pytest.approx(1.08, abs=1e-6)
