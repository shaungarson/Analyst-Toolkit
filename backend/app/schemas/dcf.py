from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.calculations.dcf import gordon_growth_converges


def _check_wacc_terminal_growth(wacc, terminal_growth_rate):
    """Shared by DCFInputs and ReverseDCFInputs so a non-convergent WACC/terminal-growth
    pair is rejected identically regardless of which direction the DCF runs - this is a
    Gordon Growth validity requirement, not something specific to the forward form."""
    if wacc <= terminal_growth_rate:
        raise ValueError("WACC must be greater than the terminal growth rate.")
    if not gordon_growth_converges(wacc, terminal_growth_rate):
        raise ValueError(
            "Terminal growth rate is too far below -100% for the Gordon Growth "
            "perpetuity to converge at this WACC."
        )


class DCFInputs(BaseModel):
    base_year_fcf: float = Field(gt=0, description="Most recent year's unlevered FCF")
    fcf_growth_rate: float = Field(
        description="Flat annual growth during the forecast period. No fixed economic "
        "ceiling or floor is enforced - analyst judgment, not a hard-coded threshold (see "
        "the DCF methodology notes). The arithmetic itself stays well-defined at any value "
        "(unlike terminal growth, this isn't an infinite series), so there is no structural "
        "reason to block it; assumptions that are valid but economically unusual - at or "
        "below -100% - surface as warnings on the result instead. Only overflow or a "
        "non-finite result (an actual computational failure, not a judgment call) is "
        "rejected outright.",
    )
    forecast_years: int = Field(gt=0, le=15)
    wacc: float = Field(gt=0, le=1)
    terminal_growth_rate: float = Field(
        description="Perpetual growth rate. No fixed economic ceiling or floor is enforced "
        "here - analyst judgment varies by currency and long-run economic conditions (see "
        "the DCF methodology notes). What is enforced is Gordon Growth's own mathematical "
        "validity: WACC must exceed terminal growth, and terminal growth can't be so far "
        "below -100% that the underlying perpetuity stops converging. Assumptions that are "
        "valid but structurally unusual surface as warnings on the result instead.",
    )
    net_debt: float = Field(description="Total debt less cash; negative if net cash")
    diluted_shares_outstanding: float = Field(gt=0)

    @model_validator(mode="after")
    def terminal_growth_rate_must_be_valid_for_gordon_growth(self):
        _check_wacc_terminal_growth(self.wacc, self.terminal_growth_rate)
        return self


class ForecastYear(BaseModel):
    year: int
    fcf: float
    discount_factor: float
    present_value: float


class TerminalGrowthWarning(BaseModel):
    id: Literal["narrow_wacc_terminal_growth_spread", "non_positive_terminal_cash_flow"]
    tier: Literal["caution", "high", "extreme"]
    explanation: str


class FCFGrowthWarning(BaseModel):
    id: Literal["zero_explicit_period_fcf", "alternating_sign_explicit_period_fcf"]
    tier: Literal["extreme"]
    explanation: str


class DCFResults(BaseModel):
    forecast: list[ForecastYear]
    terminal_value: float
    pv_terminal_value: float
    enterprise_value: float
    equity_value: float
    value_per_share: float
    terminal_growth_warnings: list[TerminalGrowthWarning] = []
    fcf_growth_warnings: list[FCFGrowthWarning] = []


class DcfSensitivityRow(BaseModel):
    wacc: float
    value_per_share_by_growth: list[float | None]


class DcfSensitivityResults(BaseModel):
    terminal_growth_rates: list[float]
    rows: list[DcfSensitivityRow]


class ReverseDCFInputs(BaseModel):
    target_price: float = Field(gt=0, description="The price to solve the FCF growth rate against")
    base_year_fcf: float = Field(gt=0)
    forecast_years: int = Field(gt=0, le=15)
    wacc: float = Field(gt=0, le=1)
    terminal_growth_rate: float
    net_debt: float
    diluted_shares_outstanding: float = Field(gt=0)

    @model_validator(mode="after")
    def terminal_growth_rate_must_be_valid_for_gordon_growth(self):
        _check_wacc_terminal_growth(self.wacc, self.terminal_growth_rate)
        return self


class ReverseDCFResult(BaseModel):
    status: Literal["solved", "target_below_floor", "not_bracketed"]
    # None unless status == "solved" - never a fabricated number for a failure status.
    implied_fcf_growth_rate: float | None
    reconciled_value_per_share: float | None
    # Always present (cheap closed-form value) even when status == "solved" - the API
    # doesn't hide it, but the frontend only displays it while explaining
    # target_below_floor, not alongside a successful result (see decisions.md).
    floor_value_per_share: float


class DriverYear(BaseModel):
    revenue_growth_rate: float = Field(
        description="This year's revenue growth over the prior year's revenue (base year for "
        "year 1). No fixed ceiling or floor - see driver_warnings for the zero/negative-"
        "revenue scrutiny this can produce instead of a block.",
    )
    ebit_margin: float = Field(description="EBIT as a fraction of this year's revenue.")
    tax_rate: float = Field(
        description="Cash tax rate applied to EBIT only when EBIT is positive - "
        "max(EBIT, 0) x tax_rate, no NOL carryforward modeled. No fixed ceiling or floor; a "
        "rate outside 0%-100% surfaces as a warning, not a block.",
    )
    da_pct_of_revenue: float = Field(description="D&A as a fraction of this year's revenue.")
    capex_pct_of_revenue: float = Field(description="CapEx as a fraction of this year's revenue.")
    nwc_investment_pct_of_revenue_change: float = Field(
        description="Working-capital investment as a fraction of the year-over-year dollar "
        "change in revenue - not a balance-sheet NWC ratio.",
    )


class DriverDCFInputs(BaseModel):
    base_year_revenue: float = Field(
        description="Most recent year's revenue. No fixed floor - see driver_warnings for "
        "the non-positive-base-year-revenue scrutiny this produces instead of a block.",
    )
    driver_years: list[DriverYear] = Field(min_length=1, max_length=15)
    wacc: float = Field(gt=0, le=1)
    terminal_growth_rate: float
    net_debt: float
    diluted_shares_outstanding: float = Field(gt=0)

    @model_validator(mode="after")
    def terminal_growth_rate_must_be_valid_for_gordon_growth(self):
        _check_wacc_terminal_growth(self.wacc, self.terminal_growth_rate)
        return self


class DriverForecastYear(BaseModel):
    year: int
    revenue: float
    ebit: float
    cash_taxes: float
    nopat: float
    da: float
    capex: float
    delta_nwc: float
    fcf: float
    discount_factor: float
    present_value: float


class DriverWarning(BaseModel):
    # 0 denotes the base year (non_positive_base_year_revenue); 1..N a forecast year.
    year: int
    id: Literal[
        "non_positive_base_year_revenue",
        "tax_rate_outside_0_100_percent",
        "negative_da_percent",
        "negative_capex_percent",
        "zero_revenue_lock",
        "negative_revenue",
        "non_positive_terminal_year_fcf",
    ]
    tier: Literal["caution", "high", "extreme"]
    explanation: str


class DriverDCFResults(BaseModel):
    forecast: list[DriverForecastYear]
    terminal_value: float
    pv_terminal_value: float
    enterprise_value: float
    equity_value: float
    value_per_share: float
    terminal_growth_warnings: list[TerminalGrowthWarning] = []
    driver_warnings: list[DriverWarning] = []
