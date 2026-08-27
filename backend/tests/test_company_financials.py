import pytest

from app.calculations.company_financials import (
    change_in_nwc,
    effective_tax_rate,
    net_debt,
    net_working_capital,
    unlevered_fcf,
)


def test_effective_tax_rate_hand_computed():
    # 21,000 tax on 100,000 pretax income = 21% effective rate.
    assert effective_tax_rate(21_000, 100_000) == pytest.approx(0.21)


def test_effective_tax_rate_undefined_when_pretax_income_not_positive():
    # A breakeven or loss-making year has no meaningful effective rate - must not divide
    # by zero or return a nonsensical negative/inflated rate.
    assert effective_tax_rate(1_000, 0) is None
    assert effective_tax_rate(-500, -10_000) is None


def test_effective_tax_rate_undefined_when_inputs_missing():
    assert effective_tax_rate(None, 100_000) is None
    assert effective_tax_rate(21_000, None) is None


def test_net_working_capital_hand_computed():
    # Current assets 50,000 (of which 10,000 is cash) and current liabilities 30,000 (of
    # which 5,000 is current debt): NWC = (50,000 - 10,000) - (30,000 - 5,000) = 15,000.
    assert net_working_capital(50_000, 10_000, 30_000, 5_000) == pytest.approx(15_000)


def test_net_working_capital_undefined_when_any_input_missing():
    assert net_working_capital(None, 10_000, 30_000, 5_000) is None
    assert net_working_capital(50_000, 10_000, 30_000, None) is None


def test_change_in_nwc_hand_computed():
    # NWC grew from 15,000 to 18,000 - a 3,000 increase, which consumes cash.
    assert change_in_nwc(18_000, 15_000) == pytest.approx(3_000)


def test_change_in_nwc_undefined_when_either_period_missing():
    assert change_in_nwc(18_000, None) is None
    assert change_in_nwc(None, 15_000) is None


def test_unlevered_fcf_hand_computed():
    # EBIT 100,000 at a 25% tax rate: NOPAT = 75,000.
    # + D&A 20,000 - CapEx 30,000 - NWC increase 5,000 = 60,000.
    result = unlevered_fcf(
        ebit=100_000,
        tax_rate=0.25,
        depreciation_and_amortization=20_000,
        capital_expenditures=30_000,
        nwc_change=5_000,
    )
    assert result == pytest.approx(60_000)


def test_unlevered_fcf_undefined_when_any_component_missing():
    # A missing D&A figure must not silently be treated as zero D&A - the whole result
    # becomes undefined instead of quietly wrong.
    assert (
        unlevered_fcf(
            ebit=100_000,
            tax_rate=0.25,
            depreciation_and_amortization=None,
            capital_expenditures=30_000,
            nwc_change=5_000,
        )
        is None
    )


def test_net_debt_hand_computed():
    assert net_debt(total_debt=500_000, cash=120_000) == pytest.approx(380_000)


def test_net_debt_negative_when_net_cash():
    # More cash than debt -> negative net debt, consistent with the existing DCF form's
    # own net_debt convention ("negative if net cash").
    assert net_debt(total_debt=50_000, cash=200_000) == pytest.approx(-150_000)


def test_net_debt_undefined_when_inputs_missing():
    assert net_debt(None, 120_000) is None
    assert net_debt(500_000, None) is None
