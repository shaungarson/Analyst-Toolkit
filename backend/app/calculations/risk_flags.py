"""Deterministic real estate risk flags (V1 scope).

Reads the output of the calculation layer (real_estate.py) and applies transparent,
explainable rules - no financial calculation happens here, and this module never modifies
the underwriting/sensitivity functions it reads from. Mirrors how the DCF module's
WACC-vs-terminal-growth check is already kept separate from run_dcf().

Each flag is a plain dict: id, title, category, explanation, observed_value,
reference_value. Deliberately no severity/score field - none of these checks has a
defensible scoring methodology behind it, so none is implied. Only flags that actually
trigger are returned; an empty list means nothing here was flagged.
"""

from app.calculations.real_estate import _sensitivity_grid_cells, underwrite_real_estate

DSCR_REFERENCE_THRESHOLD = 1.20


def _low_year1_dscr_flag(results):
    year1_dscr = results["going_in_dscr"]
    if year1_dscr >= DSCR_REFERENCE_THRESHOLD:
        return None
    return {
        "id": "low_year1_dscr",
        "title": "Low Year-1 DSCR",
        "category": "debt_service",
        "explanation": (
            f"Year 1 DSCR is {year1_dscr:.2f}x, below the {DSCR_REFERENCE_THRESHOLD:.2f}x "
            "reference level used by this analysis. Actual lender requirements vary by "
            "property type, lender, market, and deal."
        ),
        "observed_value": year1_dscr,
        "reference_value": DSCR_REFERENCE_THRESHOLD,
    }


def _exit_cap_rate_compression_flag(results, exit_cap_rate):
    going_in_cap_rate = results["going_in_cap_rate"]
    if exit_cap_rate >= going_in_cap_rate:
        return None
    return {
        "id": "exit_cap_rate_compression",
        "title": "Exit Cap Rate Below Going-In Cap Rate",
        "category": "exit_assumptions",
        "explanation": (
            f"The assumed exit cap rate ({exit_cap_rate:.2%}) is below the going-in cap "
            f"rate ({going_in_cap_rate:.2%}), implying cap rate compression over the hold "
            "period. This is a directional flag only - some compression is a reasonable "
            "assumption in the right market, but it should be a deliberate view, not an "
            "oversight."
        ),
        "observed_value": exit_cap_rate,
        "reference_value": going_in_cap_rate,
    }


def _capital_loss_exposure_flag(cells):
    below_1x = [cell for cell in cells if cell["equity_multiple"] < 1.0]
    if not below_1x:
        return None
    pct_below_1x = len(below_1x) / len(cells) * 100
    return {
        "id": "capital_loss_exposure",
        "title": "Capital-Loss Exposure Across Sensitivity Grid",
        "category": "downside_risk",
        "explanation": (
            f"{len(below_1x)} of {len(cells)} tested sensitivity scenarios "
            f"({pct_below_1x:.0f}%) show an equity multiple below 1.0x, meaning less than "
            "full return of capital under those exit cap rate / hold period combinations."
        ),
        "observed_value": round(pct_below_1x, 1),
        "reference_value": 1.0,
    }


def evaluate_risk_flags(
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
    inputs = dict(
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
    results = underwrite_real_estate(**inputs)
    _, _, cells = _sensitivity_grid_cells(**inputs)

    flags = [
        _low_year1_dscr_flag(results),
        _exit_cap_rate_compression_flag(results, exit_cap_rate),
        _capital_loss_exposure_flag(cells),
    ]
    return [flag for flag in flags if flag is not None]
