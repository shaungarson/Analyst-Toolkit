import pytest
from pydantic import ValidationError

from app.calculations.dcf import (
    discount_factor,
    present_value,
    project_fcf,
    run_dcf,
    terminal_value,
)
from app.schemas.dcf import DCFInputs


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


def test_terminal_growth_rate_capped_at_a_realistic_level():
    # A terminal growth rate above ~6% implies the company eventually outgrows the
    # entire economy forever - a well-known DCF red flag, almost always a typo rather
    # than a deliberate assumption. Reject it at the input layer rather than silently
    # producing a wildly inflated valuation.
    with pytest.raises(ValidationError):
        DCFInputs(
            base_year_fcf=100,
            fcf_growth_rate=0.05,
            forecast_years=5,
            wacc=0.50,
            terminal_growth_rate=0.50,
            net_debt=0,
            diluted_shares_outstanding=10,
        )
