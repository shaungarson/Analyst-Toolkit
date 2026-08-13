# Analyst Toolkit — Progress

## Current Phase
Phase 8 — Advanced Analyst Features (real estate multi-year model + sensitivity, and DCF
sensitivity, all complete; scenario comparison still to come)

## Live Links
* App: https://analyst-toolkit-ecru.vercel.app
* API: https://analyst-toolkit.onrender.com
* Source: https://github.com/shaungarson/Analyst-Toolkit

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

* **Phase 7 — deployment code prep.** Plan (agreed with the user, since this touches
  external accounts and public infrastructure — a Section 5 stop-and-ask item): GitHub to
  hold the repo remotely, Vercel for the static frontend, Render for the Python backend.
  - Backend: CORS origins now read from an `ALLOWED_ORIGINS` env var (comma-separated),
    defaulting to `http://localhost:5173` so local dev is unaffected. `backend/.env.example`
    documents it.
  - Frontend: added `frontend/src/lib/apiBase.js` — an `API_BASE` constant from
    `VITE_API_BASE_URL`, empty by default so requests stay relative and keep using the Vite
    dev proxy locally. In production it'll be set to the live Render URL so the static
    Vercel build can reach the backend directly (no proxy exists outside `vite dev`).
    `frontend/.env.example` documents it.
  - Verified: `npm run build` succeeds, all 19 backend tests still pass, and local dev mode
    (both modules) works completely unchanged after the config changes.
  - Account creation and the actual deploys were done by the user directly (I can't create
    accounts or hold credentials) — walked through step by step, in order: GitHub repo
    created and pushed, backend deployed on Render, frontend deployed on Vercel with
    `VITE_API_BASE_URL` pointed at the Render URL, then `ALLOWED_ORIGINS` set on Render to
    the Vercel URL to close the loop.
  - Verified each stage independently rather than assuming success: backend health check
    and a real calculation both tested directly against the Render URL via curl before
    touching Vercel; confirmed via a CORS preflight check that the backend genuinely
    rejected the Vercel origin before the ALLOWED_ORIGINS fix, and genuinely accepted it
    after; then ran both modules' full worked examples against the actual live site in a
    browser and confirmed the numbers matched what local dev and the backend tests produce.
  - One free-tier quirk worth remembering: Render's free instance spins down after 15
    minutes idle, so the first request after a quiet period takes 30-60s to wake up. Not a
    bug — just how free hosting behaves. Worth a heads-up if demoing live.

* **Phase 8 — real estate multi-year model.** Agreed order for the rest of Phase 8 with the
  user: (1) real estate multi-year growth [this], (2) real estate sensitivity analysis, (3)
  DCF WACC × terminal-growth sensitivity, (4) scenario comparison. Structure was explained
  in plain language and explicitly agreed before any code was written, per the user's
  request.
  - NOI now grows at one flat annual rate from Year 2 onward (Year 1 stays the unescalated
    going-in NOI, consistent with what "going-in cap rate" actually means).
  - Added acquisition costs (% of purchase price, added to equity required) and disposition
    costs (% of sale price, deducted from sale proceeds) — both previously deferred.
  - Fixed a simplification flagged back in the V1 decision log: exit value now uses NOI one
    year past the end of the hold period (what the buyer is actually purchasing), not the
    flat going-in NOI. This was "free" to fix once growth was modeled — no new input needed.
  - The debt amortization math itself didn't change at all — growth only affects NOI, not
    the loan schedule, so `amortization_schedule()` was untouched.
  - Restructured the results around one combined `annual_schedule` (year, NOI, interest,
    principal, debt service, cash flow to equity, ending loan balance) instead of two
    separate tables, so growth is visible and auditable year-by-year, not just baked into
    the aggregate IRR.
  - 8 new/updated backend tests (24 total), including a fully hand-computed scenario with
    growth and costs together — the IRR in that test was solved independently by hand via
    the quadratic formula (not by trusting the code), and matched the computed result to
    within the stated tolerance.
  - On the example deal: IRR moved from 5.62% (flat V1 model) to 11.4% and equity multiple
    from 1.28x to 1.65x once growth and the corrected exit convention were modeled — a
    substantial, expected change, not a sign of a mistake.
  - Verified end-to-end in the browser (not just via curl): the CSV export was checked by
    intercepting the actual generated file content, and the DCF module was re-verified
    unaffected as a smoke test.

