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


def _compute_dcf_core(fcfs, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding):
    """The one place the forward valuation formula is actually implemented, given an
    already-built annual FCF schedule. _compute_dcf (flat-growth, via project_fcf) and
    _compute_driver_dcf (driver-based, via project_driver_years) both call this rather than
    each computing enterprise value / equity value / value per share their own way, so the
    two forecast-entry modes can never silently drift into disagreement about how a schedule
    becomes a valuation. Returns raw, unrounded values deliberately: the reverse solver needs
    the true continuous value_per_share to bisect against, not a figure already quantized to
    the nearest cent - solving against a rounded target would mean the "root" it finds is
    only accurate to within that $0.01 step, not to the solver's own numerical tolerance.
    """
    forecast_years = len(fcfs)
    discount_factors = [discount_factor(wacc, t) for t in range(1, forecast_years + 1)]

    pv_fcfs = []
    for fcf, df in zip(fcfs, discount_factors):
        _require_finite(fcf, "projected free cash flow")
        pv_fcfs.append(fcf * df)

    tv = _require_finite(terminal_value(fcfs[-1], wacc, terminal_growth_rate), "terminal value")
    pv_tv = present_value(tv, wacc, forecast_years)

    ev = _require_finite(enterprise_value(pv_fcfs, pv_tv), "enterprise value")
    eq_value = _require_finite(equity_value(ev, net_debt), "equity value")
    per_share = _require_finite(
        value_per_share(eq_value, diluted_shares_outstanding), "value per share"
    )

    return {
        "fcfs": fcfs,
        "discount_factors": discount_factors,
        "pv_fcfs": pv_fcfs,
        "terminal_value": tv,
        "pv_terminal_value": pv_tv,
        "enterprise_value": ev,
        "equity_value": eq_value,
        "value_per_share": per_share,
    }


def _compute_dcf(
    base_year_fcf,
    fcf_growth_rate,
    forecast_years,
    wacc,
    terminal_growth_rate,
    net_debt,
    diluted_shares_outstanding,
):
    """Flat-growth (Quick DCF) forward valuation - run_dcf (the public, rounded forward API)
    and implied_fcf_growth_rate (the reverse solver) both call this. Builds the FCF schedule
    from a single flat growth rate, then hands off to _compute_dcf_core, the one shared place
    a schedule becomes a valuation.
    """
    fcfs = project_fcf(base_year_fcf, fcf_growth_rate, forecast_years)
    return _compute_dcf_core(fcfs, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding)


