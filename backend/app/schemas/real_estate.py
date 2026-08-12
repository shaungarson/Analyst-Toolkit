from pydantic import BaseModel, Field


class RealEstateInputs(BaseModel):
    purchase_price: float = Field(gt=0)
    going_in_noi: float = Field(gt=0)
    ltv: float = Field(gt=0, le=1, description="Loan-to-value, e.g. 0.65 for 65%")
    interest_rate: float = Field(gt=0, le=1, description="Annual rate, e.g. 0.06 for 6%")
    amortization_years: int = Field(gt=0, le=50)
    hold_period_years: int = Field(gt=0, le=30)
    exit_cap_rate: float = Field(gt=0, le=1, description="e.g. 0.065 for 6.5%")


class AmortizationYear(BaseModel):
    year: int
    beginning_balance: float
    interest: float
    principal: float
    debt_service: float
    ending_balance: float


class ExitSummary(BaseModel):
    exit_noi: float
    gross_sale_price: float
    remaining_loan_balance: float
    net_sale_proceeds: float


class RealEstateResults(BaseModel):
    going_in_cap_rate: float
    loan_amount: float
    initial_equity: float
    annual_debt_service: float
    cash_on_cash_year_1: float
    amortization_schedule: list[AmortizationYear]
    annual_cash_flows: list[float]
    exit: ExitSummary
    irr: float | None
    equity_multiple: float
