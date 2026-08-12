"""DCF valuation calculations (V1 scope).

Modeling assumptions, explicit by design:
- Explicit-period FCF is projected from a single base-year figure at one flat annual growth
  rate (no revenue/margin/CapEx build-up — deferred, see CLAUDE.md Section 3).
- Terminal value uses the Gordon Growth (perpetuity growth) method, since WACC and terminal
  growth are given as direct inputs rather than an exit multiple.
- Cash flows are discounted using the end-of-year convention: year t's cash flow is discounted
  by (1 + WACC)^t, not a mid-year-adjusted exponent.
"""


def project_fcf(base_year_fcf, growth_rate, forecast_years):
    return [base_year_fcf * (1 + growth_rate) ** t for t in range(1, forecast_years + 1)]


def discount_factor(rate, period):
    return 1 / (1 + rate) ** period


def present_value(cash_flow, rate, period):
    return cash_flow * discount_factor(rate, period)


def terminal_value(final_year_fcf, wacc, terminal_growth_rate):
    return final_year_fcf * (1 + terminal_growth_rate) / (wacc - terminal_growth_rate)


def enterprise_value(pv_fcfs, pv_terminal_value):
    return sum(pv_fcfs) + pv_terminal_value


def equity_value(enterprise_value_, net_debt):
    return enterprise_value_ - net_debt


def value_per_share(equity_value_, diluted_shares_outstanding):
    return equity_value_ / diluted_shares_outstanding


def run_dcf(
    base_year_fcf,
    fcf_growth_rate,
    forecast_years,
    wacc,
    terminal_growth_rate,
    net_debt,
    diluted_shares_outstanding,
):
    fcfs = project_fcf(base_year_fcf, fcf_growth_rate, forecast_years)

    forecast = []
    pv_fcfs = []
    for t, fcf in enumerate(fcfs, start=1):
        df = discount_factor(wacc, t)
        pv = fcf * df
        pv_fcfs.append(pv)
        forecast.append(
            {
                "year": t,
                "fcf": round(fcf, 2),
                "discount_factor": round(df, 6),
                "present_value": round(pv, 2),
            }
        )

    tv = terminal_value(fcfs[-1], wacc, terminal_growth_rate)
    pv_tv = present_value(tv, wacc, forecast_years)

    ev = enterprise_value(pv_fcfs, pv_tv)
    eq_value = equity_value(ev, net_debt)
    per_share = value_per_share(eq_value, diluted_shares_outstanding)

    return {
        "forecast": forecast,
        "terminal_value": round(tv, 2),
        "pv_terminal_value": round(pv_tv, 2),
        "enterprise_value": round(ev, 2),
        "equity_value": round(eq_value, 2),
        "value_per_share": round(per_share, 2),
    }
