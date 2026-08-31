# Architecture

Current technical state of Analyst Toolkit. This describes *what is*, not *why* — see
[`decisions.md`](decisions.md) for reasoning and alternatives considered.

## Overview

```
Browser (React SPA, static build on Vercel)
    │  fetch('/api/...')
    ▼
FastAPI backend (Render)
    │  Pydantic validates input bounds
    ▼
Pure calculation functions (backend/app/calculations/)
    │  no framework code, no side effects
    ▼
JSON response → rendered in the browser
```

- **Frontend:** React 19 + Vite 8, plain JavaScript (no TypeScript). Components organized by
  feature: `frontend/src/features/real-estate/`, `frontend/src/features/dcf/`. Genuinely
  shared pieces (scenario saving, CSV export, formatting helpers, print styles) live in
  `frontend/src/lib/` and `frontend/src/components/`, factored out once — and only once — a
  second module needed them.
- **Backend:** Python (FastAPI). Stateless: no database, no auth, no persistent storage.
  Saved scenarios live entirely in the browser's `localStorage`. The backend's role stays
  narrow — validate input, run the calculation, return the result — with one exception (the
  DCF ticker-search pipeline below).
- **Deployment:** Vercel (static frontend build) + Render (Python API), both auto-deploying
  from GitHub on push to `main`. Local dev: Vite's dev server proxies `/api/*` to the backend
  (`frontend/vite.config.js`); production uses `VITE_API_BASE_URL` to call Render directly.
  CORS origins are read from an `ALLOWED_ORIGINS` env var on the backend.

## DCF ticker-search data pipeline

```
Browser: GET /api/company/{ticker}
    ▼
FastAPI backend (Render)
    │  SEC EDGAR: primary source for historical fundamentals (XBRL company facts, no key
    │             required) plus ticker → CIK lookup and a filings-index link
    │  Alpha Vantage: optional field-level enrichment/fallback for anything SEC couldn't
    │             confidently map, and the sole source for current price - genuinely
    │             independent, not a hard dependency (server-side-only API key)
    ▼
app/services/company_data.py — merges both, field by field, into one provider-agnostic
    shape (FinancialPeriod.source discloses "sec_edgar" / "alpha_vantage" / "mixed" per
    period), computes unlevered FCF via app/calculations/company_financials.py
    ▼
JSON response → populates the DCF form; the analyst still reviews and runs it manually
```

For an SEC-supported ticker, Alpha Vantage being rate-limited, unconfigured, or unreachable
never blocks the request - company periods build directly from SEC's own fiscal dates, not
Alpha Vantage's, and Alpha Vantage-only profile fields (sector, industry, exchange, market
cap, current price) are simply absent rather than fabricated. A clean, typed error is only
raised when neither provider can produce a usable result at all - live-verified with the
Alpha Vantage key removed entirely (AAPL, WMT: full 5-period SEC-sourced responses, current
price and Alpha-Vantage-only profile fields correctly absent, not defaulted).

Key backend modules:
- `app/services/sec_edgar.py` — ticker→CIK lookup, raw SEC XBRL company-facts fetch, typed
  errors (`SECDataUnavailableError`), request pacing, 24h cache.
- `app/services/sec_fundamentals.py` — maps SEC XBRL concepts onto the DCF's field set via
  per-concept fallback chains; period selection (annual, duration-filtered,
  most-recently-filed-wins); cash and debt derivation. Returns values plus full per-fact
  provenance (tag, accession number, filed date, form, confidence), computed but not yet
  exposed via the API.
- `app/services/alpha_vantage.py` — fundamentals/quote client, typed errors, request
  throttling, 24h fundamentals / 15min quote caches.
- `app/services/company_data.py` — orchestrates both providers. Company periods are built
  from the union of both providers' own fiscal dates (SEC's date wins as canonical wherever
  the two are within a 10-day tolerance of each other - Alpha Vantage normalizes 52/53-week
  fiscal years to calendar month-end; SEC reports the filer's actual date), then merged
  field-by-field (SEC primary, Alpha Vantage fallback). Alpha Vantage fundamentals and the
  Alpha Vantage quote are each fetched best-effort and independently of everything else - a
  failure in either degrades gracefully rather than propagating; a typed error is only
  raised when neither provider produced anything usable for the ticker at all.
- `app/schemas/company.py` — the provider-agnostic `CompanyData`/`FinancialPeriod`/
  `CompanyProfile` shape the frontend consumes; carries no provider-specific structure.
  `CompanyDataSource.market_data_provider` is nullable - `None` when no current price came
  from anywhere, not a claim that Alpha Vantage supplied one.

`ALPHA_VANTAGE_API_KEY` is a server-side-only environment variable, never accepted from or
returned to the browser. Ticker search for an SEC-supported company works with no key
configured at all; only current price and Alpha-Vantage-only profile fields are absent.

## Calculation and validation layers

- `backend/app/calculations/` — pure functions, no framework code, no side effects (real
  estate underwriting, DCF, company-financials derivation, risk flags). Directly unit-tested
  against hand-computed values.
- `backend/app/schemas/` — Pydantic models; cross-field validators enforce genuine
  computational/structural invalidity (see `MODELING_CONVENTIONS.md` for what that boundary
  means for each field).
- `backend/app/routers/` — thin HTTP layer; maps typed service/calculation exceptions to
  clean HTTP responses (404/422/429/500/502) rather than raw tracebacks.
- Deterministic risk flags (`backend/app/calculations/risk_flags.py`) are a third layer that
  reads already-computed underwriting/sensitivity output; it does not modify the calculation
  layer.

## Testing and CI

133 backend tests (`backend/tests/`), fixture-based — no live network calls in the suite.
`.github/workflows/ci.yml` runs on every push and pull request: `pytest` for the backend,
`oxlint` + `vite build` for the frontend, pinned to the same Python/Node versions used in
local dev.

## Documentation map

See [`CLAUDE.md`](../CLAUDE.md)'s Document Map section for where each kind of project
knowledge lives.
