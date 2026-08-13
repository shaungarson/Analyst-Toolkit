# Analyst Toolkit — Progress

## Current Phase
Phase 4 — Professional Utility (scenario saving done, export/print not yet started)

## Done
* React + Vite frontend scaffolded (`frontend/`)
* FastAPI backend scaffolded (`backend/`), with a Python venv and pinned `requirements.txt`
* Local dev setup confirmed end-to-end: frontend calls backend via a Vite dev proxy on `/api/*`
* Git repo initialized
* **Real Estate Underwriting MVP** (Phase 2, committed): cap rate, monthly-amortized debt
  schedule, cash-on-cash, IRR, equity multiple, exit valuation, with a working form and 9
  hand-verified backend tests
* **DCF Valuation MVP** (Phase 3): unlevered FCF projected from a base year at a flat growth
  rate, end-of-year discounting, Gordon Growth terminal value, enterprise/equity value bridge,
  value per share — all pure functions in `backend/app/calculations/dcf.py`
* `POST /api/dcf/valuation` endpoint, with Pydantic validation that rejects WACC ≤ terminal
  growth rate (undefined/negative terminal value otherwise)
* 7 more backend tests (16 total), including a zero-growth case that collapses to a simple
  perpetuity formula as an independent hand check
* DCF valuation form in the frontend (`frontend/src/features/dcf/`): forecast/discount-rate/
  bridge inputs, a one-click worked example, results display, and the forecast/discounting table
* Shared formatting helpers (`frontend/src/lib/format.js`) and shared form/results styling
  (`frontend/src/styles/feature-form.css`) factored out once a second module needed them
* Simple tab-based navigation between Real Estate and DCF (no router dependency yet — not
  needed until deep-linking/URLs matter)
* Verified end-to-end in the browser: both modules' worked examples, cross-checked by hand
  against the displayed results

* **Local scenario saving** (Phase 4): save a named set of inputs to `localStorage` and reload
  it later, for both modules. Built as one shared hook (`frontend/src/lib/useScenarios.js`) and
  one shared UI component (`frontend/src/components/ScenarioManager.jsx`), each module supplies
  its own storage key so the two modules' saved scenarios never mix. Verified in the browser:
  save, full page reload (confirms real persistence, not just in-memory state), load back into
  the form, delete.

## In Progress
* (nothing yet)

## Near-Term Next Steps
* Git commit for scenario saving
* Continue Phase 4: CSV export of results, print/PDF-friendly output for both modules

## Deferred (intentionally, for now)
* Real estate: multi-year cash flows, rent/NOI growth, acquisition/disposition costs, refinancing, multiple debt tranches, sensitivity analysis, scenario comparison, waterfalls/promotes
* DCF: historical financials, revenue-driver forecasts, margin/working-capital/CapEx modeling, WACC build-up, comparable-company inputs, scenario analysis
* TypeScript adoption
* Backend / database / auth / cloud storage
* AI analyst features (Phase 9)

## Decision Log

**2026-08-12 — Stack: React + Vite, plain JavaScript**
Alternatives considered: plain HTML/CSS/JS (simpler but less portfolio-recognizable), TypeScript from day one (adds learning overhead before it pays off).
Chosen because React is the most recognizable choice for the target audience and supports the stated learning goal of understanding component architecture; TypeScript deferred until the codebase justifies it.

**2026-08-12 — Backend: Python (FastAPI), added from day one**
Alternatives considered: no backend, calculations done in JavaScript in the browser (simpler, no deployment/CORS complexity, was the original plan).
Chosen despite the added setup because Python is the language most associated with analyst/data work, and this keeps the door open for heavier data analysis later (comps pulls, backtesting) without a later migration. Tradeoff accepted: more moving parts for V1 (two languages, two deployments, network calls between them) in exchange for using the "right" language for the domain from the start.

**2026-08-12 — Real estate V1 scope: single-period + basic debt amortization**
Alternatives considered: single-period only (simpler, faster to ship); multi-year from the start (more realistic but slower and riskier for a first milestone).
Chosen as the middle ground — debt amortization is core to real analyst underwriting credibility, but full multi-year modeling is deferred to keep V1 shippable.

**2026-08-12 — Local scenario saving: localStorage first**
Chosen over an immediate backend to stay consistent with the frontend-first philosophy (Section 10 of CLAUDE.md). Revisit only if localStorage proves genuinely limiting.

**2026-08-12 — Frontend/backend connected via Vite dev proxy, not hardcoded URLs**
Alternatives considered: hardcoding `http://localhost:8000` in frontend fetch calls (simpler but breaks in production and couples frontend to a specific backend host/port).
Chosen because it keeps frontend code environment-agnostic (`/api/*` works locally and in deployment with reverse-proxy config) and avoids CORS complexity in the browser during development.

**2026-08-12 — Backend dev server moved from port 8000 to 8001**
An orphaned process from an earlier dev session (unkillable through available tooling — an environment quirk, not a code issue) held port 8000. Moved the backend and the Vite proxy target to 8001 rather than spend more time chasing it. No effect on app behavior; note it here so a stale "port 8000 in use" doesn't cause confusion later.

**2026-08-12 — Debt amortization: monthly-pay, monthly-compounding**
Alternatives considered: annual-pay/annual-compounding (simpler, matches the annual periodicity used elsewhere in V1).
Flagged to the user as a genuine convention choice (Section 7). Chosen because it matches how real commercial mortgages actually amortize, at an acceptable complexity cost — the monthly loop is rolled up into annual rows for display, so the rest of the model (NOI, cash flows, IRR) stays on annual periods.

**2026-08-12 — Real estate V1 exit valuation uses flat going-in NOI, no acquisition/disposition costs**
Since NOI growth is out of scope for V1, exit-year NOI is modeled as identical to going-in NOI (not a forward-looking grown NOI, which is the more common real-world convention). Sale proceeds and initial equity are computed with no transaction costs deducted, consistent with those being explicitly deferred items. Both are stated as visible assumptions in the results UI so they're never silently baked in.

**2026-08-12 — DCF discounting: end-of-year convention, not mid-year**
Alternatives considered: mid-year convention (each year's cash flow discounted as if received at the midpoint, standard in professional banking models, typically increases valuation a few percent).
Flagged to the user as a genuine convention choice (Section 7) — clarified in plain terms (it only changes the exponent n in CF/(1+r)^n, not the formula itself) before deciding. Chosen: end-of-year, for V1 simplicity; mid-year is a natural enhancement to revisit later since it's more realistic.

**2026-08-12 — DCF V1 forecast uses a single flat FCF growth rate, not revenue-driver modeling**
Since revenue-driver/margin/CapEx build-up is explicitly deferred (Section 3), the explicit forecast period grows the base-year FCF at one flat annual rate, separate from (and typically higher than) the terminal growth rate used in the Gordon Growth terminal value. This mirrors real estate's "flat NOI" simplification and is stated as a visible assumption in the results UI.

**2026-08-12 — Shared frontend styling/formatting factored out once DCF needed it**
`currency`/`percent` helpers moved to `frontend/src/lib/format.js`, and the form/results CSS (fieldset layout, metric tiles, table styling) moved to `frontend/src/styles/feature-form.css` under a generic `.feature-page` wrapper class. Not done speculatively — done at the point a second module actually needed the same patterns, per Section 16.
