"""Orchestrates the ticker -> populated DCF workspace workflow: fetches raw fundamentals
from SEC EDGAR (primary) and Alpha Vantage (fallback/enrichment and current-price source),
normalizes both into one internal shape, and derives UFCF per period using the pure
functions in app/calculations/company_financials.py.

SEC EDGAR is a genuinely independent primary path, not just a preference: for a
SEC-supported ticker, company periods are built directly from SEC's own fiscal dates, and
neither Alpha Vantage fundamentals nor the Alpha Vantage quote being rate-limited,
unconfigured, or unreachable prevents a response. Alpha Vantage fundamentals are best-effort
field-level enrichment layered on top of whatever SEC provides (and the full fallback path
for a ticker SEC doesn't support at all); the Alpha Vantage quote is fetched and can fail
completely independently of fundamentals - a missing current price is a lesser response, not
a failed one. A clean, typed error is only raised when neither provider can produce a usable
company result at all.

The internal shape is deliberately provider-agnostic - each figure lives on a plain
FinancialPeriod alongside a "source" tag, not nested under either provider's shape - so a
period can mix SEC-sourced and Alpha-Vantage-sourced fields without either provider's
extraction logic needing to know about the other. FinancialPeriod.source discloses which
happened, so provider mixing (or a provider's absence) is visible rather than silent.
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
# provider's currently-documented free-tier request budget (see
# https://www.alphavantage.co/support/) across repeat visits to popular tickers. The quote
# (current price) changes continuously during market hours, so it gets its own, much shorter
# TTL rather than being coupled to the fundamentals' freshness window.
FUNDAMENTALS_TTL_SECONDS = 24 * 60 * 60
QUOTE_TTL_SECONDS = 15 * 60

MAX_PERIODS = 5

# Alpha Vantage errors that mean "this provider isn't available for this request right now" -
# caught wherever Alpha Vantage is used as fallback/enrichment (never a hard dependency) so a
# usable SEC-sourced response isn't lost to an Alpha Vantage outage. Kept as one tuple so the
# fundamentals and quote paths, and the "neither provider worked" check, can't drift out of
# sync with each other or with the exception types the router already maps to HTTP responses.
_ALPHA_VANTAGE_ERRORS = (
    alpha_vantage.TickerNotFoundError,
    alpha_vantage.RateLimitedError,
    alpha_vantage.ProviderNotConfiguredError,
    alpha_vantage.ProviderUnavailableError,
)

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
# silently miss the match for every fiscal year where the two don't happen to coincide.
# Used symmetrically now (SEC dates looked up against Alpha Vantage's, and vice versa) since
# which provider's dates are canonical depends on which one has data for a given ticker. A
# same-fiscal-year gap is at most about a week; this tolerance comfortably covers that with
# no risk of crossing into an adjacent fiscal year (annual periods are ~365 days apart).
_PERIOD_DATE_MATCH_TOLERANCE_DAYS = 10


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
    """All four Alpha Vantage calls succeed or none of them do - a partial set of statements
    for one company isn't a meaningful result, so this stays all-or-nothing from Alpha
    Vantage's own perspective. Callers treat the whole thing as one best-effort unit (see
    _fetch_av_fundamentals_or_none), not four independently-fallback-able fields."""
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


def _fetch_av_fundamentals_or_none(ticker):
    """Best-effort Alpha Vantage fundamentals fetch. Returns (fundamentals, error): on
    success, (dict, None); on any Alpha Vantage failure, (None, the caught exception) - the
    real exception is kept, not rediscarded and re-derived later, so the caller can raise it
    as-is in the one case that still needs to (neither provider produced anything)."""
    try:
        return _cached(_fundamentals_cache, ticker, FUNDAMENTALS_TTL_SECONDS, lambda: _fetch_fundamentals(ticker)), None
    except _ALPHA_VANTAGE_ERRORS as exc:
        print(f"Alpha Vantage fundamentals unavailable for {ticker}, continuing without them: {exc}")
        return None, exc


def _fetch_av_quote_or_none(ticker):
    """Best-effort, independent of fundamentals entirely: a viewer with no current price is
    a lesser response, never a failed request - see the module docstring."""
    try:
        return _cached(_quote_cache, ticker, QUOTE_TTL_SECONDS, lambda: alpha_vantage.fetch_quote(ticker))
    except _ALPHA_VANTAGE_ERRORS as exc:
        print(f"Alpha Vantage quote unavailable for {ticker}, continuing without a current price: {exc}")
        return None


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
    dicts, each independently optional. Kept separate from _compute_period's math so the
    same computation works unchanged regardless of whether these values, SEC's, or a
    field-by-field mix of both (or neither) end up feeding it."""
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
    source label). A field only counts as Alpha-Vantage-sourced if Alpha Vantage actually
    supplied a value for it (not just attempted and come back empty) - otherwise a period
    where Alpha Vantage was entirely unavailable would misleadingly report itself as
    Alpha-Vantage-sourced. "sec_edgar" only if every field came from SEC, "alpha_vantage"
    only if every field came from Alpha Vantage, "mixed" otherwise. This label is what
    FinancialPeriod.source reports, so provider mixing (or a provider contributing nothing)
    is disclosed rather than silent."""
    merged = {}
    sources = set()
    for field in _MERGED_FIELDS:
        sec_value = sec_values.get(field) if sec_values else None
        av_value = av_values.get(field) if av_values else None
        if sec_value is not None:
            merged[field] = sec_value
            sources.add("sec_edgar")
        elif av_value is not None:
            merged[field] = av_value
            sources.add("alpha_vantage")
        else:
            merged[field] = None
    if sources == {"sec_edgar"}:
        source = "sec_edgar"
    elif sources == {"alpha_vantage"}:
        source = "alpha_vantage"
    elif not sources:
        # No field in this period was confidently sourced from either provider - practically
        # unreachable, since period discovery itself is anchored on a field that's normally
        # present, but kept honest rather than silently defaulted.
        source = "alpha_vantage" if av_values else "sec_edgar"
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


def _closest_by_date(items_by_date, target_date):
    """Returns the value from items_by_date (a {date_str: value} dict) whose key is closest
    to target_date, within tolerance - an exact match if one exists, otherwise the nearest
    one inside _PERIOD_DATE_MATCH_TOLERANCE_DAYS, otherwise None. One direction-agnostic
    lookup used for both providers: which provider's dates are "canonical" for a given
    ticker depends on which one actually has data for it (see _canonical_period_dates), so
    both directions need the same tolerance-matching, not just SEC-to-Alpha-Vantage."""
    exact = items_by_date.get(target_date)
    if exact is not None:
        return exact
    target = datetime.date.fromisoformat(target_date)
    best_value, best_diff = None, None
    for date_str, value in items_by_date.items():
        diff = abs((datetime.date.fromisoformat(date_str) - target).days)
        if diff <= _PERIOD_DATE_MATCH_TOLERANCE_DAYS and (best_diff is None or diff < best_diff):
            best_value, best_diff = value, diff
    return best_value


def _fetch_sec_periods(cik):
    """Returns SEC-derived annual periods for this filer, most recent first, or an empty
    list if SEC data isn't available right now (or this filer has no extractable annual
    data at all). Never raises - SEC being unreachable, or this specific ticker having
    nothing usable, both degrade to the Alpha Vantage path instead."""
    try:
        facts = sec_edgar.fetch_company_facts(cik)
    except sec_edgar.SECDataUnavailableError as exc:
        print(f"SEC EDGAR company facts unavailable for CIK {cik}: {exc}")
        return []
    return sec_fundamentals.extract_annual_periods(facts, MAX_PERIODS + 1)


def _dedupe_dates(dates):
    """Sorts (most recent first) and deduplicates a list of date strings, treating two dates
    within _PERIOD_DATE_MATCH_TOLERANCE_DAYS of each other as "the same" fiscal year - the
    first occurrence wins as the kept representative."""
    deduped = []
    for date in dates:
        already_covered = any(
            abs((datetime.date.fromisoformat(date) - datetime.date.fromisoformat(existing)).days)
            <= _PERIOD_DATE_MATCH_TOLERANCE_DAYS
            for existing in deduped
        )
        if not already_covered:
            deduped.append(date)
    return sorted(deduped, reverse=True)


def _canonical_period_dates(sec_periods, income_by_date):
    """The ordered list of fiscal-period end dates this response will *display*, most recent
    first, up to MAX_PERIODS. Built from the union of both providers' own period dates - SEC
    periods and Alpha Vantage's income-statement dates - so company periods are built
    directly from SEC data (no dependency on Alpha Vantage fiscal periods to exist first),
    but a ticker with fewer SEC-extractable years than Alpha-Vantage-reported years doesn't
    silently lose historical depth just because SEC's own coverage happens to be shorter.
    SEC's date wins as the canonical representative wherever the two providers' dates are
    within tolerance of each other (i.e. "the same" fiscal year).

    Deliberately excludes Alpha Vantage's balance-sheet dates - a period only gets displayed
    if it has real income-statement-anchored substance from one provider or the other, never
    just a balance sheet on its own. See _prior_period_pool for where that extra
    balance-only year (fetched specifically for the oldest displayed period's NWC delta,
    never for display) comes in instead."""
    sec_dates = [p["fiscal_year_end"] for p in sec_periods]
    av_dates = list(income_by_date.keys())
    return _dedupe_dates(sec_dates + av_dates)[:MAX_PERIODS]


def _prior_period_pool(sec_periods, income_by_date, balance_by_date):
    """A wider date pool - superset of _canonical_period_dates - used only to look up the
    prior period each displayed period's NWC delta needs. Alpha Vantage's balance-sheet
    dates are included here (fetched with one extra prior year specifically for this, same
    as SEC's own periods), so the oldest displayed period's prior-year balance data is found
    even though that extra year is never itself a candidate for display."""
    sec_dates = [p["fiscal_year_end"] for p in sec_periods]
    av_dates = list(income_by_date.keys()) + list(balance_by_date.keys())
    return _dedupe_dates(sec_dates + av_dates)


def _prior_date(pool, fiscal_date):
    """The entry in pool (sorted most-recent-first, from _prior_period_pool) immediately
    after fiscal_date's own position - i.e. the next older fiscal year - or None if
    fiscal_date is the oldest thing in the pool. fiscal_date is always itself present in
    pool (within tolerance), since pool is a superset of whatever _canonical_period_dates
    produced."""
    target = datetime.date.fromisoformat(fiscal_date)
    index = next(
        (i for i, date in enumerate(pool) if abs((datetime.date.fromisoformat(date) - target).days) <= _PERIOD_DATE_MATCH_TOLERANCE_DAYS),
        None,
    )
    if index is None or index + 1 >= len(pool):
        return None
    return pool[index + 1]


def get_company_data(ticker):
    """Raises a typed Alpha Vantage exception only when neither SEC nor Alpha Vantage could
    produce a usable company result at all - the router layer already maps those to clean
    HTTP responses. Otherwise this never raises: an Alpha Vantage failure (fundamentals or
    quote, rate-limited/unconfigured/unreachable) degrades to whatever SEC alone can provide,
    and an SEC failure (unsupported ticker, unreachable, nothing extractable) degrades to the
    pre-SEC-EDGAR Alpha-Vantage-only path."""
    ticker = ticker.strip().upper()

    sec_info = sec_edgar.lookup_cik(ticker)
    sec_periods = _fetch_sec_periods(sec_info["cik"]) if sec_info else []
    sec_by_date = {p["fiscal_year_end"]: p for p in sec_periods}

    fundamentals, av_error = _fetch_av_fundamentals_or_none(ticker)

    if not sec_periods and fundamentals is None:
        # Neither provider produced anything usable for this ticker - av_error is the most
        # specific, meaningful signal available (already a typed exception the router maps
        # cleanly), so it's raised as-is rather than synthesizing a new generic one.
        raise av_error

    overview = fundamentals["overview"] if fundamentals else {}
    income_by_date = _index_by_fiscal_date(fundamentals["income_reports"]) if fundamentals else {}
    balance_by_date = _index_by_fiscal_date(fundamentals["balance_reports"]) if fundamentals else {}
    cash_flow_by_date = _index_by_fiscal_date(fundamentals["cash_flow_reports"]) if fundamentals else {}

    display_dates = _canonical_period_dates(sec_periods, income_by_date)
    prior_pool = _prior_period_pool(sec_periods, income_by_date, balance_by_date)

    def values_for(fiscal_date):
        sec_period = _closest_by_date(sec_by_date, fiscal_date)
        sec_values = sec_period["values"] if sec_period else None
        av_values = _extract_av_values(
            _closest_by_date(income_by_date, fiscal_date),
            _closest_by_date(balance_by_date, fiscal_date),
            _closest_by_date(cash_flow_by_date, fiscal_date),
        )
        return _merge_values(sec_values, av_values)

    periods = []
    for fiscal_date in display_dates:
        merged_values, source = values_for(fiscal_date)
        prior_date = _prior_date(prior_pool, fiscal_date)
        # The prior period is looked up for its balance-sheet fields only (NWC needs
        # current_assets/cash/current_liabilities/current_debt, nothing income-statement-
        # shaped) - it's never itself displayed, so a balance-only prior year (no matching
        # income statement) is exactly as usable here as a fully-reported one.
        prior_merged_values = values_for(prior_date)[0] if prior_date else None
        periods.append(_compute_period(fiscal_date, merged_values, prior_merged_values, source))
    periods = _with_growth_and_margin(periods)

    quote = _fetch_av_quote_or_none(ticker)

    latest_sec_diluted_shares = (
        sec_periods[0]["values"].get("diluted_shares_outstanding") if sec_periods else None
    )
    shares_outstanding = (
        latest_sec_diluted_shares if latest_sec_diluted_shares is not None else _safe_float(overview.get("SharesOutstanding"))
    )

    # SEC's own filer title (from the ticker->CIK lookup, always available whenever sec_info
    # resolves) is a real fallback company name - not fabricated - for when Alpha Vantage's
    # overview isn't available.
    company_name = overview.get("Name") or (sec_info["title"] if sec_info else None) or ticker

    return {
        "profile": {
            "ticker": ticker,
            "company_name": company_name,
            "sector": overview.get("Sector"),
            "industry": overview.get("Industry"),
            "exchange": overview.get("Exchange"),
            "market_capitalization": _safe_float(overview.get("MarketCapitalization")),
            "shares_outstanding": shares_outstanding,
            "current_price": _safe_float(quote.get("05. price")) if quote else None,
            "sec_cik": sec_info["cik"] if sec_info else None,
            "sec_filings_url": sec_info["filings_url"] if sec_info else None,
        },
        "periods": periods,
        "source": {
            "fundamentals_provider": "sec_edgar" if sec_periods else "alpha_vantage",
            "market_data_provider": "alpha_vantage" if quote else None,
            "sec_filings_provider": "sec_edgar" if sec_info else None,
        },
    }
