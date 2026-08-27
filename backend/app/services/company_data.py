"""Orchestrates the ticker -> populated DCF workspace workflow: fetches raw fundamentals
from Alpha Vantage, a filings-index link from SEC EDGAR, normalizes both into one internal
shape, and derives UFCF per period using the pure functions in
app/calculations/company_financials.py.

The internal shape is deliberately provider-agnostic - each figure lives on a plain
FinancialPeriod alongside a "source" tag, not nested under an Alpha-Vantage-specific
structure - so that adding SEC EDGAR (or another provider) as a values source later is
additive to this module, not a rewrite of the DCF feature that consumes it.
"""

import time

from app.calculations.company_financials import (
    change_in_nwc,
    effective_tax_rate,
    net_debt as compute_net_debt,
    net_working_capital,
    unlevered_fcf,
)
from app.services import alpha_vantage, sec_edgar

# Fundamentals (income statement, balance sheet, cash flow, company profile) come from
# quarterly/annual filings and change slowly - a long TTL is safe and stretches the
# provider's 25-requests/day free-tier budget across repeat visits to popular tickers.
# The quote (current price) changes continuously during market hours, so it gets its own,
# much shorter TTL rather than being coupled to the fundamentals' freshness window.
FUNDAMENTALS_TTL_SECONDS = 24 * 60 * 60
QUOTE_TTL_SECONDS = 15 * 60

MAX_PERIODS = 5

_fundamentals_cache = {}  # ticker -> (expires_at, fundamentals dict)
_quote_cache = {}  # ticker -> (expires_at, price)


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


def _build_period(fiscal_date_ending, income_report, balance_report, prior_balance_report, cash_flow_report):
    revenue = _safe_float(income_report.get("totalRevenue")) if income_report else None
    ebit = _safe_float(income_report.get("operatingIncome")) if income_report else None
    pretax_income = _safe_float(income_report.get("incomeBeforeTax")) if income_report else None
    income_tax_expense = _safe_float(income_report.get("incomeTaxExpense")) if income_report else None
    tax_rate = effective_tax_rate(income_tax_expense, pretax_income)

    da = _safe_float(cash_flow_report.get("depreciationDepletionAndAmortization")) if cash_flow_report else None
    capex = _safe_float(cash_flow_report.get("capitalExpenditures")) if cash_flow_report else None

    cash = _safe_float(balance_report.get("cashAndShortTermInvestments")) if balance_report else None
    total_debt = _safe_float(balance_report.get("shortLongTermDebtTotal")) if balance_report else None
    current_assets = _safe_float(balance_report.get("totalCurrentAssets")) if balance_report else None
    current_liabilities = _safe_float(balance_report.get("totalCurrentLiabilities")) if balance_report else None
    current_debt = _current_debt(balance_report)
    nwc = net_working_capital(current_assets, cash, current_liabilities, current_debt)

    prior_cash = _safe_float(prior_balance_report.get("cashAndShortTermInvestments")) if prior_balance_report else None
    prior_current_assets = _safe_float(prior_balance_report.get("totalCurrentAssets")) if prior_balance_report else None
    prior_current_liabilities = (
        _safe_float(prior_balance_report.get("totalCurrentLiabilities")) if prior_balance_report else None
    )
    prior_current_debt = _current_debt(prior_balance_report)
    prior_nwc = net_working_capital(prior_current_assets, prior_cash, prior_current_liabilities, prior_current_debt)
    nwc_change = change_in_nwc(nwc, prior_nwc)

    ufcf = unlevered_fcf(ebit, tax_rate, da, capex, nwc_change)

    return {
        "fiscal_year_end": fiscal_date_ending,
        "revenue": revenue,
        "ebit": ebit,
        "pretax_income": pretax_income,
        "income_tax_expense": income_tax_expense,
        "effective_tax_rate": tax_rate,
        "depreciation_and_amortization": da,
        "capital_expenditures": capex,
        "change_in_nwc": nwc_change,
        "unlevered_fcf": ufcf,
        "cash": cash,
        "total_debt": total_debt,
        "net_debt": compute_net_debt(total_debt, cash),
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


def get_company_data(ticker):
    """Raises the typed exceptions from app.services.alpha_vantage on failure - the router
    layer maps those to clean HTTP error responses."""
    ticker = ticker.strip().upper()

    fundamentals = _cached(_fundamentals_cache, ticker, FUNDAMENTALS_TTL_SECONDS, lambda: _fetch_fundamentals(ticker))
    quote = _cached(_quote_cache, ticker, QUOTE_TTL_SECONDS, lambda: alpha_vantage.fetch_quote(ticker))

    overview = fundamentals["overview"]
    income_by_date = _index_by_fiscal_date(fundamentals["income_reports"])
    balance_by_date = _index_by_fiscal_date(fundamentals["balance_reports"])
    cash_flow_by_date = _index_by_fiscal_date(fundamentals["cash_flow_reports"])

    balance_dates = [r["fiscalDateEnding"] for r in fundamentals["balance_reports"]]
    fiscal_dates = sorted(income_by_date.keys(), reverse=True)[:MAX_PERIODS]

    periods = []
    for fiscal_date in fiscal_dates:
        date_index = balance_dates.index(fiscal_date) if fiscal_date in balance_dates else None
        prior_balance = (
            balance_by_date.get(balance_dates[date_index + 1])
            if date_index is not None and date_index + 1 < len(balance_dates)
            else None
        )
        periods.append(
            _build_period(
                fiscal_date,
                income_by_date.get(fiscal_date),
                balance_by_date.get(fiscal_date),
                prior_balance,
                cash_flow_by_date.get(fiscal_date),
            )
        )
    periods = _with_growth_and_margin(periods)

    sec_info = sec_edgar.lookup_cik(ticker)

    return {
        "profile": {
            "ticker": ticker,
            "company_name": overview.get("Name") or ticker,
            "sector": overview.get("Sector"),
            "industry": overview.get("Industry"),
            "exchange": overview.get("Exchange"),
            "market_capitalization": _safe_float(overview.get("MarketCapitalization")),
            "shares_outstanding": _safe_float(overview.get("SharesOutstanding")),
            "current_price": _safe_float(quote.get("05. price")),
            "sec_cik": sec_info["cik"] if sec_info else None,
            "sec_filings_url": sec_info["filings_url"] if sec_info else None,
        },
        "periods": periods,
        "source": {
            "fundamentals_provider": "alpha_vantage",
            "market_data_provider": "alpha_vantage",
            "sec_filings_provider": "sec_edgar" if sec_info else None,
        },
    }
