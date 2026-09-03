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
    │             confidently map, and the sole source for the reference price - genuinely
    │             independent, not a hard dependency (server-side-only API key)
    ▼
app/services/company_data.py — merges both, field by field, into one provider-agnostic
    shape (FinancialPeriod.source discloses "sec_edgar" / "alpha_vantage" / "mixed" per
    period; FinancialPeriod.provenance discloses per-field status/filing metadata),
    computes unlevered FCF via app/calculations/company_financials.py
    ▼
JSON response → populates the DCF form; the analyst still reviews and runs it manually
```

For an SEC-supported ticker, Alpha Vantage being rate-limited, unconfigured, or unreachable
never blocks the request - company periods build directly from SEC's own fiscal dates, not
Alpha Vantage's, and Alpha Vantage-only profile fields (sector, industry, exchange, market
cap, reference price) are simply absent rather than fabricated. A clean, typed error is only
raised when neither provider can produce a usable result at all - live-verified with the
Alpha Vantage key removed entirely (AAPL, WMT: full 5-period SEC-sourced responses, reference
price and Alpha-Vantage-only profile fields correctly absent, not defaulted).

Key backend modules:
- `app/services/sec_edgar.py` — ticker→CIK lookup, raw SEC XBRL company-facts fetch, typed
  errors (`SECDataUnavailableError`), request pacing, 24h cache. `filing_index_url(cik,
  accession_number)` builds the public per-filing index page URL used as each provenance
  component's source link (live-verified against a real Apple accession number).
- `app/services/sec_fundamentals.py` — maps SEC XBRL concepts onto the DCF's field set via
  per-concept fallback chains; period selection (annual, duration-filtered,
  most-recently-filed-wins); cash and debt derivation. Returns values plus full per-fact
  provenance (tag, accession number, filed date, form, confidence) — exposed via the API as
  of the per-value provenance milestone (2026-08-31); see `app/schemas/company.py` below and
  `docs/decisions.md`.
- `app/services/alpha_vantage.py` — fundamentals/quote client, typed errors, request
  throttling, 24h fundamentals / 15min quote caches.
- `app/services/company_data.py` — orchestrates both providers. Company periods are built
  from the union of both providers' own fiscal dates (SEC's date wins as canonical wherever
  the two are within a 10-day tolerance of each other - Alpha Vantage normalizes 52/53-week
  fiscal years to calendar month-end; SEC reports the filer's actual date), then merged
  field-by-field (SEC primary, Alpha Vantage fallback), threading a per-field provenance dict
  alongside every merged value the whole way through (`_sec_field_provenance` /
  `_av_field_provenance` / `_calculated_provenance`, built from a single shared
  `_AV_FIELD_MAP` so the value-extraction and provenance-construction paths can't drift).
  Alpha Vantage fundamentals and the Alpha Vantage quote are each fetched best-effort and
  independently of everything else - a failure in either degrades gracefully rather than
  propagating; a typed error is only raised when neither provider produced anything usable
  for the ticker at all.
- `app/schemas/company.py` — the provider-agnostic `CompanyData`/`FinancialPeriod`/
  `CompanyProfile` shape the frontend consumes; carries no provider-specific structure.
  `FinancialPeriod.provenance` is a `dict[str, FieldProvenance]` keyed by field name;
  `FieldProvenance.status` is one of `reported` (single direct SEC fact) / `combined` (summed
  from multiple SEC facts, e.g. cash + short-term investments) / `calculated` (derived by
  formula from other already-resolved fields, no single underlying fact) / `fallback` (SEC
  data could not be confidently mapped, so Alpha Vantage supplied it - never labeled
  `reported`), each with a
  `components` list (`ProvenanceComponent`: source, tag/Alpha-Vantage-field, fiscal
  year/period, filing form/date, accession number, source URL) or, for `calculated`, a plain
  formula string instead. `CompanyProfile.reference_price`/`reference_price_as_of` replaced
  the old `current_price` (a clean rename, no compat shim - internal API, one frontend
  consumer). `CompanyDataSource.market_data_provider` is nullable - `None` when no reference
  price came from anywhere, not a claim that Alpha Vantage supplied one.

`ALPHA_VANTAGE_API_KEY` is a server-side-only environment variable, never accepted from or
returned to the browser. Ticker search for an SEC-supported company works with no key
configured at all; only the reference price and Alpha-Vantage-only profile fields are absent.

## Embedded Costco demo

`frontend/src/features/dcf/costcoDemo.js` is a frozen, static data module - real SEC EDGAR
data (5 years, full per-field provenance, transcribed by hand from a live production API
call) plus a separately-sourced, dated reference price - shaped exactly like a live
`CompanyData` API response so `CompanySourcedData`/`SourcedHistoryPanel`/the provenance UI
render it with zero special-casing. A full-sized "Costco Demo" button in `CompanyHeader.jsx`
(replacing the DCF module's old synthetic "Load Example") activates the demo on first click,
available in either Quick DCF or Driver-Based mode and never mode-gated
(`DcfValuation.jsx`'s `activateCostcoDemo()` populates the same form fields a live ticker load
would, plus Base Growth's assumptions AND `costcoDemo.js`'s `COSTCO_DRIVER_BASE_CASE`, so
whichever mode is active already shows a complete, ready-to-run preset and the other mode's is
waiting the moment the analyst switches to it), and thereafter only opens/closes the
`CostcoDemoPanel.jsx` disclosure, whose second paragraph is mode-aware. Quick mode's case
selection (Low/Base/High Growth) is three WAI-ARIA result tabs under Valuation Summary, not
buttons in the disclosure, and never renders in Driver mode - Driver-Based DCF has no
Low/Base/High case management for any company, Costco included. Activating the demo makes no
network request in either mode; in Quick mode, one click of Run Valuation fires three parallel
calls to the same `/api/dcf/valuation` + `/api/dcf/sensitivity` endpoints every other path in
the app uses (`runDemoValuation()`, `reconcileDemoResults()` in `demoCaseLogic.js`), and
switching tabs afterward is request-free; in Driver mode, Run Valuation is the same
`/api/dcf/driver-valuation` + `/api/dcf/driver-sensitivity` call any Driver-Based forecast
uses. See `docs/decisions.md`'s "DCF demo-entry consolidation and the one-run, three-tab case
model" record for the Quick-mode design rationale, and "Costco demo: a provider-independent
Driver Base Case" for the Driver-mode extension.

## Historical trend mini-charts

`frontend/src/features/dcf/HistoricalTrendCharts.jsx` - two compact CSS bar charts
(Revenue, Unlevered FCF) rendered inside `CompanySourcedData.jsx` for both a live ticker
load and the embedded Costco demo. Reads only the `periods` array already present on
`companyData`; no chart library, no new request. See `docs/decisions.md`'s "Historical
trend mini-charts" record for the negative/zero/missing-value handling and print-specific
details.

## Reverse DCF (price-implied FCF growth)

`backend/app/calculations/dcf.py`'s `_compute_dcf_core(fcfs, wacc, terminal_growth_rate,
net_debt, diluted_shares_outstanding)` is the one place the forward valuation formula (given
an already-built annual FCF schedule) is actually implemented — `_compute_dcf` (Quick DCF's
flat-growth path, via `project_fcf`), `_compute_driver_dcf` (Driver-Based DCF's path, via
`project_driver_years`; see below), and `implied_fcf_growth_rate` (the reverse solver, via
`_compute_dcf`) all route through it rather than each computing enterprise value / equity
value / value per share their own way, so no two of them can ever silently drift into
disagreement. `run_dcf` wraps `_compute_dcf` with rounding and the forecast-schedule shape;
the solver bisects against `_compute_dcf`'s raw, unrounded `value_per_share` directly, never
against an already-cent-quantized target. `POST /api/dcf/implied-growth` (`ReverseDCFInputs`
→ `ReverseDCFResult`) is a thin router wrapper over `implied_fcf_growth_rate`, following the
same typed-exception-to-422 pattern as the other DCF routes. See
`docs/MODELING_CONVENTIONS.md` for the solver's domain, its three outcome statuses, and the
forward/reverse invalidation matrix, and `docs/decisions.md` for the full design record.

## Driver-Based DCF (v1)

A second forecast-entry mode alongside Quick DCF, sharing `_compute_dcf_core` (above) rather
than duplicating the valuation engine. `project_driver_years(base_year_revenue, driver_years)`
builds the per-year revenue/EBIT/cash-taxes/NOPAT/D&A/CapEx/ΔNWC/UFCF schedule from plain
dict-shaped driver inputs (mirroring the calculation layer's existing pattern of operating on
plain Python values, never pydantic model instances directly); `run_driver_dcf` extracts each
year's UFCF for `_compute_dcf_core` and re-attaches every other field to the rounded result
rows, so the two can never drift out of sync. `driver_dcf_sensitivity` is the structural
sibling of `dcf_sensitivity`, calling `run_driver_dcf` per grid cell instead of `run_dcf`, and
returns the same `DcfSensitivityResults` shape. New routes: `POST /api/dcf/driver-valuation`
(`DriverDCFInputs` → `DriverDCFResults`) and `POST /api/dcf/driver-sensitivity`
(`DriverDCFInputs` → `DcfSensitivityResults`) — no `/driver-implied-growth` route exists;
Reverse DCF stays Quick DCF-only (see `MODELING_CONVENTIONS.md`).

Frontend: two pure modules plus one component, with all state held by `DcfValuation.jsx`.

`driverSchedule.js` — resizing the per-year array to the shared forecast length, building the
request payload, the `driverInputsError` completeness check covering every field that payload
converts (which the Run Valuation and scenario-comparison paths must pass before any request is
made, and which `buildDriverPayload` also enforces itself by throwing), the Flat/Fade/Custom row
mode generators (`setFlatValue`, `setFadeEndpoint`, `fadeValues`, `applyRowMode`,
`resizeDriverYearsWithModes`), `forecastYearLabels`, and `buildBaseForecast`/`clearSeededRows`
for the Initialize Forecast action.

`driverHistory.js` — per-driver historical evidence from the already-loaded sourced periods:
observations, exclusions with stated reasons, the normalized reference statistic (median, or
aggregate ΣΔNWC ÷ ΣΔRevenue for working capital), and the reliability classification that
decides whether a driver may be seeded at all. Pure and network-free; it reads
`CompanyData.periods` and computes ratios only. **No part of the frontend reproduces
`project_driver_years`** — the backend remains the sole implementation of the projection
arithmetic, and per-year cash flows are read from the post-run forecast schedule rather than
previewed client-side.

Row modes are UI-level generators over the same `driverYears` array the API has always
received, so the payload, warnings, scenario save/load and CSV export are unaffected by them; a
seeded schedule and a hand-typed identical one produce byte-identical payloads.

`DriverScheduleBuilder.jsx` — the full-width panel itself (evidence and mode columns, the
per-year grid revealed by Custom mode, the Initialize Forecast plan, and the methodology
disclosure), rendered above the three-column `analytical-row` grid in `DcfValuation.jsx` — the
same full-width-panel slot `CostcoDemoPanel` already uses, not squeezed into the narrow
Assumptions column. `DcfValuation.jsx` holds `forecastMode` (`'quick' | 'driver'`) and Driver
mode's own `driverForm` (base-year revenue, `driverYears`, `rowModes`, `seededFields`) plus
`driverResults`/`driverSensitivity` state, entirely separate from Quick DCF's — switching modes is an
explicit reset of every result/sensitivity/reverse/explain-relevant piece of state (never a
stale flag), so a Quick-mode number can never render under Driver-mode framing or vice versa.
`activeResults`/`activeSensitivity`/`activeError`/`activeResultsStale` are mode-aware
(Driver's own state when Driver mode is active; the existing demo-tab-or-single-run logic
otherwise), which is what let the Analysis Outputs card, `explainValuation.js`, and the
sensitivity-grid rendering all pick up Driver mode with zero Driver-specific branching. See
`docs/decisions.md`'s "Driver-Based DCF (v1)" record for the full design history, including
the deltas made during three rounds of review.

## Explain This Valuation

`frontend/src/features/dcf/explainValuation.js` - a pure function returning up to three
deterministic observations synthesized from outputs the forward DCF, reverse DCF, sensitivity
grid, and `historicalGrowth.js` already compute. No change to the valuation engine or
methodology - only presentation-level differences, ratios, and ranges; no backend or schema
change, no new request. Rendered as a semantic `<h3>`/`<ul>` block in `DcfValuation.jsx`, after the
reverse-DCF card and before Analysis Outputs; renders nothing when no diagnostic currently
qualifies. Each observation independently gates on the same `showActiveResults`/
`showReverseResult` flags the rest of the workstation already uses, so it never needs its
own staleness logic. See `docs/decisions.md`'s "Explain This Valuation" record for the full
design rationale, including the corrections made during review.

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

153 backend tests (`backend/tests/`), fixture-based — no live network calls in the suite.
`.github/workflows/ci.yml` runs on every push and pull request: `pytest` for the backend,
`oxlint` + `vite build` for the frontend, pinned to the same Python/Node versions used in
local dev.

## Documentation map

See [`CLAUDE.md`](../CLAUDE.md)'s Document Map section for where each kind of project
knowledge lives.
