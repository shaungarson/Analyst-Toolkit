"""SEC EDGAR ticker-to-CIK lookup and filings-index links.

V1 scope: identifies which SEC filer a ticker corresponds to and links to that company's
real filing history on EDGAR, so a sourced figure can eventually be traced back to the
actual 10-K/10-Q it came from. Does NOT pull XBRL financial values from SEC yet - tag
naming for the same concept (e.g. D&A) is genuinely inconsistent across companies (Apple
reports it as one combined tag; Microsoft splits it into two separate tags that must be
summed), which needs a dedicated normalization effort, not a quick addition here. See the
PROGRESS.md Decision Log entry for the evaluation behind this split.

No API key required, but SEC requires a descriptive User-Agent identifying the caller.
"""

import httpx

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FILINGS_URL_TEMPLATE = (
    "https://www.sec.gov/cgi-bin/browse-edgar"
    "?action=getcompany&CIK={cik}&type=10-K&dateb=&owner=include&count=40"
)
_USER_AGENT = "Analyst Toolkit (portfolio project) contact@analyst-toolkit.local"
_TIMEOUT_SECONDS = 10.0

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
