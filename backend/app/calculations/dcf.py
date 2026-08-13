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


# Fixed deltas around the base case - not user-configurable, same reasoning as the real
# estate sensitivity grid: a single "just show me the risk" view, not more inputs to fill in.
WACC_DELTAS = [-0.01, -0.005, 0.0, 0.005, 0.01]
TERMINAL_GROWTH_DELTAS = [-0.01, -0.005, 0.0, 0.005, 0.01]


def dcf_sensitivity(
    base_year_fcf,
    fcf_growth_rate,
    forecast_years,
    wacc,
    terminal_growth_rate,
    net_debt,
    diluted_shares_outstanding,
):
    """Value per share across a grid of WACC x terminal growth rate, holding everything
    else at the base-case values. The center cell (delta 0, 0) always matches the base
    case's own value per share exactly, since it's computed by the same run_dcf function.

    Combinations where WACC <= terminal growth are mathematically invalid (the Gordon
    Growth formula blows up or goes negative) and are marked null rather than computed.
    """
    wacc_values = sorted({round(wacc + d, 6) for d in WACC_DELTAS if 0 < wacc + d <= 1})
    growth_values = sorted(
        {
            round(terminal_growth_rate + d, 6)
            for d in TERMINAL_GROWTH_DELTAS
            if -0.05 <= terminal_growth_rate + d <= 0.06
        }
    )

    rows = []
    for w in wacc_values:
        value_per_share_by_growth = []
        for g in growth_values:
            if w <= g:
                value_per_share_by_growth.append(None)
                continue
            result = run_dcf(
                base_year_fcf=base_year_fcf,
                fcf_growth_rate=fcf_growth_rate,
                forecast_years=forecast_years,
                wacc=w,
                terminal_growth_rate=g,
                net_debt=net_debt,
                diluted_shares_outstanding=diluted_shares_outstanding,
            )
            value_per_share_by_growth.append(result["value_per_share"])
        rows.append({"wacc": w, "value_per_share_by_growth": value_per_share_by_growth})

    return {"terminal_growth_rates": growth_values, "rows": rows}
