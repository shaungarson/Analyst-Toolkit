# Analyst Toolkit — Progress

## Current Phase
Phase 2 — Real Estate Underwriting MVP (V1 scope complete)

## Done
* React + Vite frontend scaffolded (`frontend/`)
* FastAPI backend scaffolded (`backend/`), with a Python venv and pinned `requirements.txt`
* Local dev setup confirmed end-to-end: frontend calls backend via a Vite dev proxy on `/api/*`
* Git repo initialized
* Real estate underwriting calculation module (`backend/app/calculations/real_estate.py`): cap
  rate, monthly-amortized debt schedule, cash-on-cash, IRR, equity multiple, exit valuation —
  all pure functions, separate from the API layer
* `POST /api/real-estate/underwrite` endpoint with Pydantic input validation
* 9 backend tests with hand-verifiable expected values (`backend/tests/test_real_estate.py`),
  all passing
* Real estate underwriting form in the frontend (`frontend/src/features/real-estate/`): inputs
  for acquisition/financing/hold/exit, a one-click worked example, results display, and the
  full amortization schedule table
* Verified end-to-end in the browser with the worked example deal

## In Progress
* (nothing yet)

## Near-Term Next Steps
* Git commit for the Phase 2 real estate MVP
* Start Phase 3: DCF Valuation MVP (Section 3 V1 scope)

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
