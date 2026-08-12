"""Real estate underwriting calculations (V1 scope).

Modeling assumptions, explicit by design:
- NOI is held flat over the hold period (no rent/NOI growth — deferred, see CLAUDE.md Section 3).
- Debt amortizes with level monthly payments and monthly compounding (standard commercial
  mortgage convention), rolled up into annual totals for the schedule and cash flows.
- No acquisition or disposition costs are modeled (deferred).
- Exit value uses the same flat NOI as going-in NOI, capitalized at the exit cap rate.
- IRR is computed on annual, end-of-year equity cash flows (standard underwriting convention).
"""

import numpy_financial as npf


def cap_rate(noi, price):
    return noi / price


def amortization_schedule(loan_amount, annual_rate, amortization_years, hold_period_years):
    """Monthly-pay, monthly-compounding amortization, rolled up into annual rows.

    Returns (schedule, annual_debt_service) where schedule has one row per year of the
    hold period (loan may pay off before the hold period ends, in which case later rows
    show zero debt service and zero balance).
    """
    monthly_rate = annual_rate / 12
    n_payments = amortization_years * 12

    if loan_amount == 0:
        monthly_payment = 0.0
    elif monthly_rate == 0:
        monthly_payment = loan_amount / n_payments
    else:
        monthly_payment = (
            loan_amount
            * (monthly_rate * (1 + monthly_rate) ** n_payments)
            / ((1 + monthly_rate) ** n_payments - 1)
        )

    balance = loan_amount
    schedule = []
    for year in range(1, hold_period_years + 1):
        beginning_balance = balance
        year_interest = 0.0
        year_principal = 0.0
        for _ in range(12):
            if year > amortization_years or balance <= 0:
                break
            interest = balance * monthly_rate
            principal = min(monthly_payment - interest, balance)
            balance -= principal
            year_interest += interest
            year_principal += principal
        schedule.append(
            {
                "year": year,
                "beginning_balance": round(beginning_balance, 2),
                "interest": round(year_interest, 2),
                "principal": round(year_principal, 2),
                "debt_service": round(year_interest + year_principal, 2),
                "ending_balance": round(balance, 2),
            }
        )

    annual_debt_service = round(monthly_payment * 12, 2)
    return schedule, annual_debt_service


def cash_on_cash(annual_cash_flow, initial_equity):
    return annual_cash_flow / initial_equity


def equity_multiple(total_distributions, initial_equity):
    return total_distributions / initial_equity


def exit_value(exit_noi, exit_cap_rate):
    return exit_noi / exit_cap_rate


def irr(cash_flows):
    result = npf.irr(cash_flows)
    return None if result is None or result != result else float(result)  # NaN check


def underwrite_real_estate(
    purchase_price,
    going_in_noi,
    ltv,
    interest_rate,
    amortization_years,
    hold_period_years,
    exit_cap_rate,
):
    loan_amount = round(purchase_price * ltv, 2)
    initial_equity = round(purchase_price - loan_amount, 2)

    schedule, _ = amortization_schedule(
        loan_amount, interest_rate, amortization_years, hold_period_years
    )

    annual_cash_flows = [round(going_in_noi - row["debt_service"], 2) for row in schedule]

    exit_noi = going_in_noi
    gross_sale_price = round(exit_value(exit_noi, exit_cap_rate), 2)
    remaining_loan_balance = schedule[-1]["ending_balance"]
    net_sale_proceeds = round(gross_sale_price - remaining_loan_balance, 2)

    equity_cash_flows = [-initial_equity]
    for i, cf in enumerate(annual_cash_flows):
        if i == len(annual_cash_flows) - 1:
            cf = round(cf + net_sale_proceeds, 2)
        equity_cash_flows.append(cf)

    total_distributions = round(sum(annual_cash_flows) + net_sale_proceeds, 2)

    return {
        "going_in_cap_rate": cap_rate(going_in_noi, purchase_price),
        "loan_amount": loan_amount,
        "initial_equity": initial_equity,
        "annual_debt_service": schedule[0]["debt_service"] if schedule else 0.0,
        "cash_on_cash_year_1": cash_on_cash(annual_cash_flows[0], initial_equity),
        "amortization_schedule": schedule,
        "annual_cash_flows": annual_cash_flows,
        "exit": {
            "exit_noi": exit_noi,
            "gross_sale_price": gross_sale_price,
            "remaining_loan_balance": remaining_loan_balance,
            "net_sale_proceeds": net_sale_proceeds,
        },
        "irr": irr(equity_cash_flows),
        "equity_multiple": equity_multiple(total_distributions, initial_equity),
    }