* **Phase 8 — real estate sensitivity analysis.** A 5×5 grid of IRR by exit cap rate (base
  ±100bps in 50bps steps) × hold period (base ±2 years in 1-year steps), with everything
  else held at the submitted base-case values. Runs automatically after the main
  underwriting call succeeds — reuses `underwrite_real_estate` in a loop rather than any new
  financial logic, so this was lower-risk than the growth model and didn't need a full
  explain-first cycle, just a brief heads-up before building.
  - Hold period is clamped at a 1-year minimum so short base hold periods (e.g. 1 year)
    don't produce invalid or duplicate columns.
  - The center cell of the grid (the base case's own exit cap rate and hold period) is
    highlighted in the UI and is guaranteed to match the headline IRR exactly, since it's
    computed by the exact same function — verified with a dedicated test, not just assumed.
  - 4 new backend tests (27 total across both modules), including the center-cell-matches
    test and a hold-period-clamping edge case.
  - Included in the CSV export alongside the existing tables.
  - Sensitivity fetch is best-effort and non-blocking: if it fails, the main underwriting
    result still displays fine — it's a supplementary view, not a dependency.
  - Verified end-to-end in the browser: grid renders, center-cell value and highlight both
    confirmed programmatically (not just visually), CSV export confirmed to include it.
* **Phase 8 — DCF sensitivity analysis.** Same pattern as the real estate grid: a 5×5 table
  of value per share by WACC (base ±100bps in 50bps steps) × terminal growth rate (same
  deltas), reusing `run_dcf` in a loop.
  - One real wrinkle real estate didn't have: WACC and terminal growth are coupled by the
    `wacc > terminal_growth_rate` constraint, so unlike the independent-axis real estate
    grid, some cells in a tight-spread base case are mathematically invalid (WACC at or
    below terminal growth blows up the Gordon Growth formula) and must be marked `null`
    rather than computed — verified with a test built specifically to produce that case
    (narrow 6.5%/5.5% base spread), not just the comfortable default spread.
  - Center cell verified to match the headline value per share exactly, same as real estate.
  - 3 new backend tests (30 total across both modules).
  - Verified end-to-end: center cell and highlight confirmed programmatically, CSV export
    checked, and Real Estate re-verified unaffected as a smoke test.

## In Progress
* (nothing yet)

## Near-Term Next Steps
* Scenario comparison (viewing saved scenarios side by side)
* README polish now that Phase 8's sensitivity work is done and there's a live link to put
  in it (Section 14)

## Recent verification notes
* 2026-08-13 — user manually resized the browser window and toggled OS dark mode; both held
  up fine with no reported issues, so Phase 6's responsive-behavior item is considered
  adequately covered without further dedicated work for now.

## Deferred (intentionally, for now)
* Real estate: refinancing, multiple debt tranches, scenario comparison (next up),
  waterfalls/promotes. (Multi-year cash flows, rent/NOI growth, acquisition/disposition
  costs, and sensitivity analysis are done as of 2026-08-13.)
* DCF: historical financials, revenue-driver forecasts, margin/working-capital/CapEx modeling, WACC build-up, comparable-company inputs, scenario comparison (next up). (Sensitivity analysis is done as of 2026-08-13.)
* Long-term (Phase 9, not scoped/scheduled): document extraction (OMs/rent rolls/T12s), auto-structuring inputs, missing/inconsistent data detection, AI-generated scenarios, risk flagging, sensitivity interpretation, IC-style commentary, professional export formats — see CLAUDE.md Section 8
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

**2026-08-13 — Deployment stack: GitHub + Render (backend) + Vercel (frontend)**
Alternatives considered: Railway or Fly.io for the backend (also viable, more setup complexity for no clear benefit at this scale); GitHub Pages for the frontend (free, but awkward for a Vite SPA and doesn't solve the backend hosting problem at all).
Chosen as the most common, best-documented free-tier pairing for exactly this shape of project (static frontend + small Python API, no database). Flagged to the user first since it meant creating external accounts and pushing code somewhere public — a Section 5 stop-and-ask situation. I handled all code-side prep (configurable CORS, configurable API base URL); the user did every account-creation and deploy-button step themselves, since I can't hold credentials or create accounts on anyone's behalf.

**2026-08-13 — Long-term product direction clarified: modeling engine is the foundation, AI workflow automation is the differentiator**
The user explicitly does not want Analyst Toolkit to evolve into "just" an increasingly complex financial calculator or Excel replacement. Long-term vision: an AI-powered analyst workflow tool — raw deal/company information → structured assumptions → financial model → scenarios/sensitivities → risks/insights → decision-ready summary/export — where AI and automation progressively reduce the manual effort between those stages (document extraction from OMs/rent rolls/T12s, auto-structuring inputs, flagging missing/inconsistent data, scenario generation, risk flagging, sensitivity interpretation, IC-style commentary, professional export). None of this is scoped or scheduled — it's Phase 9, explicitly gated on the modeling engine (Phase 8) being solid first. Captured in CLAUDE.md Sections 1 and 8 so it persists as durable project direction, not just session context.

**2026-08-13 — Phase 8 order agreed: real estate multi-year growth → real estate sensitivity → DCF WACC×terminal-growth sensitivity → scenario comparison**
Chosen (with the user) because real estate's flat-NOI assumption was the single most-flagged simplification across Phases 2–5, and sensitivity analysis is a defining feature of real analyst work that's relatively contained to build well — both close real credibility gaps for low relative complexity. Bigger items (waterfalls/promotes, multiple debt tranches, full WACC build-up, comparable-company inputs) are deliberately left for later, separately scoped efforts rather than folded into this pass.

**2026-08-13 — Real estate multi-year growth: flat rate from Year 2, forward-looking exit NOI, flat-% costs**
Alternatives considered: per-lease/rollover-level rent modeling (too heavy for this stage — genuinely valuable only once real document data feeds it, which is a Phase 9 concern); itemized acquisition/disposition cost line items instead of one flat percentage each (more precision than the model needs right now).
The structure was explained in plain language and explicitly agreed with the user before writing any code, per their request: one flat NOI growth rate from Year 2 onward (Year 1 = going-in NOI, unescalated, consistent with what "going-in cap rate" means), one flat acquisition-cost percentage added to required equity, one flat disposition-cost percentage deducted from sale proceeds, and — the one methodology bug this fixes for free — exit value now uses NOI one year past the end of the hold period instead of the flat going-in NOI, which was flagged as a known simplification back in the V1 decision log. Debt amortization math is completely unchanged; growth only touches the NOI side.

**2026-08-13 — Sensitivity grids (real estate and DCF): fixed deltas, not user-configurable ranges**
Alternatives considered: letting the user pick the delta range and step size for each axis (more flexible, but turns a "just show me the risk" view into another form to fill in).
Chosen because both grids exist to answer one question fast — "how exposed am I to X and Y moving against me" — without adding input surface. Real estate grids exit cap rate and hold period independently since they're not coupled; DCF's WACC and terminal growth are coupled by the `wacc > terminal_growth_rate` constraint, so some grid cells there are marked null instead of computed when a tight base-case spread pushes a combination into invalid territory — deliberately tested with a narrow-spread scenario, not just the comfortable default. Both grids compute their center cell through the exact same function used for the headline result (`underwrite_real_estate` / `run_dcf`), and both are verified by dedicated tests to reproduce that headline number exactly, not just "look about right."
