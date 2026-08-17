"""Real estate underwriting calculations (multi-year V2 scope).

Modeling assumptions, explicit by design:
- NOI grows at a single flat annual rate for the whole hold period, starting in Year 2
  (Year 1 is the going-in NOI, unescalated — that's what "going-in" means and what sizes the
  going-in cap rate). No per-lease/rollover modeling, no separate expense-growth assumption.
- Debt amortizes with level monthly payments and monthly compounding (standard commercial
  mortgage convention), rolled up into annual totals. Growth doesn't affect the debt schedule.
- Loan maturity is a separate concept from the amortization period (standard CRE convention,
  e.g. "5-year term, 30-year am"). Loan maturity must be at least as long as the hold period:
  refinancing, extensions, and balloon payoffs beyond the original loan term are not modeled,
  so the calculation engine only ever computes cash flows under financing that is still
  contractually in place. This is enforced at the input layer (see schemas/real_estate.py),
  not inside these functions.
- DSCR = NOI / debt service, computed per year (undefined once the loan is paid off, i.e.
  once debt service reaches zero). Debt yield = going-in NOI / original loan amount, a Day-1
  metric only — not a per-year figure, matching standard lender-underwriting convention.
- Acquisition and disposition costs are single flat percentages (of purchase price and gross
  sale price respectively), not itemized line items.
- Exit value is based on NOI one year past the end of the hold period (the income the buyer
  is purchasing), not the flat going-in NOI — the standard convention now that growth is
  modeled explicitly.
- IRR is computed on annual, end-of-year equity cash flows (standard underwriting convention).
"""

import numpy_financial as npf


def cap_rate(noi, price):
    return noi / price


def project_noi(going_in_noi, growth_rate, hold_period_years):
    """Year 1 = going-in NOI unescalated; growth applies from Year 2 onward."""
    return [going_in_noi * (1 + growth_rate) ** t for t in range(hold_period_years)]


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


def dscr(noi, debt_service):
    """NOI / debt service. Undefined (None) once debt service reaches zero, e.g. after the
    loan is fully amortized."""
    return noi / debt_service if debt_service > 0 else None


def debt_yield(noi, loan_amount):
    """Going-in NOI / original loan amount. Guarded against a zero loan amount for the
    function's own robustness (e.g. an all-cash deal called directly), even though the
    current input schema never actually allows LTV to be zero."""
    return noi / loan_amount if loan_amount > 0 else None


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
    loan_maturity_years,
    hold_period_years,
    exit_cap_rate,
    noi_growth_rate,
    acquisition_cost_pct,
    disposition_cost_pct,
):
    loan_amount = round(purchase_price * ltv, 2)
    acquisition_costs = round(purchase_price * acquisition_cost_pct, 2)
    initial_equity = round(purchase_price - loan_amount + acquisition_costs, 2)

    debt_schedule, _ = amortization_schedule(
        loan_amount, interest_rate, amortization_years, hold_period_years
    )
    noi_by_year = project_noi(going_in_noi, noi_growth_rate, hold_period_years)

    annual_schedule = []
    annual_cash_flows = []
    for debt_row, noi in zip(debt_schedule, noi_by_year):
        noi = round(noi, 2)
        cf = round(noi - debt_row["debt_service"], 2)
        annual_cash_flows.append(cf)
        annual_schedule.append(
            {
                "year": debt_row["year"],
                "noi": noi,
                "interest": debt_row["interest"],
                "principal": debt_row["principal"],
                "debt_service": debt_row["debt_service"],
                "dscr": dscr(noi, debt_row["debt_service"]),
                "cash_flow_to_equity": cf,
                "ending_loan_balance": debt_row["ending_balance"],
            }
        )

    exit_noi = round(going_in_noi * (1 + noi_growth_rate) ** hold_period_years, 2)
    gross_sale_price = round(exit_value(exit_noi, exit_cap_rate), 2)
    disposition_costs = round(gross_sale_price * disposition_cost_pct, 2)
    remaining_loan_balance = annual_schedule[-1]["ending_loan_balance"]
    net_sale_proceeds = round(gross_sale_price - disposition_costs - remaining_loan_balance, 2)

    equity_cash_flows = [-initial_equity]
    for i, cf in enumerate(annual_cash_flows):
        if i == len(annual_cash_flows) - 1:
            cf = round(cf + net_sale_proceeds, 2)
        equity_cash_flows.append(cf)

    total_distributions = round(sum(annual_cash_flows) + net_sale_proceeds, 2)

    return {
        "going_in_cap_rate": cap_rate(going_in_noi, purchase_price),
        "loan_amount": loan_amount,
        "acquisition_costs": acquisition_costs,
        "initial_equity": initial_equity,
        "annual_debt_service": annual_schedule[0]["debt_service"] if annual_schedule else 0.0,
        "going_in_dscr": annual_schedule[0]["dscr"] if annual_schedule else None,
        "debt_yield": debt_yield(going_in_noi, loan_amount),
        "cash_on_cash_year_1": cash_on_cash(annual_cash_flows[0], initial_equity),
        "annual_schedule": annual_schedule,
        "exit": {
            "exit_noi": exit_noi,
            "gross_sale_price": gross_sale_price,
            "disposition_costs": disposition_costs,
            "remaining_loan_balance": remaining_loan_balance,
            "net_sale_proceeds": net_sale_proceeds,
        },
        "irr": irr(equity_cash_flows),
        "equity_multiple": equity_multiple(total_distributions, initial_equity),
    }


