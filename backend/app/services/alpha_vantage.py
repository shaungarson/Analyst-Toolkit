"""Thin client for Alpha Vantage's fundamental-data and quote endpoints.

Raises typed errors so the router layer can turn them into clear, honest API responses
instead of silently returning partial or fabricated data. The API key is read from the
server-side ALPHA_VANTAGE_API_KEY environment variable only - it is never accepted from
or returned to the frontend.
"""

import os
import time

import httpx

BASE_URL = "https://www.alphavantage.co/query"
_TIMEOUT_SECONDS = 10.0

# The free tier enforces roughly 1 request/second - a single "Load Company" call makes
# several sequential requests (overview, income statement, balance sheet, cash flow,
# quote), which tripped this limit when fired back to back with no pacing (confirmed live:
# Alpha Vantage returned its per-second rate-limit notice on the very first real-key test).
# Throttling here, at the single point every call passes through, covers all callers
# without the orchestration layer needing to know about it.
_MIN_SECONDS_BETWEEN_REQUESTS = 1.2
_last_request_at = 0.0


def _throttle():
    global _last_request_at
    elapsed = time.monotonic() - _last_request_at
    if elapsed < _MIN_SECONDS_BETWEEN_REQUESTS:
        time.sleep(_MIN_SECONDS_BETWEEN_REQUESTS - elapsed)
    _last_request_at = time.monotonic()


class AlphaVantageError(Exception):
    """Base class for all Alpha Vantage integration errors."""


class ProviderNotConfiguredError(AlphaVantageError):
    """The server is missing its ALPHA_VANTAGE_API_KEY."""


class ProviderUnavailableError(AlphaVantageError):
    """Network failure or non-2xx response talking to Alpha Vantage."""


class RateLimitedError(AlphaVantageError):
    """Alpha Vantage's daily/per-minute call budget has been exhausted."""


class TickerNotFoundError(AlphaVantageError):
    """The ticker doesn't resolve to a company Alpha Vantage has data for."""


def _request(params):
    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        raise ProviderNotConfiguredError("ALPHA_VANTAGE_API_KEY is not configured on the server.")

    _throttle()
    try:
        response = httpx.get(BASE_URL, params={**params, "apikey": api_key}, timeout=_TIMEOUT_SECONDS)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ProviderUnavailableError(f"Could not reach the market-data provider: {exc}") from exc

    data = response.json()
    # Alpha Vantage signals rate limits and other soft errors with a 200 response body
    # containing "Note" (legacy) or "Information" (current), not an HTTP error status -
    # these must be detected explicitly or they'd be misread as valid, empty data.
    if "Note" in data or "Information" in data:
        raise RateLimitedError(data.get("Note") or data.get("Information"))
    return data


def fetch_overview(ticker):
    data = _request({"function": "OVERVIEW", "symbol": ticker})
    if not data or "Symbol" not in data:
        raise TickerNotFoundError(f"No company overview found for '{ticker}'.")
    return data


def fetch_income_statement(ticker):
    data = _request({"function": "INCOME_STATEMENT", "symbol": ticker})
    if not data.get("annualReports"):
        raise TickerNotFoundError(f"No income statement data found for '{ticker}'.")
    return data


def fetch_balance_sheet(ticker):
    data = _request({"function": "BALANCE_SHEET", "symbol": ticker})
    if not data.get("annualReports"):
        raise TickerNotFoundError(f"No balance sheet data found for '{ticker}'.")
    return data


def fetch_cash_flow(ticker):
    data = _request({"function": "CASH_FLOW", "symbol": ticker})
    if not data.get("annualReports"):
        raise TickerNotFoundError(f"No cash flow data found for '{ticker}'.")
    return data


def fetch_quote(ticker):
    data = _request({"function": "GLOBAL_QUOTE", "symbol": ticker})
    quote = data.get("Global Quote")
    if not quote:
        raise TickerNotFoundError(f"No quote found for '{ticker}'.")
    return quote
