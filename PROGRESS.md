# Analyst Toolkit — Progress

## Current Phase
Phase 6 — UX & Visual Design (color/typography direction chosen and applied; responsive
behavior and charts not yet addressed)

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
* **CSV export** (Phase 4): "Export CSV" button in the results header of both modules, downloads
  summary metrics plus the full schedule table via a shared `frontend/src/lib/csv.js` helper —
  no backend involved, since the data's already in the browser. Verified by intercepting the
  generated blob in-browser and checking the actual CSV content, not just that the button doesn't
  error.
* **Print-friendly output** (Phase 4): a print stylesheet (`frontend/src/styles/print.css`) hides
  the nav, input form, and scenario manager when printing, and forces light-background/dark-text
  so it doesn't try to print a dark UI theme. Confirmed the stylesheet registers and its selectors
  match the DOM; a manual Ctrl+P spot-check is still worth doing since this environment can't
  render print media for a screenshot.

* **Phase 5 — edge cases and error handling.** A review pass over both modules' input
  validation turned up two real bugs, not just polish:
  - Real estate: LTV of exactly 100% made initial equity exactly zero, which crashed the
    backend with an unhandled `ZeroDivisionError` (raw 500 response) instead of a clean
    error. Fixed by constraining `ltv` to strictly below 1 in the Pydantic schema.
  - Real estate: the API rejected a 0% interest rate even though the amortization math
    already handled it correctly (and the frontend's own input already allowed 0) — the
    schema was stricter than it needed to be. Fixed by allowing `interest_rate == 0`.
  - DCF: `terminal_growth_rate` allowed up to 100%, which is economically nonsensical for a
    perpetuity (a company can't outgrow the economy forever) and could silently produce a
    wildly inflated valuation from a simple input typo. Capped at 6%.
  - Added 5 new backend tests covering these bounds (19 total).
  - Frontend: distinguished "the backend rejected your input" (shows the specific reason)
    from "the backend is unreachable" (shows a clear "make sure it's running" message) —
    previously both cases showed the same generic "Calculation failed" text. This mattered
    more than expected: because requests go through Vite's dev proxy, a backend outage
    shows up as an HTTP 502 with an unparseable body, not a raw network failure, so the
    two cases needed to be told apart explicitly rather than relying on a try/catch alone.
  - Verified all of this live in the browser, including temporarily stopping the backend
    to confirm the "unreachable" message actually appears, not just that it compiles.

* **Phase 6 — visual direction.** Per Section 15, proposed two concrete visual directions
  (mockups, not just descriptions) once the app's structure was mature enough to be worth
  designing around, rather than picking a look early. Chose "Institutional" — navy/charcoal
  on warm neutrals, muted and conservative — over a "modern fintech" alternative, reasoned
  from the target audience (PE, real estate asset management, recruiters) rather than
  aesthetic preference alone.
  - Applied as CSS custom properties in `frontend/src/index.css` (light + dark mode), so the
    whole app re-themes from one place — no component touches a raw color value.
  - Tightened corner radii app-wide (8/6px → 4-6px) for a crisper, less "consumer app" feel,
    consistent with the chosen direction.
  - Added tabular figures (`font-variant-numeric: tabular-nums`) to all metric values and
    table cells — right-aligned, fixed-width digits read meaningfully more like professional
    financial software than proportional numerals do.
  - Checked WCAG contrast ratios in-browser (not just eyeballed): the initial dark-mode accent
    computed to ~3.9:1 against white button text, under the 4.5:1 AA threshold for normal
    text — caught and darkened before it shipped. Final ratios: light mode buttons 16.8:1,
    dark mode buttons 5.3:1, body text 7:1+ in both modes.
  - Verified computed styles (not just visual screenshots) in both light and dark mode, on
    both modules, to confirm the palette actually cascades correctly everywhere.

## In Progress
* Phase 6 continues: responsive/mobile behavior and (if warranted) charts not yet addressed

## Near-Term Next Steps
* Git commit for the visual direction work
* Decide: continue Phase 6 (responsive pass) now, or move to Phase 7 (deployment) and treat
  further visual polish as ongoing

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

**2026-08-13 — CSV export is client-side only, no backend endpoint**
The results data needed for export already lives in the frontend (it's what's rendered on screen), so building a CSV file in the browser and triggering a download needs no round-trip to the backend. Keeps the backend stateless per Section 10 and avoids adding an export endpoint for no real benefit.

**2026-08-13 — DCF terminal growth rate capped at 6%, not left fully open**
Unlike the WACC/mid-year/flat-growth items above, this wasn't flagged as a convention question first — it's a straightforward validation fix (Section 5 autonomy), not a methodology choice with two legitimate answers. A terminal growth rate above long-run economic growth is essentially always a modeling error, not a deliberate assumption, since it implies the company eventually outgrows the entire economy forever. Mentioned here for visibility in case a future scenario genuinely needs a higher figure — the bound can be revisited if so.

**2026-08-13 — uvicorn --reload is unreliable in this dev environment**
Twice in one session, editing backend files (new routers, then schema validation fixes) didn't take effect despite WatchFiles logging "Reloading..." — the server kept serving stale code until fully killed and restarted. Now treating a full restart as the default after any backend change, rather than trusting --reload. Saved as a standing memory so future sessions don't lose time re-discovering this.

**2026-08-13 — Visual direction: "Institutional" (navy/charcoal), chosen over "modern fintech"**
Alternatives considered: a lighter, rounder "modern fintech" palette (indigo/emerald accents, softer corners) — a legitimate, more contemporary-feeling option, shown side by side as an actual mockup rather than described in words.
Chosen because the target audience (PE, real estate asset management, recruiters, per Section 1) is more likely to read navy/charcoal conservatism as "understands finance culture" than a startup-fintech look would, which risks reading as generic-SaaS — the exact trap Section 15 warns against. Implemented as CSS custom properties so the choice is centralized and revisitable, not hand-picked per component.
