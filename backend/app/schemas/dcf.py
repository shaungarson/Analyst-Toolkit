from pydantic import BaseModel, Field, model_validator


class DCFInputs(BaseModel):
    base_year_fcf: float = Field(gt=0, description="Most recent year's unlevered FCF")
    fcf_growth_rate: float = Field(ge=-0.5, le=1, description="Flat annual growth during the forecast period")
    forecast_years: int = Field(gt=0, le=15)
    wacc: float = Field(gt=0, le=1)
    terminal_growth_rate: float = Field(ge=-0.05, le=1)
    net_debt: float = Field(description="Total debt less cash; negative if net cash")
    diluted_shares_outstanding: float = Field(gt=0)

    @model_validator(mode="after")
    def wacc_must_exceed_terminal_growth(self):
        if self.wacc <= self.terminal_growth_rate:
            raise ValueError("WACC must be greater than the terminal growth rate.")
        return self


class ForecastYear(BaseModel):
    year: int
    fcf: float
    discount_factor: float
    present_value: float


class DCFResults(BaseModel):
    forecast: list[ForecastYear]
    terminal_value: float
    pv_terminal_value: float
    enterprise_value: float
    equity_value: float
    value_per_share: float
