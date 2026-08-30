"""Orchestrates the ticker -> populated DCF workspace workflow: fetches raw fundamentals
from SEC EDGAR (primary) and Alpha Vantage (temporary fallback and current-price source),
normalizes both into one internal shape, and derives UFCF per period using the pure
functions in app/calculations/company_financials.py.

The internal shape is deliberately provider-agnostic - each figure lives on a plain
FinancialPeriod alongside a "source" tag, not nested under either provider's shape - so a
period can mix SEC-sourced and Alpha-Vantage-sourced fields without either provider's
extraction logic needing to know about the other. Merging happens field by field: for each
concept, an SEC-derived value is used if SEC could confidently map it for that period,
otherwise Alpha Vantage's value fills the gap. FinancialPeriod.source discloses which
happened, so provider mixing is visible rather than silent.
"""

import datetime
import time

from app.calculations.company_financials import (
    change_in_nwc,
    effective_tax_rate,
    net_debt as compute_net_debt,
    net_working_capital,
    unlevered_fcf,
)
from app.services import alpha_vantage, sec_edgar, sec_fundamentals

# Fundamentals (income statement, balance sheet, cash flow, company profile) come from
# quarterly/annual filings and change slowly - a long TTL is safe and stretches the
# provider's 25-requests/day free-tier budget across repeat visits to popular tickers.
# The quote (current price) changes continuously during market hours, so it gets its own,
# much shorter TTL rather than being coupled to the fundamentals' freshness window.
FUNDAMENTALS_TTL_SECONDS = 24 * 60 * 60
QUOTE_TTL_SECONDS = 15 * 60

MAX_PERIODS = 5

# The concepts merged field-by-field between SEC (primary) and Alpha Vantage (fallback).
# diluted_shares_outstanding isn't here - it feeds CompanyProfile.shares_outstanding (a
# single current figure), not a per-period FinancialPeriod field, so it's resolved
# separately rather than threaded through this per-period merge.
_MERGED_FIELDS = [
    "revenue",
    "ebit",
    "pretax_income",
    "income_tax_expense",
    "depreciation_and_amortization",
    "capital_expenditures",
    "current_assets",
    "current_liabilities",
    "cash",
    "total_debt",
    "current_debt",
]

_fundamentals_cache = {}  # ticker -> (expires_at, fundamentals dict)
_quote_cache = {}  # ticker -> (expires_at, price)

# Alpha Vantage normalizes a 52/53-week fiscal year end to calendar month-end - confirmed
# live: Apple's real FY2025 ended 2025-09-27 (its actual last-Saturday-of-September date,
# per SEC's own filings), but Alpha Vantage reports fiscalDateEnding "2025-09-30" for that
# same fiscal year. An exact string match between the two providers' period dates would
# silently miss the SEC match for every fiscal year where the two don't happen to coincide
# (4 of Apple's last 5), defeating SEC-as-primary for one of the most common real-world
# fiscal calendar conventions. A same-fiscal-year gap is at most about a week; this
# tolerance comfortably covers that with no risk of crossing into an adjacent fiscal year
# (annual periods are ~365 days apart).
_SEC_PERIOD_MATCH_TOLERANCE_DAYS = 10


