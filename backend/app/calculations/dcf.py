"""DCF valuation calculations (V1 scope).

Modeling assumptions, explicit by design:
- Explicit-period FCF is projected from a single base-year figure at one flat annual growth
  rate (no revenue/margin/CapEx build-up — deferred, see CLAUDE.md Section 3).
- Terminal value uses the Gordon Growth (perpetuity growth) method, since WACC and terminal
  growth are given as direct inputs rather than an exit multiple.
- Cash flows are discounted using the end-of-year convention: year t's cash flow is discounted
  by (1 + WACC)^t, not a mid-year-adjusted exponent.
"""

import math


class NonFiniteResultError(Exception):
    """Raised when a DCF computation would produce a non-finite (infinite or NaN) result.

    Not a validation failure of any single input - overflow depends on base_year_fcf,
    growth rate, forecast length, net debt, and share count together (a large enough
    base_year_fcf alone can push toward the float ceiling with zero growth involved), so no
    single field's bound can guarantee this on its own. Checked at the actual computation
    instead: project_fcf's exponentiation raises Python's own OverflowError on overflow
    (verified - it does not silently return inf), while plain multiplication/addition/
    subtraction elsewhere in this module does overflow silently to inf/nan rather than
    raising, so every headline output is also explicitly checked with math.isfinite().
    """


def _require_finite(value, label):
    if not math.isfinite(value):
        raise NonFiniteResultError(
            f"This combination of inputs produces a {label} that can't be computed safely "
            "(the result is too large or otherwise not a finite number). Try a smaller base "
            "year FCF, a less extreme growth rate, or fewer forecast years."
        )
    return value


def project_fcf(base_year_fcf, growth_rate, forecast_years):
    try:
        return [base_year_fcf * (1 + growth_rate) ** t for t in range(1, forecast_years + 1)]
    except OverflowError as exc:
        raise NonFiniteResultError(
            "This combination of base year FCF, growth rate, and forecast length can't be "
            "computed safely (the projected cash flow is too large to represent). Try a "
            "smaller base year FCF, a less extreme growth rate, or fewer forecast years."
        ) from exc


def discount_factor(rate, period):
    return 1 / (1 + rate) ** period


def present_value(cash_flow, rate, period):
    return cash_flow * discount_factor(rate, period)


def terminal_value(final_year_fcf, wacc, terminal_growth_rate):
    return final_year_fcf * (1 + terminal_growth_rate) / (wacc - terminal_growth_rate)


def gordon_growth_converges(wacc, terminal_growth_rate):
    """Whether the Gordon Growth closed form actually represents the infinite growing
    perpetuity it's derived from, not just whether its arithmetic avoids a divide-by-zero.

    The closed form is the sum of a geometric series with common ratio
    (1 + g) / (1 + WACC); that series only converges when the ratio's magnitude is below 1,
    which solves to -(2 + WACC) < g < WACC. Outside that range (always on the low side in
    practice, since g >= WACC is already the more obviously-broken case) the formula still
    returns a finite-looking number, but it's not the present value of anything - it's
    algebra applied outside its domain. This is the single source of truth for that domain:
    both the hard input validation (schemas/dcf.py) and the sensitivity grid below call this
    rather than re-deriving the boundary, so the two can't silently drift apart.
    """
    return abs((1 + terminal_growth_rate) / (1 + wacc)) < 1


# Spread thresholds are diagnostics about the formula's own sensitivity, not claims that an
# assumption is economically wrong: terminal value scales with 1/(WACC - g), so its
# sensitivity to a small move in either input scales with 1/(WACC - g)^2 - these tiers track
# that curve (a 50bp WACC move already swings terminal value ~20% at a 3pp spread, ~100% at
# 1pp), not an opinion about what WACC or terminal growth "should" be.
TGR_SPREAD_CAUTION = 0.03
TGR_SPREAD_HIGH = 0.02
TGR_SPREAD_EXTREME = 0.01


def _narrow_spread_warning(wacc, terminal_growth_rate):
    spread = wacc - terminal_growth_rate
    if spread < TGR_SPREAD_EXTREME:
        tier = "extreme"
    elif spread < TGR_SPREAD_HIGH:
        tier = "high"
    elif spread < TGR_SPREAD_CAUTION:
        tier = "caution"
    else:
        return None
    return {
        "id": "narrow_wacc_terminal_growth_spread",
        "tier": tier,
        "explanation": (
            f"WACC and terminal growth are only {spread:.1%} apart. Terminal value already "
            "typically makes up most of a DCF's enterprise value, and its sensitivity to "
            "small changes in WACC or terminal growth scales with the inverse square of "
            "this spread - a narrow gap amplifies the effect of a figure that already "
            "dominates the valuation. This is a statement about formula sensitivity, not "
            "about whether the underlying assumptions are reasonable."
        ),
    }


