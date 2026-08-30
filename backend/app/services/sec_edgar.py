"""SEC EDGAR ticker-to-CIK lookup, filings-index links, and XBRL company-facts fetching.

Company facts (the full set of a filer's historical XBRL data, all concepts and periods)
are fetched raw here; mapping those concepts into the DCF's financial fields lives in
app/services/sec_fundamentals.py, since XBRL tag naming for the same concept is genuinely
inconsistent across companies and that normalization is substantial enough to deserve its
own module. See the PROGRESS.md Decision Log entry for the evaluation behind that split.

No API key required, but SEC requires a descriptive User-Agent identifying the caller, and
fair-access norms call for conservative request pacing - both honored here the same way
app/services/alpha_vantage.py paces its own provider.
"""

import time

import httpx

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FILINGS_URL_TEMPLATE = (
    "https://www.sec.gov/cgi-bin/browse-edgar"
    "?action=getcompany&CIK={cik}&type=10-K&dateb=&owner=include&count=40"
)
COMPANY_FACTS_URL_TEMPLATE = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
_USER_AGENT = "Analyst Toolkit (portfolio project) contact@analyst-toolkit.local"
_TIMEOUT_SECONDS = 10.0

# SEC's fair-access policy permits up to ~10 requests/second; pacing well under that (as
# alpha_vantage.py does for its own, much stricter, provider) costs nothing in practice
# since company-facts responses are cached for a full day, and keeps this app a well-behaved
# caller even when looking up several tickers back to back.
_MIN_SECONDS_BETWEEN_REQUESTS = 0.2
_last_request_at = 0.0

# Company facts (all historical XBRL concepts for one filer) change only when that filer
# publishes a new filing - a day-long TTL mirrors FUNDAMENTALS_TTL_SECONDS in
# app/services/company_data.py, which this cache is a companion to.
FACTS_TTL_SECONDS = 24 * 60 * 60
_facts_cache = {}  # cik -> (expires_at, company facts JSON)


class SECEdgarError(Exception):
    """Base class for all SEC EDGAR integration errors."""


class SECDataUnavailableError(SECEdgarError):
    """Network failure or non-2xx response talking to SEC EDGAR."""


def _throttle():
    global _last_request_at
    elapsed = time.monotonic() - _last_request_at
    if elapsed < _MIN_SECONDS_BETWEEN_REQUESTS:
        time.sleep(_MIN_SECONDS_BETWEEN_REQUESTS - elapsed)
    _last_request_at = time.monotonic()

# The ticker->CIK map is SEC's own static reference file, updated only occasionally - it's
# fine to load it once per backend process and reuse it, rather than re-fetching per
# request or coupling it to the market-data caches, which have real freshness
# requirements this data doesn't share.
_ticker_map_cache = None


def _load_ticker_map():
    global _ticker_map_cache
    if _ticker_map_cache is not None:
        return _ticker_map_cache

    response = httpx.get(TICKERS_URL, headers={"User-Agent": _USER_AGENT}, timeout=_TIMEOUT_SECONDS)
    response.raise_for_status()
    data = response.json()
    _ticker_map_cache = {
        entry["ticker"].upper(): {"cik": str(entry["cik_str"]).zfill(10), "title": entry["title"]}
        for entry in data.values()
    }
    return _ticker_map_cache


def lookup_cik(ticker):
    """Returns {"cik", "title", "filings_url"} or None if the ticker isn't a company SEC
    has on file (e.g. a non-US-listed company)."""
    try:
        ticker_map = _load_ticker_map()
    except httpx.HTTPError:
        return None

    entry = ticker_map.get(ticker.strip().upper())
    if entry is None:
        return None
    return {
        "cik": entry["cik"],
        "title": entry["title"],
        "filings_url": FILINGS_URL_TEMPLATE.format(cik=int(entry["cik"])),
    }


def fetch_company_facts(cik):
    """Returns the filer's full SEC XBRL company-facts payload (every reported concept and
    period) for the given zero-padded CIK string. Raises SECDataUnavailableError on any
    network failure or non-2xx response - callers are expected to treat that as "SEC data
    isn't available right now" and fall back accordingly, not as a fatal error, since Alpha
    Vantage alone is a fully working path this app has run on before SEC was added."""
    now = time.time()
    entry = _facts_cache.get(cik)
    if entry is not None and entry[0] > now:
        return entry[1]

    _throttle()
    try:
        response = httpx.get(
            COMPANY_FACTS_URL_TEMPLATE.format(cik=cik),
            headers={"User-Agent": _USER_AGENT},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise SECDataUnavailableError(f"Could not reach SEC EDGAR: {exc}") from exc

    facts = response.json()
    _facts_cache[cik] = (now + FACTS_TTL_SECONDS, facts)
    return facts
