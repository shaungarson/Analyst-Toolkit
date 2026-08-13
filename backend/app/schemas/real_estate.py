from pydantic import BaseModel, Field


class RealEstateInputs(BaseModel):
    purchase_price: float = Field(gt=0)
    going_in_noi: float = Field(gt=0)
    ltv: float = Field(gt=0, lt=1, description="Loan-to-value, e.g. 0.65 for 65%. Must be below 1 (100%) so initial equity is never zero.")
    interest_rate: float = Field(ge=0, le=1, description="Annual rate, e.g. 0.06 for 6%. 0 is a valid input (interest-free financing).")
    amortization_years: int = Field(gt=0, le=50)
    hold_period_years: int = Field(gt=0, le=30)
    exit_cap_rate: float = Field(gt=0, le=1, description="e.g. 0.065 for 6.5%")
    noi_growth_rate: float = Field(
        ge=-0.10, le=0.15, description="Flat annual NOI growth rate applied from Year 2 onward"
    )
    acquisition_cost_pct: float = Field(
        ge=0, le=0.10, description="Acquisition costs as a % of purchase price, e.g. 0.02 for 2%"
    )
    disposition_cost_pct: float = Field(
        ge=0, le=0.10, description="Disposition costs as a % of gross sale price, e.g. 0.02 for 2%"
    )


class AnnualScheduleYear(BaseModel):
    year: int
    noi: float
    interest: float
    principal: float
    debt_service: float
    cash_flow_to_equity: float
    ending_loan_balance: float


class ExitSummary(BaseModel):
    exit_noi: float
    gross_sale_price: float
    disposition_costs: float
    remaining_loan_balance: float
    net_sale_proceeds: float


class RealEstateResults(BaseModel):
    going_in_cap_rate: float
    loan_amount: float
    acquisition_costs: float
    initial_equity: float
    annual_debt_service: float
    cash_on_cash_year_1: float
    annual_schedule: list[AnnualScheduleYear]
    exit: ExitSummary
    irr: float | None
    equity_multiple: float


class SensitivityRow(BaseModel):
    exit_cap_rate: float
    irr_by_hold_period: list[float | None]


class SensitivityResults(BaseModel):
    hold_periods: list[int]
    rows: list[SensitivityRow]