def run_dcf(
    base_year_fcf,
    fcf_growth_rate,
    forecast_years,
    wacc,
    terminal_growth_rate,
    net_debt,
    diluted_shares_outstanding,
):
    core = _compute_dcf(
        base_year_fcf,
        fcf_growth_rate,
        forecast_years,
        wacc,
        terminal_growth_rate,
        net_debt,
        diluted_shares_outstanding,
    )

    forecast = [
        {
            "year": t,
            "fcf": round(fcf, 2),
            "discount_factor": round(df, 6),
            "present_value": round(pv, 2),
        }
        for t, (fcf, df, pv) in enumerate(
            zip(core["fcfs"], core["discount_factors"], core["pv_fcfs"]), start=1
        )
    ]

    return {
        "forecast": forecast,
        "terminal_value": round(core["terminal_value"], 2),
        "pv_terminal_value": round(core["pv_terminal_value"], 2),
        "enterprise_value": round(core["enterprise_value"], 2),
        "equity_value": round(core["equity_value"], 2),
        "value_per_share": round(core["value_per_share"], 2),
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


# --- Reverse DCF: the constant explicit-period FCF growth rate that reconciles a target ---
# --- price under every other assumption held fixed --------------------------------------

PRICE_TOLERANCE = 0.005  # half a cent - matches the 2dp precision run_dcf's own output uses
MAX_BRACKET_EXPANSION_STEPS = 200  # a defensive iteration cap, not a growth-rate cap - see
# the comment in _bracket() below for why this is never expected to actually bind
MAX_BISECTION_STEPS = 200


def _value_per_share_at_growth(growth_rate, base_year_fcf, forecast_years, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding):
    return _compute_dcf(
        base_year_fcf, growth_rate, forecast_years, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding
    )["value_per_share"]


def _bracket(f, f0, target_price):
    """Finds [g_low, g_high] with f(g_low) <= target_price <= f(g_high), for f strictly
    increasing on (-1, inf) (see implied_fcf_growth_rate's own docstring for why that's true
    on this domain). Doubles outward from 0 toward +inf for a target above f(0); for a
    target below f(0), approaches -1 from above by repeatedly halving the remaining distance
    to it (d = 1 + g, halved each step) - this is guaranteed to eventually bracket the target
    because the caller has already confirmed target_price is above the floor (the limit of f
    as g -> -1+), so somewhere in (-1, 0) f must cross it.

    MAX_BRACKET_EXPANSION_STEPS exists only so this loop is provably finite; it is not a
    growth-rate ceiling. In practice the loop always ends one of two other ways first: the
    target gets bracketed (the overwhelmingly common case for any real reference price), or
    NonFiniteResultError fires from genuine float overflow (project_fcf's own guard) long
    before 200 doublings - doubling from 0.05 for even 60 steps already reaches a growth
    rate no float64 DCF survives. Reaching the step cap without either happening would mean
    something is wrong with the *other* inputs (e.g. a share count or base FCF near zero),
    not that this target's growth rate is unusually high.
    """
    if target_price >= f0:
        g_low, g_high = 0.0, 0.05
        steps = 0
        while f(g_high) < target_price:
            steps += 1
            if steps > MAX_BRACKET_EXPANSION_STEPS:
                return None
            g_low, g_high = g_high, g_high * 2
        return g_low, g_high

    g_high = 0.0
    d = 0.5
    steps = 0
    while f(-1 + d) > target_price:
        steps += 1
        if steps > MAX_BRACKET_EXPANSION_STEPS:
            return None
        d /= 2
    return -1 + d, g_high


def implied_fcf_growth_rate(
    target_price,
    base_year_fcf,
    forecast_years,
    wacc,
    terminal_growth_rate,
    net_debt,
    diluted_shares_outstanding,
):
    """The constant annual explicit-period FCF growth rate that reconciles target_price
    under every other DCF input held fixed - a reverse solve over run_dcf's own formula
    (via the shared _compute_dcf core), not a second implementation of it.

    Solved by bisection because there's no closed-form inverse (unlike terminal value, the
    explicit-period sum has no algebraic simplification once discounting is involved). This
    is well-posed - guaranteed a unique answer, not just *an* answer - on g in (-1, inf):
    every projected cash flow base_year_fcf * (1+g)^t is strictly increasing in g there (for
    t >= 1, base_year_fcf > 0), so value_per_share, a positive-weighted sum of those terms
    run through terminal value/discounting/net debt/shares, is strictly increasing in g too.
    At g <= -1, (1+g) is non-positive and (1+g)^t alternates sign by year - monotonicity (and
    with it, a unique root) breaks down entirely, which is exactly why the existing forward
    engine already treats that region as economically incoherent (see fcf_growth_warnings).
    This bound is a reverse-solver *uniqueness* requirement, not a new restriction on what an
    analyst can type into the forward form - manually entered growth rates are completely
    unaffected, still validated (or not) exactly as DCFInputs already does today.

    Three distinct non-"solved" outcomes, deliberately not collapsed into one "failed":
    - target_below_floor: target_price is at or below the mathematical floor
      (-net_debt / diluted_shares_outstanding, the limit of value_per_share as g -> -1+) -
      no g in the modeled domain reaches it. A closed-form fact about these inputs, checked
      before any search is attempted, not a search failure.
    - not_bracketed: the search itself couldn't complete within computational limits -
      either bracketing never found an upper/lower bound (see _bracket's docstring), or
      bisection ran its full MAX_BISECTION_STEPS without ever landing within
      PRICE_TOLERANCE of target_price. Both are the same honest admission ("couldn't solve
      this within computational limits"), never papered over with an unconverged midpoint
      dressed up as "solved" - expected to be rare, and when it happens, points at the other
      inputs rather than at the target price itself.
    - solved: a unique g was found within PRICE_TOLERANCE of target_price.
    """
    floor = -net_debt / diluted_shares_outstanding

    def f(g):
        return _value_per_share_at_growth(
            g, base_year_fcf, forecast_years, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding
        )

    if target_price <= floor:
        return {
            "status": "target_below_floor",
            "implied_fcf_growth_rate": None,
            "reconciled_value_per_share": None,
            "floor_value_per_share": round(floor, 2),
        }

    try:
        f0 = f(0.0)
        bracket = _bracket(f, f0, target_price)
        if bracket is None:
            return {
                "status": "not_bracketed",
                "implied_fcf_growth_rate": None,
                "reconciled_value_per_share": None,
                "floor_value_per_share": round(floor, 2),
            }
        g_low, g_high = bracket

        for _ in range(MAX_BISECTION_STEPS):
            g_mid = (g_low + g_high) / 2
            v_mid = f(g_mid)
            if abs(v_mid - target_price) < PRICE_TOLERANCE:
                break
            if v_mid < target_price:
                g_low = g_mid
            else:
                g_high = g_mid
        else:
            # The loop ran out of steps without ever hitting `break` - i.e. without ever
            # getting within PRICE_TOLERANCE. g_mid/v_mid still hold the last midpoint tried,
            # but returning "solved" with them would fabricate a result that never actually
            # converged. An exhausted bracket is the same honest "couldn't solve within
            # computational limits" outcome as a bracket that never formed at all.
            return {
                "status": "not_bracketed",
                "implied_fcf_growth_rate": None,
                "reconciled_value_per_share": None,
                "floor_value_per_share": round(floor, 2),
            }
    except NonFiniteResultError:
        return {
            "status": "not_bracketed",
            "implied_fcf_growth_rate": None,
            "reconciled_value_per_share": None,
            "floor_value_per_share": round(floor, 2),
        }

    return {
        "status": "solved",
        "implied_fcf_growth_rate": g_mid,
        "reconciled_value_per_share": round(v_mid, 2),
        "floor_value_per_share": round(floor, 2),
    }


# --- Driver-Based DCF: revenue -> margin -> taxes -> D&A -> CapEx -> NWC, one year at a ----
# --- time, instead of a single flat FCF growth rate ----------------------------------------
#
# driver_years is a list of plain dicts, one per forecast year, each with:
#   revenue_growth_rate, ebit_margin, tax_rate, da_pct_of_revenue, capex_pct_of_revenue,
#   nwc_investment_pct_of_revenue_change
# No field is hard-bounded here - the arithmetic stays well-defined (finite) at any value
# short of the same structural revenue-collapse case project_fcf's flat-growth path already
# has to handle (see driver_warnings below); analyst judgment governs everything else, per
# CLAUDE.md's Financial Validation Principle.


def project_driver_years(base_year_revenue, driver_years):
    """Builds the full per-year operating schedule - revenue, EBIT, cash taxes, NOPAT, D&A,
    CapEx, delta NWC, and UFCF - that driver-based inputs imply, one dict per forecast year
    in order. Mirrors the sourced UFCF formula (EBIT x (1 - tax rate) + D&A - CapEx - delta
    NWC; see MODELING_CONVENTIONS.md) exactly, except every line is itself forecast from a
    driver rather than read from a filing, and cash tax uses max(EBIT, 0) x tax_rate - no NOL
    carryforward is modeled, so a loss year owes no cash tax but also earns no benefit
    against it. Delta NWC is modeled as nwc_investment_pct_of_revenue_change x the
    year-over-year dollar *change* in revenue - not a balance-sheet NWC ratio.

    run_driver_dcf extracts each year's "fcf" for _compute_dcf_core and re-attaches every
    other field to the rounded result rows, so the two can never drift out of sync.
    """
    rows = []
    prior_revenue = base_year_revenue
    for year in driver_years:
        revenue = prior_revenue * (1 + year["revenue_growth_rate"])
        ebit = revenue * year["ebit_margin"]
        cash_taxes = max(ebit, 0) * year["tax_rate"]
        nopat = ebit - cash_taxes
        da = revenue * year["da_pct_of_revenue"]
        capex = revenue * year["capex_pct_of_revenue"]
        delta_nwc = year["nwc_investment_pct_of_revenue_change"] * (revenue - prior_revenue)
        fcf = nopat + da - capex - delta_nwc
        rows.append(
            {
                "revenue": revenue,
                "ebit": ebit,
                "cash_taxes": cash_taxes,
                "nopat": nopat,
                "da": da,
                "capex": capex,
                "delta_nwc": delta_nwc,
                "fcf": fcf,
            }
        )
        prior_revenue = revenue
    return rows


def _compute_driver_dcf(
    base_year_revenue, driver_years, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding
):
    rows = project_driver_years(base_year_revenue, driver_years)
    for row in rows:
        for label in ("revenue", "ebit", "cash_taxes", "nopat", "da", "capex", "delta_nwc", "fcf"):
            _require_finite(row[label], f"projected {label}")

    fcfs = [row["fcf"] for row in rows]
    core = _compute_dcf_core(fcfs, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding)
    return rows, core


def _base_year_revenue_warning(base_year_revenue):
    if base_year_revenue > 0:
        return None
    return {
        "year": 0,
        "id": "non_positive_base_year_revenue",
        "tier": "extreme",
        "explanation": (
            "Base Year Revenue is zero or negative. Every forecast year's revenue is this "
            "figure compounded by each year's own growth rate, so a non-positive base makes "
            "the entire revenue schedule - and everything derived from it - structurally "
            "meaningless, even though the arithmetic itself still computes a finite result."
        ),
    }


def _driver_year_warnings(year_index, driver_year, revenue, prior_revenue, revenue_already_locked_at_zero):
    """Per-year scrutiny for one driver year. The revenue-sign checks are deliberately based
    on the *computed* revenue value each year, not on inspecting revenue_growth_rate against
    a -100% threshold in isolation: unlike flat-growth FCF (one rate exponentiated, so its
    sign pattern is fully determined), each driver year has its own independent growth rate,
    so a later year's revenue sign depends on that year's own rate applied to whatever the
    prior year's revenue actually was - never a predictable alternating pattern. Two distinct
    cases, not collapsed into one: revenue hitting exactly zero is a permanent lock (0 times
    any finite growth rate is still 0, so every later year is a mechanical consequence, not a
    new event - flagged once, at the year it first happens); revenue going negative is a
    one-year event whose sign in later years depends entirely on their own rates.
    """
    warnings = []
    if not (0 <= driver_year["tax_rate"] <= 1):
        warnings.append(
            {
                "year": year_index,
                "id": "tax_rate_outside_0_100_percent",
                "tier": "caution",
                "explanation": (
                    f"Year {year_index}'s tax rate ({driver_year['tax_rate']:.1%}) is outside "
                    "the usual 0%-100% range. The arithmetic still computes (a negative rate "
                    "acts as a tax subsidy on a profitable year; above 100% takes more cash "
                    "than the year's entire EBIT) - double-check this reflects what you "
                    "intend."
                ),
            }
        )
    if driver_year["da_pct_of_revenue"] < 0:
        warnings.append(
            {
                "year": year_index,
                "id": "negative_da_percent",
                "tier": "caution",
                "explanation": (
                    f"Year {year_index}'s D&A is a negative percentage of revenue "
                    f"({driver_year['da_pct_of_revenue']:.1%}), which reduces rather than adds "
                    "back to NOPAT in the UFCF formula - an unusual assumption, not a "
                    "computational problem."
                ),
            }
        )
    if driver_year["capex_pct_of_revenue"] < 0:
        warnings.append(
            {
                "year": year_index,
                "id": "negative_capex_percent",
                "tier": "caution",
                "explanation": (
                    f"Year {year_index}'s CapEx is a negative percentage of revenue "
                    f"({driver_year['capex_pct_of_revenue']:.1%}) - a net-divestment "
                    "assumption rather than investment - an unusual assumption, not a "
                    "computational problem."
                ),
            }
        )

    if revenue_already_locked_at_zero:
        return warnings
    if revenue == 0:
        warnings.append(
            {
                "year": year_index,
                "id": "zero_revenue_lock",
                "tier": "extreme",
                "explanation": (
                    f"Year {year_index}'s revenue growth rate "
                    f"({driver_year['revenue_growth_rate']:.1%}) applied to the prior year's "
                    "revenue produces exactly zero. Because each year's revenue is a "
                    "percentage of the prior year's, once it reaches zero no subsequent "
                    "growth rate - positive, negative, or zero - can make it nonzero again: "
                    "every later year's revenue will also be zero."
                ),
            }
        )
    elif revenue < 0:
        warnings.append(
            {
                "year": year_index,
                "id": "negative_revenue",
                "tier": "extreme",
                "explanation": (
                    f"Year {year_index}'s revenue growth rate "
                    f"({driver_year['revenue_growth_rate']:.1%}) applied to a prior-year "
                    f"revenue of {prior_revenue:,.2f} produces a negative figure "
                    f"({revenue:,.2f}). This is mechanically computed, but a negative revenue "
                    "doesn't represent a coherent forecast - double-check this reflects what "
                    "you intend. Whether later years return to positive revenue depends "
                    "entirely on their own growth rates, not a predictable alternating "
                    "pattern."
                ),
            }
        )
    return warnings


def _terminal_year_fcf_warning(rows):
    """The Gordon Growth terminal value is computed from the final explicit forecast year's
    UFCF (see _compute_dcf_core), so a final year ending at or below zero produces a zero or
    negative terminal value - and because the terminal value usually dominates a DCF, a zero
    or negative enterprise value along with it. Nothing here is computationally undefined:
    the arithmetic stays finite and the growing-perpetuity formula still evaluates. It's the
    economics that stop cohering, which is precisely the case CLAUDE.md's Financial
    Validation Principle says to surface prominently rather than block.

    Deliberately keyed off the computed final-year UFCF rather than any individual driver:
    no single driver determines the sign of a year's UFCF - it is the net of NOPAT + D&A -
    CapEx - delta NWC - so an ordinary-looking reinvestment-heavy schedule can reach this
    with every individual driver sitting in a perfectly normal range and no other warning
    firing.
    """
    if not rows:
        return None
    final_fcf = rows[-1]["fcf"]
    if final_fcf > 0:
        return None
    return {
        "year": len(rows),
        "id": "non_positive_terminal_year_fcf",
        "tier": "extreme",
        "explanation": (
            f"Year {len(rows)} is the final explicit forecast year, and its Unlevered FCF is "
            f"{final_fcf:,.2f}. The Gordon Growth terminal value is calculated directly from "
            "that figure, so the terminal value is zero or negative too - and because the "
            "terminal value usually dominates a DCF, the enterprise value and value per "
            "share can come out negative as well. Sensitivity direction may also become "
            "counterintuitive, with value per share rising as WACC increases and falling as "
            "terminal growth increases - the reverse of the usual reading. The arithmetic is "
            "sound; what it implies is a forecast that never reaches a positive steady "
            "state. Verify the terminal-year economics before relying on this valuation."
        ),
    }


def driver_warnings(base_year_revenue, driver_years, rows):
    """Deterministic, explanatory warnings for valid-but-economically-unusual driver
    assumptions - see _driver_year_warnings' own docstring for why the revenue-sign checks
    are computed per year from the actual schedule rather than inferred from a growth-rate
    threshold. No value here is hard-blocked; this is scrutiny, not a second validity check.
    """
    warnings = []
    base_warning = _base_year_revenue_warning(base_year_revenue)
    if base_warning:
        warnings.append(base_warning)

    prior_revenue = base_year_revenue
    revenue_locked_at_zero = False
    for year_index, (driver_year, row) in enumerate(zip(driver_years, rows), start=1):
        revenue = row["revenue"]
        warnings.extend(
            _driver_year_warnings(year_index, driver_year, revenue, prior_revenue, revenue_locked_at_zero)
        )
        if revenue == 0:
            revenue_locked_at_zero = True
        prior_revenue = revenue

    # Last, and on the schedule as a whole rather than any one year's drivers: the terminal
    # value hangs off the final year alone, so this is the one warning that can fire with
    # every individual driver looking entirely ordinary.
    terminal_warning = _terminal_year_fcf_warning(rows)
    if terminal_warning:
        warnings.append(terminal_warning)
    return warnings


def run_driver_dcf(
    base_year_revenue, driver_years, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding
):
    rows, core = _compute_driver_dcf(
        base_year_revenue, driver_years, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding
    )

    forecast = []
    for t, (row, df, pv) in enumerate(
        zip(rows, core["discount_factors"], core["pv_fcfs"]), start=1
    ):
        _require_finite(df, "discount factor")
        _require_finite(pv, "present value")
        forecast.append(
            {
                "year": t,
                "revenue": round(row["revenue"], 2),
                "ebit": round(row["ebit"], 2),
                "cash_taxes": round(row["cash_taxes"], 2),
                "nopat": round(row["nopat"], 2),
                "da": round(row["da"], 2),
                "capex": round(row["capex"], 2),
                "delta_nwc": round(row["delta_nwc"], 2),
                "fcf": round(row["fcf"], 2),
                "discount_factor": round(df, 6),
                "present_value": round(pv, 2),
            }
        )

    return {
        "forecast": forecast,
        "terminal_value": round(core["terminal_value"], 2),
        "pv_terminal_value": round(core["pv_terminal_value"], 2),
        "enterprise_value": round(core["enterprise_value"], 2),
        "equity_value": round(core["equity_value"], 2),
        "value_per_share": round(core["value_per_share"], 2),
        "terminal_growth_warnings": terminal_growth_warnings(wacc, terminal_growth_rate),
        "driver_warnings": driver_warnings(base_year_revenue, driver_years, rows),
    }


def driver_dcf_sensitivity(
    base_year_revenue, driver_years, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding
):
    """Value per share across a grid of WACC x terminal growth rate, holding the entire
    driver schedule fixed - the Driver-Based sibling of dcf_sensitivity, structurally
    identical to it (same deltas, same convergence-domain nulling, same base-cell
    never-goes-null guarantee), just calling run_driver_dcf per cell instead of run_dcf.
    """
    wacc_values = sorted({round(wacc + d, 6) for d in WACC_DELTAS if 0 < wacc + d <= 1})
    growth_values = sorted({round(terminal_growth_rate + d, 6) for d in TERMINAL_GROWTH_DELTAS})

    result_rows = []
    for w in wacc_values:
        value_per_share_by_growth = []
        for g in growth_values:
            if not gordon_growth_converges(w, g):
                value_per_share_by_growth.append(None)
                continue
            is_base_cell = w == wacc and g == terminal_growth_rate
            try:
                result = run_driver_dcf(
                    base_year_revenue=base_year_revenue,
                    driver_years=driver_years,
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
        result_rows.append({"wacc": w, "value_per_share_by_growth": value_per_share_by_growth})

    return {"terminal_growth_rates": growth_values, "rows": result_rows}


# --- Driver sensitivity (tornado): one standardized parallel shift per operating driver ---

# A uniform +/-1 percentage point, applied to every forecast year of one driver at a time.
# Deliberately NOT scaled to each driver's own historical dispersion: with four usable
# observations per driver (and the v2 seeding rules already refusing several as unstable),
# a dispersion-scaled shift would silently blend "how uncertain is this assumption" with
# "how much does it matter," which is exactly the opaque composite scoring this project
# rejects elsewhere. A fixed, stated shift is reproducible and can be read off the chart.
#
# The consequence to be honest about, rather than to correct for: 1pp is not dimensionally
# uniform across these six drivers. On a company whose D&A runs 0.88% of revenue and whose
# tax rate is 24.55%, the same 1pp is a 113% relative move for one and a 4% relative move
# for the other, so the ranking is partly an artifact of each driver's own base magnitude.
# That is why every row carries its actual tested path (`base_path`) - the distortion is
# disclosed on the chart rather than hidden inside the ordering.
DRIVER_TORNADO_SHIFT = 0.01

# Canonical order - also the deterministic tie-break for equal ranges, since the sort below
# is stable and rows are built in this order.
TORNADO_DRIVER_FIELDS = (
    "revenue_growth_rate",
    "ebit_margin",
    "tax_rate",
    "da_pct_of_revenue",
    "capex_pct_of_revenue",
    "nwc_investment_pct_of_revenue_change",
)

_TIER_SEVERITY = {"caution": 0, "high": 1, "extreme": 2}


def _shift_driver(driver_years, field, delta):
    """One driver shifted by `delta` in every forecast year (a parallel shift), every other
    driver in every year left exactly as given. A Fade row keeps its fade shape and a Custom
    row keeps its per-year pattern - the whole path moves together rather than being
    flattened to a single value.
    """
    return [{**year, field: year[field] + delta} for year in driver_years]


def _tornado_endpoint(base_year_revenue, driver_years, field, delta, **shared):
    """One perturbed valuation, or None if it can't be computed. A perturbed side going
    non-finite must not take the rest of the chart down with it - the other five drivers
    (and this driver's other direction) are still perfectly valid results.
    """
    try:
        return run_driver_dcf(
            base_year_revenue=base_year_revenue,
            driver_years=_shift_driver(driver_years, field, delta),
            **shared,
        )
    except NonFiniteResultError:
        return None


def new_endpoint_warnings(base_warnings, endpoint_warnings):
    """Driver warnings this perturbation *introduces*, grouped by warning id.

    A standardized shift can move a driver into territory the engine itself warns about -
    the real and unavoidable case being a company whose D&A runs below 1% of revenue, where
    -1pp produces a negative D&A percentage. That endpoint is neither clamped nor skipped
    (silently substituting a different assumption than the stated convention would both
    falsify the "standardized +/-1pp" claim and repeat this project's recurring quiet-
    economic-substitution failure), so the honest alternative is to surface it.

    Compared against the base case by (year, id) so a warning the analyst's own inputs
    already raise is never re-reported as something the perturbation caused - only genuinely
    new (year, id) pairs survive, including the case where a warning already present in some
    years newly extends to others. Grouped by id afterwards because a flat driver row
    typically trips the same warning in every forecast year at once, and six identical
    entries would be noise rather than detail.
    """
    already = {(w["year"], w["id"]) for w in base_warnings}
    grouped = {}
    for warning in endpoint_warnings:
        if (warning["year"], warning["id"]) in already:
            continue
        entry = grouped.get(warning["id"])
        if entry is None:
            grouped[warning["id"]] = {
                "id": warning["id"],
                "tier": warning["tier"],
                "years": [warning["year"]],
                "explanation": warning["explanation"],
            }
            continue
        entry["years"].append(warning["year"])
        # Same id can carry different tiers across years; report the most severe, with the
        # explanation that belongs to it.
        if _TIER_SEVERITY[warning["tier"]] > _TIER_SEVERITY[entry["tier"]]:
            entry["tier"] = warning["tier"]
            entry["explanation"] = warning["explanation"]

    for entry in grouped.values():
        entry["years"].sort()
    return sorted(grouped.values(), key=lambda e: (-_TIER_SEVERITY[e["tier"]], e["id"]))


def driver_dcf_tornado(
    base_year_revenue, driver_years, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding
):
    """Value-per-share impact of a standardized +/-1pp parallel shift in each of the six
    operating drivers, one driver at a time, with every other driver and every valuation
    assumption (WACC, terminal growth, net debt, share count) held at the base case.

    Thirteen `run_driver_dcf` calls: one base plus six drivers x two directions. The base is
    computed here rather than accepted from or reconstructed by the caller, so the deltas can
    never be measured against a stale or separately-rounded base figure.

    This is a mechanical sensitivity, not a probability, a confidence interval, or an
    estimate of how uncertain any assumption actually is. Three properties follow from the
    engine and are load-bearing for how the result must be read and drawn:

    - **Endpoints can land on the same side of base.** Nothing here assumes "down is left,
      up is right." NWC investment is a percentage of the year-over-year *change* in
      revenue, so in a declining-revenue year a higher percentage releases cash instead of
      consuming it, reversing that driver's sign entirely; revenue growth applied to a
      negative-revenue year (permitted and warned on, never blocked) makes revenue more
      negative as the rate rises; and `max(EBIT, 0) x tax_rate` puts a kink at EBIT = 0 that
      makes a driver sitting near that boundary asymmetric across the two directions.

      This is why rows rank on `tested_range` - the spread across the base value AND both
      endpoints - rather than the endpoint-to-endpoint distance alone. The two are identical
      whenever the endpoints straddle base, but when both land on the same side the
      endpoint-only measure collapses toward zero and understates a driver that genuinely
      moved the valuation in both directions.

    - **Every driver is shifted in every forecast year; only revenue growth compounds.** The
      +/-1pp applies to all N years for all six drivers alike. Revenue growth is
      structurally different not because it is applied more often but because it compounds
      the revenue base into each subsequent year - and therefore into the final year that
      terminal value is built from - while the other rate drivers act on each year's own
      revenue without carrying forward. That difference is economically real and is what the
      chart exists to show, not a scaling artifact to normalize away.

    - **WACC and terminal growth are deliberately absent.** They aren't operating drivers,
      and ranking "what do I believe about the business" against "what discount rate do I
      use" in one ordered chart conflates two different questions. They have their own grid.

    Rows are returned already ordered, so the ordering rule is tested here rather than
    re-derived in the client: complete rows first by descending tested range, then rows with
    only one computable side by descending absolute delta, then rows with neither.
    """
    shared = {
        "wacc": wacc,
        "terminal_growth_rate": terminal_growth_rate,
        "net_debt": net_debt,
        "diluted_shares_outstanding": diluted_shares_outstanding,
    }

    # No try/except: if the analyst's own unperturbed inputs can't be computed, the whole
    # request fails cleanly rather than returning an ostensibly-successful chart measured
    # against a base that doesn't exist. Same rule the sensitivity grids apply to their own
    # base cell.
    base_result = run_driver_dcf(
        base_year_revenue=base_year_revenue, driver_years=driver_years, **shared
    )
    base_value = base_result["value_per_share"]
    base_warnings = base_result["driver_warnings"]

    rows = []
    for field in TORNADO_DRIVER_FIELDS:
        down_result = _tornado_endpoint(
            base_year_revenue, driver_years, field, -DRIVER_TORNADO_SHIFT, **shared
        )
        up_result = _tornado_endpoint(
            base_year_revenue, driver_years, field, DRIVER_TORNADO_SHIFT, **shared
        )
        down = None if down_result is None else down_result["value_per_share"]
        up = None if up_result is None else up_result["value_per_share"]
        complete = down is not None and up is not None
        tested = [base_value] + [v for v in (down, up) if v is not None]
        rows.append(
            {
                "driver": field,
                "base_path": [year[field] for year in driver_years],
                "down_value_per_share": down,
                "up_value_per_share": up,
                "down_delta": None if down is None else round(down - base_value, 2),
                "up_delta": None if up is None else round(up - base_value, 2),
                # Null unless both directions computed - a half-tested row has no fully
                # tested range to report, and its ordering falls back to the one delta it
                # does have.
                "tested_range": round(max(tested) - min(tested), 2) if complete else None,
                "down_new_warnings": (
                    [] if down_result is None else new_endpoint_warnings(base_warnings, down_result["driver_warnings"])
                ),
                "up_new_warnings": (
                    [] if up_result is None else new_endpoint_warnings(base_warnings, up_result["driver_warnings"])
                ),
                "complete": complete,
            }
        )

    def order(row):
        if row["complete"]:
            return (0, -row["tested_range"])
        available = [d for d in (row["down_delta"], row["up_delta"]) if d is not None]
        if available:
            return (1, -abs(available[0]))
        return (2, 0.0)

    rows.sort(key=order)

    return {
        "base_value_per_share": base_value,
        "shift": DRIVER_TORNADO_SHIFT,
        "rows": rows,
    }


# --- Driver sensitivity (two-way): revenue growth x EBIT margin ---

# The same 1 percentage point unit the tornado uses, two steps out in each direction on both
# axes. Uniform across the two axes deliberately: a per-axis step tuned to each driver's own
# typical dispersion would silently reintroduce exactly the "how uncertain is this" blending
# that DRIVER_TORNADO_SHIFT's comment rejects, and would leave the grid with two different
# shift conventions to explain rather than one.
#
# The consequence to be honest about: 1pp is not the same proportional move for both drivers.
# On a company whose EBIT margin runs 3.43%, a -2pp shift is a 1.43% margin - still positive,
# but a 58% relative reduction, where -2pp on revenue growth is a far smaller relative move.
# Each axis therefore reports the assumption path it actually tested rather than relying on
# the reader to infer the levels from the deltas.
GROWTH_MARGIN_STEP = 0.01
GROWTH_MARGIN_DELTAS = (-0.02, -0.01, 0.0, 0.01, 0.02)


def _growth_margin_shift(driver_years, growth_delta, margin_delta):
    """Both drivers shifted together, each as a parallel shift across every forecast year.
    Composed from _shift_driver rather than reimplemented, so there is exactly one tested
    implementation of "shift a driver without flattening its Fade or Custom shape" shared
    with the tornado.
    """
    return _shift_driver(
        _shift_driver(driver_years, "revenue_growth_rate", growth_delta),
        "ebit_margin",
        margin_delta,
    )


def driver_growth_margin_sensitivity(
    base_year_revenue, driver_years, wacc, terminal_growth_rate, net_debt, diluted_shares_outstanding
):
    """Value per share across a grid of revenue growth x EBIT margin, both applied as
    standardized parallel shifts in percentage points, with every other driver and every
    valuation assumption (WACC, terminal growth, net debt, share count) held at the base case.

    **What this adds over the tornado.** The tornado moves one driver at a time, so it cannot
    show how these two combine - and they do combine, because a year's UFCF depends on revenue
    and margin multiplicatively through EBIT, while the reinvestment drivers (CapEx, D&A, NWC
    investment) scale with revenue independently of margin. This grid computes that
    interaction and shows it. It deliberately asserts nothing in advance about the direction
    either axis moves value; the cells are the finding.

    **Axes are deltas, not levels.** A Fade or Custom row has no single level to perturb, so
    the axes are labelled as shifts from the analyst's own schedule. base_revenue_growth_path
    and base_ebit_margin_path carry the actual schedules those shifts were applied to.

    **Only the inner single-axis cells correspond to a tornado row.** The four cells at
    (+/-1pp, 0) and (0, +/-1pp) test exactly what the tornado's revenue-growth and EBIT-margin
    rows test, and must agree with them. The +/-2pp cells and every off-axis combination have
    no tornado equivalent - they are this grid's own contribution, not a re-presentation.

    **No per-cell Gordon Growth check, unlike the WACC grids.** WACC and terminal growth are
    held fixed here, so convergence is a property of the base case alone: if the base case
    converges, every cell does. The only null is a computational overflow
    (NonFiniteResultError) - except at the base cell, which re-raises rather than going null,
    the same rule dcf_sensitivity and driver_dcf_sensitivity apply to their own centre cell.

    **On reading the margin axis.** Holding a year's revenue fixed, UFCF is increasing in EBIT
    margin only when that year's revenue is positive AND its tax rate is at or below 100%:
    EBIT is revenue x margin, so a negative-revenue year (permitted and warned, never blocked)
    reverses the relationship, and cash tax of max(EBIT, 0) x rate above 100% takes more than
    a profitable year's entire EBIT. Neither condition is assumed here, and a negative EBIT
    margin is not itself something this engine warns about - only a resulting condition, such
    as a non-positive final-year UFCF, raises a warning of its own.

    Warnings a cell's combined shift introduces that the base case does not already raise are
    attached to that cell and never clamped or skipped, matching the tornado: substituting a
    different assumption than the stated shift would falsify the grid's own claim about what
    it tested.
    """
    shared = {
        "wacc": wacc,
        "terminal_growth_rate": terminal_growth_rate,
        "net_debt": net_debt,
        "diluted_shares_outstanding": diluted_shares_outstanding,
    }

    # No try/except, same rule as the tornado and both WACC grids: if the analyst's own
    # unperturbed inputs cannot be computed, the whole request fails cleanly rather than
    # returning an ostensibly-successful grid measured against a base that does not exist.
    base_result = run_driver_dcf(
        base_year_revenue=base_year_revenue, driver_years=driver_years, **shared
    )
    base_value = base_result["value_per_share"]
    base_warnings = base_result["driver_warnings"]

    rows = []
    for growth_delta in GROWTH_MARGIN_DELTAS:
        cells = []
        for margin_delta in GROWTH_MARGIN_DELTAS:
            # The centre cell IS the base case - both shifts are zero - so it reuses the run
            # above rather than valuing the identical schedule a second time. Twenty-five
            # run_driver_dcf calls in total, not twenty-six. Beyond the wasted work, a second
            # run would also be a second place the centre cell could come from, which is
            # exactly the drift the "base is computed here, never supplied" rule exists to
            # prevent.
            if growth_delta == 0.0 and margin_delta == 0.0:
                cells.append(
                    {"value_per_share": base_value, "delta": 0.0, "new_warnings": []}
                )
                continue
            try:
                result = run_driver_dcf(
                    base_year_revenue=base_year_revenue,
                    driver_years=_growth_margin_shift(driver_years, growth_delta, margin_delta),
                    **shared,
                )
            except NonFiniteResultError:
                cells.append({"value_per_share": None, "delta": None, "new_warnings": []})
                continue
            value = result["value_per_share"]
            cells.append(
                {
                    "value_per_share": value,
                    "delta": round(value - base_value, 2),
                    "new_warnings": new_endpoint_warnings(base_warnings, result["driver_warnings"]),
                }
            )
        rows.append({"revenue_growth_delta": growth_delta, "cells": cells})

    return {
        "base_value_per_share": base_value,
        "step": GROWTH_MARGIN_STEP,
        "ebit_margin_deltas": list(GROWTH_MARGIN_DELTAS),
        "rows": rows,
        "base_revenue_growth_path": [year["revenue_growth_rate"] for year in driver_years],
        "base_ebit_margin_path": [year["ebit_margin"] for year in driver_years],
    }