def _safe_float(value):
    """Alpha Vantage returns numeric fields as strings, and represents a genuinely missing
    value as the literal string "None" rather than JSON null. Both need explicit handling
    so a missing field becomes Python None (and is later shown as unavailable), not a
    crash and not a silently-wrong 0.0."""
    if value in (None, "None", ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _cached(cache, key, ttl_seconds, fetch_fn):
    now = time.time()
    entry = cache.get(key)
    if entry is not None and entry[0] > now:
        return entry[1]
    value = fetch_fn()
    cache[key] = (now + ttl_seconds, value)
    return value


def _fetch_fundamentals(ticker):
    overview = alpha_vantage.fetch_overview(ticker)
    income = alpha_vantage.fetch_income_statement(ticker)
    balance = alpha_vantage.fetch_balance_sheet(ticker)
    cash_flow = alpha_vantage.fetch_cash_flow(ticker)
    return {
        "overview": overview,
        "income_reports": income["annualReports"][:MAX_PERIODS],
        "balance_reports": balance["annualReports"][: MAX_PERIODS + 1],  # +1 prior period for NWC deltas
        "cash_flow_reports": cash_flow["annualReports"][:MAX_PERIODS],
    }


def _index_by_fiscal_date(reports):
    return {report["fiscalDateEnding"]: report for report in reports}


def _current_debt(balance_report):
    """Alpha Vantage's own field coverage is inconsistent company to company - confirmed
    live: Apple's balance sheet reports the literal string "None" for currentDebt but does
    report shortTermDebt, a closely-related figure (current borrowings), for the same
    period. Falling back to it (rather than leaving NWC undefined whenever the primary
    field is absent) is a documented, conservative choice - not a sum of both, since it's
    not certain they're additive rather than alternate representations of the same
    concept for this provider."""
    if balance_report is None:
        return None
    current_debt = _safe_float(balance_report.get("currentDebt"))
    if current_debt is not None:
        return current_debt
    return _safe_float(balance_report.get("shortTermDebt"))


def _extract_av_values(income_report, balance_report, cash_flow_report):
    """Flat, provider-agnostic-shaped concept extraction from raw Alpha Vantage report
    dicts. Kept separate from _compute_period's math so the same computation works
    unchanged regardless of whether these values, SEC's, or a field-by-field mix of both
    end up feeding it."""
    return {
        "revenue": _safe_float(income_report.get("totalRevenue")) if income_report else None,
        "ebit": _safe_float(income_report.get("operatingIncome")) if income_report else None,
        "pretax_income": _safe_float(income_report.get("incomeBeforeTax")) if income_report else None,
        "income_tax_expense": _safe_float(income_report.get("incomeTaxExpense")) if income_report else None,
        "depreciation_and_amortization": (
            _safe_float(cash_flow_report.get("depreciationDepletionAndAmortization")) if cash_flow_report else None
        ),
        "capital_expenditures": (
            _safe_float(cash_flow_report.get("capitalExpenditures")) if cash_flow_report else None
        ),
        "cash": _safe_float(balance_report.get("cashAndShortTermInvestments")) if balance_report else None,
        "total_debt": _safe_float(balance_report.get("shortLongTermDebtTotal")) if balance_report else None,
        "current_assets": _safe_float(balance_report.get("totalCurrentAssets")) if balance_report else None,
        "current_liabilities": (
            _safe_float(balance_report.get("totalCurrentLiabilities")) if balance_report else None
        ),
        "current_debt": _current_debt(balance_report),
    }


def _merge_values(sec_values, av_values):
    """Field-by-field SEC-primary, Alpha-Vantage-fallback merge. Returns (merged values,
    source label) - "sec_edgar" only if every field came from SEC, "alpha_vantage" only if
    every field came from Alpha Vantage (including when SEC had nothing for this period at
    all), "mixed" otherwise. This label is what FinancialPeriod.source reports, so a period
    blending both providers is disclosed rather than silent."""
    merged = {}
    sources = set()
    for field in _MERGED_FIELDS:
        sec_value = sec_values.get(field) if sec_values else None
        if sec_value is not None:
            merged[field] = sec_value
            sources.add("sec_edgar")
        else:
            merged[field] = av_values.get(field) if av_values else None
            sources.add("alpha_vantage")
    if sources == {"sec_edgar"}:
        source = "sec_edgar"
    elif sources == {"alpha_vantage"}:
        source = "alpha_vantage"
    else:
        source = "mixed"
    return merged, source


def _compute_period(fiscal_year_end, values, prior_values, source):
    """Provider-agnostic: computes tax rate, NWC, and UFCF from already-extracted flat
    values (see app/calculations/company_financials.py), the same way regardless of
    whether those values came from SEC, Alpha Vantage, or a field-by-field mix."""
    tax_rate = effective_tax_rate(values["income_tax_expense"], values["pretax_income"])

    nwc = net_working_capital(values["current_assets"], values["cash"], values["current_liabilities"], values["current_debt"])
    prior_nwc = (
        net_working_capital(
            prior_values["current_assets"],
            prior_values["cash"],
            prior_values["current_liabilities"],
            prior_values["current_debt"],
        )
        if prior_values
        else None
    )
    nwc_change = change_in_nwc(nwc, prior_nwc)

    ufcf = unlevered_fcf(
        values["ebit"], tax_rate, values["depreciation_and_amortization"], values["capital_expenditures"], nwc_change
    )

    return {
        "fiscal_year_end": fiscal_year_end,
        "revenue": values["revenue"],
        "ebit": values["ebit"],
        "pretax_income": values["pretax_income"],
        "income_tax_expense": values["income_tax_expense"],
        "effective_tax_rate": tax_rate,
        "depreciation_and_amortization": values["depreciation_and_amortization"],
        "capital_expenditures": values["capital_expenditures"],
        "change_in_nwc": nwc_change,
        "unlevered_fcf": ufcf,
        "cash": values["cash"],
        "total_debt": values["total_debt"],
        "net_debt": compute_net_debt(values["total_debt"], values["cash"]),
        "source": source,
    }


def _with_growth_and_margin(periods):
    """Adds YoY revenue growth and operating margin - simple ratios over figures already
    computed above, not new financial calculations, so they're derived here rather than
    duplicated as separate fetches."""
    enriched = []
    for i, period in enumerate(periods):
        prior = periods[i + 1] if i + 1 < len(periods) else None
        revenue_growth = None
        if period["revenue"] is not None and prior and prior["revenue"]:
            revenue_growth = (period["revenue"] - prior["revenue"]) / prior["revenue"]
        operating_margin = None
        if period["revenue"] not in (None, 0) and period["ebit"] is not None:
            operating_margin = period["ebit"] / period["revenue"]
        enriched.append({**period, "revenue_growth": revenue_growth, "operating_margin": operating_margin})
    return enriched


def _closest_sec_period(sec_periods, target_fiscal_date):
    """Finds the SEC period whose fiscal_year_end is within tolerance of an Alpha-Vantage
    fiscal date, closest match wins. See _SEC_PERIOD_MATCH_TOLERANCE_DAYS for why exact
    string equality isn't reliable here."""
    target = datetime.date.fromisoformat(target_fiscal_date)
    best, best_diff = None, None
    for period in sec_periods:
        diff = abs((datetime.date.fromisoformat(period["fiscal_year_end"]) - target).days)
        if diff <= _SEC_PERIOD_MATCH_TOLERANCE_DAYS and (best_diff is None or diff < best_diff):
            best, best_diff = period, diff
    return best


def _fetch_sec_periods(cik):
    """Returns SEC-derived annual periods for this filer, most recent first, or an empty
    list if SEC data isn't available right now. SEC being unreachable degrades gracefully
    to Alpha-Vantage-only - it never surfaces as a hard error to the user, since Alpha
    Vantage alone is a fully working path this app ran on before SEC was added."""
    try:
        facts = sec_edgar.fetch_company_facts(cik)
    except sec_edgar.SECDataUnavailableError as exc:
        print(f"SEC EDGAR company facts unavailable for CIK {cik}, falling back to Alpha Vantage: {exc}")
        return []
    return sec_fundamentals.extract_annual_periods(facts, MAX_PERIODS + 1)


def get_company_data(ticker):
    """Raises the typed exceptions from app.services.alpha_vantage on failure - the router
    layer maps those to clean HTTP error responses. SEC EDGAR failures never raise; they
    degrade to the Alpha-Vantage-only path instead (see _fetch_sec_periods)."""
    ticker = ticker.strip().upper()

    fundamentals = _cached(_fundamentals_cache, ticker, FUNDAMENTALS_TTL_SECONDS, lambda: _fetch_fundamentals(ticker))
    quote = _cached(_quote_cache, ticker, QUOTE_TTL_SECONDS, lambda: alpha_vantage.fetch_quote(ticker))

    overview = fundamentals["overview"]
    income_by_date = _index_by_fiscal_date(fundamentals["income_reports"])
    balance_by_date = _index_by_fiscal_date(fundamentals["balance_reports"])
    cash_flow_by_date = _index_by_fiscal_date(fundamentals["cash_flow_reports"])

    balance_dates = [r["fiscalDateEnding"] for r in fundamentals["balance_reports"]]
    fiscal_dates = sorted(income_by_date.keys(), reverse=True)[:MAX_PERIODS]

    sec_info = sec_edgar.lookup_cik(ticker)
    sec_periods = _fetch_sec_periods(sec_info["cik"]) if sec_info else []

    def sec_values_for(fiscal_date):
        period = _closest_sec_period(sec_periods, fiscal_date)
        return period["values"] if period else None

    def prior_sec_values_for(fiscal_date):
        period = _closest_sec_period(sec_periods, fiscal_date)
        if period is None:
            return None
        index = sec_periods.index(period)
        if index + 1 >= len(sec_periods):
            return None
        return sec_periods[index + 1]["values"]

    periods = []
    for fiscal_date in fiscal_dates:
        date_index = balance_dates.index(fiscal_date) if fiscal_date in balance_dates else None
        prior_balance = (
            balance_by_date.get(balance_dates[date_index + 1])
            if date_index is not None and date_index + 1 < len(balance_dates)
            else None
        )

        av_values = _extract_av_values(
            income_by_date.get(fiscal_date), balance_by_date.get(fiscal_date), cash_flow_by_date.get(fiscal_date)
        )
        prior_av_values = _extract_av_values(None, prior_balance, None) if prior_balance else None

        merged_values, source = _merge_values(sec_values_for(fiscal_date), av_values)
        prior_sec_values = prior_sec_values_for(fiscal_date)
        prior_merged_values, _ = (
            _merge_values(prior_sec_values, prior_av_values) if prior_av_values or prior_sec_values else (None, None)
        )

        periods.append(_compute_period(fiscal_date, merged_values, prior_merged_values, source))
    periods = _with_growth_and_margin(periods)

    latest_sec_diluted_shares = (
        sec_periods[0]["values"].get("diluted_shares_outstanding") if sec_periods else None
    )
    shares_outstanding = (
        latest_sec_diluted_shares if latest_sec_diluted_shares is not None else _safe_float(overview.get("SharesOutstanding"))
    )

    return {
        "profile": {
            "ticker": ticker,
            "company_name": overview.get("Name") or ticker,
            "sector": overview.get("Sector"),
            "industry": overview.get("Industry"),
            "exchange": overview.get("Exchange"),
            "market_capitalization": _safe_float(overview.get("MarketCapitalization")),
            "shares_outstanding": shares_outstanding,
            "current_price": _safe_float(quote.get("05. price")),
            "sec_cik": sec_info["cik"] if sec_info else None,
            "sec_filings_url": sec_info["filings_url"] if sec_info else None,
        },
        "periods": periods,
        "source": {
            "fundamentals_provider": "sec_edgar" if sec_periods else "alpha_vantage",
            "market_data_provider": "alpha_vantage",
            "sec_filings_provider": "sec_edgar" if sec_info else None,
        },
    }