def _non_positive_terminal_cash_flow_warning(terminal_growth_rate):
    if terminal_growth_rate > -1:
        return None
    return {
        "id": "non_positive_terminal_cash_flow",
        "tier": "extreme",
        "explanation": (
            "At exactly -100% terminal growth, next period's projected cash flow is zero; "
            "below -100%, repeated compounding produces alternating-sign cash flows rather "
            "than continued decline. That's structurally inconsistent with interpreting "
            "Gordon Growth as a stable-state going concern, even though the formula still "
            "computes a finite value."
        ),
    }


def terminal_growth_warnings(wacc, terminal_growth_rate):
    """Deterministic, explanatory warnings for a mathematically valid but structurally
    unusual WACC/terminal-growth combination. Assumes the pair has already passed
    gordon_growth_converges (enforced by DCFInputs before run_dcf is ever called) - these
    are about scrutiny-worthy results, not a second validity check.
    """
    warnings = [
        _narrow_spread_warning(wacc, terminal_growth_rate),
        _non_positive_terminal_cash_flow_warning(terminal_growth_rate),
    ]
    return [w for w in warnings if w is not None]


def fcf_growth_warnings(growth_rate):
    """Deterministic, explanatory warnings for a valid-but-economically-extreme
    fcf_growth_rate. No value here is hard-blocked - the arithmetic stays well-defined at
    any growth rate (see NonFiniteResultError for the actual computational-safety line) -
    so this is scrutiny, not a second validity check.
    """
    if growth_rate == -1:
        return [
            {
                "id": "zero_explicit_period_fcf",
                "tier": "extreme",
                "explanation": (
                    "At exactly -100% FCF growth, the base year's cash flow is fully "
                    "extinguished in year one - every year of the explicit forecast is $0, "
                    "rather than continuing to decline."
                ),
            }
        ]
    if growth_rate < -1:
        return [
            {
                "id": "alternating_sign_explicit_period_fcf",
                "tier": "extreme",
                "explanation": (
                    "Below -100% FCF growth, the projected cash flow alternates between "
                    "negative and positive each year rather than continuing to decline. "
                    "The result is mechanically computed, but doesn't represent a coherent "
                    "ongoing growth assumption - double-check this reflects what you intend."
                ),
            }
        ]
    return []


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
        _require_finite(fcf, "projected free cash flow")
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

    tv = _require_finite(terminal_value(fcfs[-1], wacc, terminal_growth_rate), "terminal value")
    pv_tv = present_value(tv, wacc, forecast_years)

    ev = _require_finite(enterprise_value(pv_fcfs, pv_tv), "enterprise value")
    eq_value = _require_finite(equity_value(ev, net_debt), "equity value")
    per_share = _require_finite(
        value_per_share(eq_value, diluted_shares_outstanding), "value per share"
    )

    return {
        "forecast": forecast,
        "terminal_value": round(tv, 2),
        "pv_terminal_value": round(pv_tv, 2),
        "enterprise_value": round(ev, 2),
        "equity_value": round(eq_value, 2),
        "value_per_share": round(per_share, 2),
        "terminal_growth_warnings": terminal_growth_warnings(wacc, terminal_growth_rate),
        "fcf_growth_warnings": fcf_growth_warnings(fcf_growth_rate),
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

    Combinations outside the Gordon Growth convergence domain (see gordon_growth_converges)
    are mathematically invalid - the closed form either blows up (WACC <= growth) or stops
    representing a convergent series (growth far enough below -100%) - and are marked null
    rather than computed. A cell that overflows (see NonFiniteResultError) is treated the
    same way - EXCEPT the base case itself (delta 0, 0), which re-raises instead of quietly
    going null: if the analyst's own inputs can't be computed, the whole request should fail
    cleanly rather than return an ostensibly-successful grid with its own center cell blank.
    """
    wacc_values = sorted({round(wacc + d, 6) for d in WACC_DELTAS if 0 < wacc + d <= 1})
    growth_values = sorted({round(terminal_growth_rate + d, 6) for d in TERMINAL_GROWTH_DELTAS})

    rows = []
    for w in wacc_values:
        value_per_share_by_growth = []
        for g in growth_values:
            if not gordon_growth_converges(w, g):
                value_per_share_by_growth.append(None)
                continue
            is_base_cell = w == wacc and g == terminal_growth_rate
            try:
                result = run_dcf(
                    base_year_fcf=base_year_fcf,
                    fcf_growth_rate=fcf_growth_rate,
                    forecast_years=forecast_years,
                    wacc=w,
                    terminal_growth_rate=g,
                    net_debt=net_debt,
                    diluted_shares_outstanding=diluted_shares_outstanding,
                )
            except NonFiniteResultError:
                if is_base_cell:
                    raise
                value_per_share_by_growth.append(None)
                continue
            value_per_share_by_growth.append(result["value_per_share"])
        rows.append({"wacc": w, "value_per_share_by_growth": value_per_share_by_growth})

    return {"terminal_growth_rates": growth_values, "rows": rows}