# Fixed deltas around the base case - not user-configurable, to keep the sensitivity table
# a single "just show me the risk" view rather than another set of inputs to fill in.
CAP_RATE_DELTAS = [-0.01, -0.005, 0.0, 0.005, 0.01]
HOLD_PERIOD_DELTAS = [-2, -1, 0, 1, 2]


def _sensitivity_grid_cells(
    purchase_price,
    going_in_noi,
    ltv,
    interest_rate,
    amortization_years,
    loan_maturity_years,
    hold_period_years,
    exit_cap_rate,
    noi_growth_rate,
    acquisition_cost_pct,
    disposition_cost_pct,
):
    """Runs underwrite_real_estate once across every exit-cap-rate x hold-period
    combination in the sensitivity grid, returning full per-cell results (not just IRR) so
    any consumer - the public IRR grid below, deterministic risk-flag evaluation - can pull
    the metrics it needs without a second implementation of this loop.

    Hold periods tested are capped at loan_maturity_years, same as the base case itself -
    the grid must never silently test a hold period that would run past loan maturity.
    """
    hold_periods = sorted(
        {min(loan_maturity_years, max(1, hold_period_years + d)) for d in HOLD_PERIOD_DELTAS}
    )
    exit_cap_rates = sorted(
        {round(exit_cap_rate + d, 6) for d in CAP_RATE_DELTAS if exit_cap_rate + d > 0}
    )

    cells = []
    for cap in exit_cap_rates:
        for hold in hold_periods:
            result = underwrite_real_estate(
                purchase_price=purchase_price,
                going_in_noi=going_in_noi,
                ltv=ltv,
                interest_rate=interest_rate,
                amortization_years=amortization_years,
                loan_maturity_years=loan_maturity_years,
                hold_period_years=hold,
                exit_cap_rate=cap,
                noi_growth_rate=noi_growth_rate,
                acquisition_cost_pct=acquisition_cost_pct,
                disposition_cost_pct=disposition_cost_pct,
            )
            cells.append(
                {
                    "exit_cap_rate": cap,
                    "hold_period_years": hold,
                    "irr": result["irr"],
                    "equity_multiple": result["equity_multiple"],
                }
            )

    return hold_periods, exit_cap_rates, cells


def real_estate_sensitivity(
    purchase_price,
    going_in_noi,
    ltv,
    interest_rate,
    amortization_years,
    loan_maturity_years,
    hold_period_years,
    exit_cap_rate,
    noi_growth_rate,
    acquisition_cost_pct,
    disposition_cost_pct,
):
    """IRR across a grid of exit cap rate x hold period, holding everything else at the
    base-case values. The center cell (delta 0, 0) always matches the base case's own IRR
    exactly, since it's computed by the same underwrite_real_estate function.

    Public response shape is unchanged - this just reads the "irr" field out of the shared
    per-cell computation in _sensitivity_grid_cells.
    """
    hold_periods, exit_cap_rates, cells = _sensitivity_grid_cells(
        purchase_price=purchase_price,
        going_in_noi=going_in_noi,
        ltv=ltv,
        interest_rate=interest_rate,
        amortization_years=amortization_years,
        loan_maturity_years=loan_maturity_years,
        hold_period_years=hold_period_years,
        exit_cap_rate=exit_cap_rate,
        noi_growth_rate=noi_growth_rate,
        acquisition_cost_pct=acquisition_cost_pct,
        disposition_cost_pct=disposition_cost_pct,
    )

    rows = []
    for cap in exit_cap_rates:
        irr_by_hold_period = [cell["irr"] for cell in cells if cell["exit_cap_rate"] == cap]
        rows.append({"exit_cap_rate": cap, "irr_by_hold_period": irr_by_hold_period})

    return {"hold_periods": hold_periods, "rows": rows}
