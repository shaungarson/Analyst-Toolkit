from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.calculations.dcf import gordon_growth_converges


class DCFInputs(BaseModel):
    base_year_fcf: float = Field(gt=0, description="Most recent year's unlevered FCF")
    fcf_growth_rate: float = Field(ge=-0.5, le=1, description="Flat annual growth during the forecast period")
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
        if self.wacc <= self.terminal_growth_rate:
            raise ValueError("WACC must be greater than the terminal growth rate.")
        if not gordon_growth_converges(self.wacc, self.terminal_growth_rate):
            raise ValueError(
                "Terminal growth rate is too far below -100% for the Gordon Growth "
                "perpetuity to converge at this WACC."
            )
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


class DCFResults(BaseModel):
    forecast: list[ForecastYear]
    terminal_value: float
    pv_terminal_value: float
    enterprise_value: float
    equity_value: float
    value_per_share: float
    terminal_growth_warnings: list[TerminalGrowthWarning] = []


class DcfSensitivityRow(BaseModel):
    wacc: float
    value_per_share_by_growth: list[float | None]


class DcfSensitivityResults(BaseModel):
    terminal_growth_rates: list[float]
    rows: list[DcfSensitivityRow]
