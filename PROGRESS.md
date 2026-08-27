# Analyst Toolkit — Progress

## Current Phase
Phase 8 complete; README polish done (Section 14); CRE underwriting metrics, deterministic
real estate risk flags, scenario-workflow V1, the Professional Deal Summary, and the
real-world-inspired example deal all shipped as Phase 8 extensions. DCF ticker search
(public company data populates the workspace; analyst still reviews/runs manually) shipped
2026-08-24 — see Decision Log. This is the project's first third-party API dependency. No
further work currently agreed; check with the user for direction.

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
* **Phase 8 — scenario comparison.** Checkboxes on each saved scenario in the existing
  `ScenarioManager`, a "Compare Selected" action (needs 2+ selected), and a new shared
  `ScenarioComparisonTable` component rendering a metric-by-scenario grid — one instance
  per module, each with its own small config of which headline metrics to show.
  - Extracted the request-payload-building logic (previously inline in each module's submit
    handler) into a standalone `buildPayload` function per module, reused by both the normal
    submit flow and the new compare flow, rather than duplicating that transformation.
  - Handles a real edge case deliberately, not just the happy path: a scenario saved before
    a validation rule tightened (e.g. the LTV-must-be-below-100% fix from Phase 5) could now
    fail when recalculated. Each scenario's fetch is independent (`Promise.allSettled`), so
    one bad scenario shows "Error" in its own column with an explanatory note below the
    table, while every valid scenario alongside it still computes and displays normally.
  - Verified end-to-end in the browser for both modules: saved two scenarios with a
    meaningfully different assumption each (real estate: exit cap rate; DCF: WACC), compared
    them, and confirmed the numbers that should move did move in the financially correct
    direction (worse exit cap rate → lower IRR; higher WACC → lower valuation) while numbers
    that shouldn't be affected stayed identical between scenarios. Separately verified the
    error path by injecting a deliberately invalid stale scenario alongside a valid one.

This completes every item from the Phase 8 plan agreed with the user on 2026-08-13.

* **README polish (Section 14).** Wrote a real root `README.md` — previously there was none,
  only the default Vite-generated placeholder inside `frontend/`, which is now replaced with
  a one-line pointer to the real one. Covers what the app is, who it's for, current
  capabilities, financial methodology and stated conventions, architecture (with a request-
  flow diagram), the Phase 9 long-term direction, how to run it locally, and — per Section
  14's explicit instruction — an honest account of what was AI-assisted versus
  user-directed, not a claim of either "built without AI" or "AI did everything."
  - Screenshots were not included: the browser automation tool couldn't render frames for a
    screenshot in this environment (pane not displayed on the user's screen). Worth adding
    later, either by the user taking their own or in a future session where screenshotting
    works.
  - Sanity-checked the documented local-run commands (venv paths, install commands) actually
    match what's been used throughout this project, rather than writing them from memory.

* **CRE underwriting metrics — DSCR, debt yield, loan maturity (2026-08-17).** Extended the
  real estate module with three standard commercial lending figures that were previously
  missing.
  - **DSCR** (NOI ÷ annual debt service) computed per year, `null` once debt service hits
    zero (i.e. after the loan is fully amortized). Year-1 DSCR (`going_in_dscr`) is also
    surfaced as a headline metric.
  - **Debt yield** (going-in NOI ÷ original loan amount) added as a Day-1-only headline
    metric — deliberately not computed per year, unlike DSCR, matching standard lender
    convention.
  - **Loan maturity** added as a new input, distinct from amortization period (standard CRE
    phrasing: "5-year term, 30-year am"). A Pydantic cross-field validator now enforces
    `loan_maturity_years >= hold_period_years`, since refinancing, extensions, and balloon
    payoffs beyond the original loan term aren't modeled — see the Decision Log entry below
    for the alternatives considered and why this was chosen over modeling a balloon payoff.
  - The real estate sensitivity grid's hold-period axis is now also clamped at
    `loan_maturity_years` (not just a 1-year floor), so it can never silently test a hold
    period beyond loan maturity even though it calls the pure calculation function directly,
    bypassing Pydantic validation.
  - Scenarios saved before `loan_maturity_years` existed are backfilled via a
    `withLegacyDefaults()` helper in `RealEstateUnderwriting.jsx`, applied at both
    scenario-load and scenario-compare entry points — defaults missing maturity to the
    scenario's own hold period (the smallest value guaranteed valid under the rule above).
  - 12 new backend tests (39 total across both modules), including DSCR going to `null`
    after loan payoff and the sensitivity-grid maturity clamp.

* **Deterministic real estate risk flags (2026-08-17).** Three transparent, rule-based
  flags in a new `backend/app/calculations/risk_flags.py` module — a third layer on top of
  the existing calculation and sensitivity layers, reading their already-computed output
  rather than modifying it (mirrors how the DCF module's WACC-vs-terminal-growth check is
  already kept separate from `run_dcf()`).
  - **Low Year-1 DSCR** — fires when `going_in_dscr` is below a named `DSCR_REFERENCE_THRESHOLD`
    constant (1.20x), with explanation text explicit that this is a reference level used by
    the analysis, not a universal lender requirement.
  - **Exit cap-rate compression** — fires when `exit_cap_rate < going_in_cap_rate`. Directional
    only, no magnitude threshold.
  - **Capital-loss exposure** (`capital_loss_exposure`, deliberately not a generic
    "downside exposure" name — see Decision Log) — fires when one or more sensitivity-grid
    cells show equity multiple below 1.0x; reports both count and percentage.
  - Each flag is a plain dict (`id`, `title`, `category`, `explanation`, `observed_value`,
    `reference_value`) with no severity/score field, and only triggered flags are returned
    — an empty list means nothing was flagged.
  - The real estate sensitivity grid's internals were refactored (not its public API) so
    equity multiple is captured from the underwriting runs it already performs, via a new
    shared `_sensitivity_grid_cells()` helper — the public `/sensitivity` endpoint, response
    schema, and frontend grid are all unchanged.
  - New `POST /api/real-estate/risk-flags` endpoint, fetched non-blocking the same way the
    sensitivity grid already is. New "Risk Flags" panel in the frontend (triggered flag
    cards, or a "no flags triggered" message), included in CSV export. New `--flag` color
    token added to the light/dark theme for the flag cards' accent.
  - 7 new backend tests (46 total across both modules) — each trigger/non-trigger scenario
    was numerically verified against the running code before being written into an
    assertion, not hand-guessed.
  - Verified end-to-end in a browser (both the flagged and empty-list render paths, light
    and dark mode) using a temporary isolated backend/frontend pair, since another Claude
    Code session already held the project's default dev ports at the time — cleaned up
    afterward, no leftover files or processes.

## In Progress
* (nothing yet)

* **Real estate scenario-workflow V1 (2026-08-17).** Aimed at how an analyst actually
  builds Base/Downside/Upside cases, not just more scenario features for their own sake.
  - **Duplicate scenario**, added to the shared `ScenarioManager` component: loads the
    scenario's saved inputs into the active form (reusing the existing Load path) and
    pre-fills the name field with `"{original name} (copy)"`. No hidden background clone —
    the analyst edits in the real form, then uses the existing "Save Current Inputs" flow.
    Entirely self-contained inside `ScenarioManager` (calls the existing `onLoad` prop, sets
    its own local name-input state) — no new prop needed, so it applies to both Real Estate
    and DCF with zero module-specific code, confirmed with no unexpected complexity in
    either module.
  - **Assumption-difference comparison** (Real Estate only for this milestone): a new
    `ScenarioAssumptionDiffTable` component renders directly above the existing output
    comparison table when 2+ scenarios are compared. A field counts as changed if its
    normalized value isn't identical across every selected scenario — no baseline scenario
    needs to be designated, which also makes 3+-way comparison work with no special case.
    Unchanged fields collapse into one summary line rather than cluttering the table with a
    row per field.
  - Verified before writing the comparison logic that raw saved-scenario values can
    genuinely differ in string form for the same economic assumption (the worked example
    itself saves `interestRate: "6.0"`, while typing the same 6% by hand saves `"6"`).
    Values are normalized with `Number()` before comparing — every field in this form is a
    plain numeric input, so one normalization step covers all of them; no general
    per-field-type framework was needed. Confirmed live in the browser that a duplicated
    scenario edited only on Exit Cap Rate (with interest rate re-typed as "6" instead of the
    original "6.0") correctly shows Exit Cap Rate as the only changed row and Interest Rate
    as unchanged.
  - No backend or schema changes — scenario storage, diffing, and duplication are all
    client-side. No localStorage migration needed either: every saved scenario already
    stores its full raw inputs (nothing was ever pruned), so old scenarios work with the
    diff table unmodified. Existing `withLegacyDefaults()` backfill (loan maturity) is
    still applied wherever scenario data is read, unchanged.
  - Base/Downside/Upside is a naming convention, not a schema field or enum — see Decision
    Log for why an explicit scenario-type field was rejected.
  - No new backend tests (nothing in the calculation layer changed) and no new frontend
    test framework was introduced for this one small comparison function — verified by
    hand in the browser instead (2-scenario diff, 3-scenario diff, zero-diff/all-identical
    case, and the string-format-equivalence case above), consistent with how scenario
    saving and CSV export were verified in earlier phases. Also re-verified DCF's Duplicate
    button works identically to Real Estate's, with no regressions.
  - DCF assumption-difference comparison deliberately deferred as a separate follow-up, not
    bundled into this milestone.

* **Real estate Professional Deal Summary (2026-08-17).** Turns a completed underwriting
  into a compact, decision-ready read — deliberately not a re-listing of every input/output
  the app already shows elsewhere. Works entirely from the active underwriting; no
  dependency on saved or compared scenarios (deliberately deferred, see Decision Log).
  - New `RealEstateDealSummary` component, rendered at the top of the results section
    (existing full detail stays exactly as it was, now wrapped in a `.full-detail` div so
    print can target it separately). Hierarchy: headline returns (IRR, equity multiple,
    Yr-1 cash-on-cash, equity required) get the strongest visual weight; then a "Deal at a
    Glance" tile row (purchase price, going-in NOI, going-in/exit cap rate, exit value, net
    sale proceeds); then financing as one compact description line plus Year-1 DSCR and
    debt yield; then a compact sensitivity presentation; then triggered risk flags (or a
    neutral statement if none triggered).
  - Added an optional **Deal / Property Name** field, frontend-only metadata never sent to
    the backend (`buildPayload` doesn't reference it) and never used in any calculation.
    Rides along in each scenario's existing saved `data` blob for free — no new storage
    format — and is backfilled to `''` for old scenarios via the existing
    `withLegacyDefaults()` mechanism, the same pattern already used for loan maturity.
  - Deliberately did not add an "as-of" date implying the underlying figures are current to
    a reporting date; a small "Generated {date}" label is shown instead, describing when
    the summary artifact was produced, not the deal's valuation currency.
  - **Sensitivity:** rather than reduce it to a single min/max sentence, extracted the
    existing inline grid markup (previously only used once, inline in the full-results
    view) into a new shared `RealEstateSensitivityGrid` component with a `compact` prop
    that only changes styling (smaller font/padding) — never which cells are computed or
    shown, and never a second call to the sensitivity endpoint. Used non-compact in the
    full results (byte-identical output to before) and compact in the summary, so the grid
    and its base-case-highlight logic exist in exactly one place. A short supporting "Tested
    IRR range" line (client-side `Math.min`/`Math.max` over the already-fetched grid, not a
    new calculation) sits below the grid, which remains the primary sensitivity
    presentation as intended.
  - **Risk flags:** triggered flags reuse the exact existing card markup/wording. Zero-flag
    wording is exactly `"No deterministic risk flags triggered under the current analysis
    rules."` — no "safe," "low risk," or recommendation language.
  - **Print:** existing "Print" behavior preserved and relabeled "Print Full Analysis" for
    clarity; new "Print Summary" button toggles a `print-summary-only` body class that
    `print.css` uses to hide `.full-detail`, cleaned up automatically on the browser's
    `afterprint` event. Plain browser print/print-to-PDF only — no PDF library. In building
    this, found and fixed a latent print bug that predates this milestone: headings and the
    risk-flag cards had no print-specific color override, so printing from OS dark mode
    would have rendered them in a light color invisible against the white printed page —
    fixed with the same explicit-color-override pattern already used elsewhere in
    `print.css`.
  - 100% frontend — no backend, schema, or localStorage changes; no new backend tests
    (nothing in the calculation layer changed). Verified by hand: zero-flag and
    flags-triggered scenarios, compact grid values/highlight cross-checked against the full
    grid, the Print Summary/Print Full Analysis JS toggle logic (verified directly, not by
    triggering a real OS print dialog), on-screen invisibility of the print-only CSS rule,
    light/dark mode, and a DCF smoke test (DCF module untouched, confirmed unaffected).

* **Real-world-inspired example deal: 100 Symes Road, Toronto (2026-08-18).** Replaced the
  round-number placeholder example with a real, independently-verified industrial/flex
  listing, so `Load Example Deal` demonstrates a believable CRE case rather than arbitrary
  numbers.
  - Purchase price ($16,500,000) and going-in NOI (~$1,000,000) are sourced from the
    public listing for 100 Symes Road (verified directly against the brokerage's listing
    page before implementing, cross-checked against independent web search results for the
    building/zoning/location details — LoopNet and REALTOR.ca themselves blocked automated
    fetches, a standard anti-bot response, not a data-quality signal). Financing, growth,
    hold, and exit assumptions are illustrative, run through the actual calculation
    functions before being approved (not hand-estimated), and deliberately not engineered
    for an attractive return: IRR 8.00%, equity multiple 1.43x, Year-1 DSCR 1.33x, debt
    yield 9.32% — moderate and believable rather than a showcase number.
  - One risk flag triggers organically (capital-loss exposure, 3 of 15 tested sensitivity
    cells), while DSCR and exit-cap-compression correctly don't — demonstrating the flags
    are selective, not trivially always-on or always-off.
  - The 5-year loan maturity intentionally equals the 5-year hold period (a realistic,
    common CRE financing structure, not just an edge case for the validator), which also
    exercises the sensitivity grid's loan-maturity clamp organically: the grid tests only
    3 hold-period columns instead of the usual 5, live in the example, without needing a
    separately-constructed test case.
  - Added a small `.assumptions`-styled disclaimer directly under the Load Example
    Deal/Run Underwriting buttons, always visible (no new state to track whether the form
    still matches the untouched example), distinguishing the sourced facts (price, NOI)
    from the illustrative assumptions (everything else).
  - `loadExample()` itself is unchanged: still populate-only, no auto-run, no auto-save, no
    scenario-type presets. 100% frontend, no backend/schema changes, no new backend tests.
  - Verified by hand: loaded values match the approved assumptions field-for-field;
    resulting headline metrics/risk flags match the pre-implementation calculation-layer
    test exactly; works correctly with the Professional Deal Summary (deal name in the
    header, compact grid matching the full grid); Duplicate/Save/Load all correctly carry
    the deal name and full assumption set.

* **DCF ticker search: public company data populates the workspace (2026-08-24).** The DCF
  page now starts with a "Company" section — enter a ticker, click Load Company, and
  sourced historical fundamentals populate the existing assumption fields. This does not
  run a valuation or save a scenario; the analyst still reviews every field (including the
  ones just populated) and explicitly clicks Run Valuation, exactly mirroring how "Load
  Example Deal" already behaves for Real Estate.
  - **Data architecture** (evaluated before building, see Decision Log): Alpha Vantage
    supplies fundamentals (income statement, balance sheet, cash flow, company
    profile/quote) and SEC EDGAR supplies a ticker→CIK lookup plus a filings-index link —
    not fundamentals values. SEC XBRL was directly tested (not just researched) against
    real AAPL/MSFT filings before deciding: Apple reports D&A as one combined tag while
    Microsoft splits it into two tags that must be summed, confirming that reliable XBRL
    normalization needs an ongoing per-concept ruleset, not a one-time mapping — real,
    demonstrated complexity, not a hypothetical concern.
  - **Provider verification, not just documentation-reading:** Finnhub and Financial
    Modeling Prep were both directly tested (live pricing pages, in Finnhub's case a live
    API call) and found to have removed free-tier fundamentals access since older
    write-ups were published online. Alpha Vantage's actual endpoints were called live
    (OVERVIEW, INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW, GLOBAL_QUOTE) and confirmed
    working on the free tier before being chosen.
  - **Unlevered FCF construction:** `EBIT × (1 − effective tax rate) + D&A − CapEx −
    change in NWC`, computed in `app/calculations/company_financials.py` (pure, tested) —
    the proper enterprise-value-DCF build, not an OCF − CapEx shortcut. Any missing input
    makes the result undefined rather than silently wrong.
  - **Internal data model preserves the full underlying components** (revenue, EBIT, tax
    inputs, D&A, CapEx, ΔNWC, calculated UFCF, cash, debt, net debt, shares, price,
    profile, fiscal period, source) per fiscal year, not just a single collapsed
    `base_year_fcf` number — deliberately, so the next major DCF evolution (a
    driver-based revenue → margin → taxes → D&A → CapEx → ΔNWC forecast) doesn't require
    redesigning the data layer.
  - **Caching:** two separate in-memory TTLs, not one — fundamentals (24h, since filings
    change quarterly at most) and quote/price (15 min, since it moves continuously during
    market hours) — deliberately not coupled to a single freshness assumption. No
    Redis/database introduced.
  - **Error handling:** invalid ticker (404), Alpha Vantage's daily/per-minute limit hit
    (429), missing server API key (500, fails loudly rather than silently), provider
    unreachable (502) — each mapped from a typed backend exception to a clear message the
    UI actually displays (a real bug was fixed in `parseErrorResponse` along the way: it
    only handled FastAPI's list-shaped validation errors, not the plain-string `detail`
    this new endpoint returns).
  - **Security:** `ALPHA_VANTAGE_API_KEY` is a server-side-only environment variable —
    never accepted from or returned to the frontend. No CORS implications, since the
    Alpha Vantage/SEC calls happen server-to-server, not from the browser.
  - 22 new backend tests (68 total) — pure UFCF/tax-rate/NWC calculations hand-verified,
    and the normalization/caching/throttling/error-propagation layer tested against
    realistic fixture data (including two genuine Alpha Vantage quirks confirmed against
    the live API before being written into fixtures: the literal string `"None"` for
    missing numeric fields, and inconsistent field coverage across companies — see the
    live-verification Decision Log entry below) rather than a live network call in the
    test suite.
  - Verified live in the browser with a real `ALPHA_VANTAGE_API_KEY` and three real
    tickers (AAPL, CAT, WMT): the full pipeline end-to-end, including a real valuation
    run and scenario save/load with ticker-sourced data. Two real bugs were found and
    fixed during this pass (request throttling, a company-data field fallback) — see the
    Decision Log for both; the happy path is now fully confirmed, not just fixture-tested.

## Near-Term Next Steps
* Open — no further work is currently agreed. Check with the user for direction (Phase 9
  stays out of scope until explicitly instructed, per CLAUDE.md).
* SEC EDGAR as an actual fundamentals *values* source (not just the CIK/filings-index link
  it provides today) is a deliberately deferred future upgrade — the internal data model
  is already shaped for it; see the Decision Log.
* A driver-based DCF forecast (revenue → margin → taxes → D&A → CapEx → ΔNWC, replacing
  the current flat-growth model) is the long-signaled next evolution of the DCF engine,
  now that the underlying data layer is shaped to support it — not started.
* DCF assumption-difference comparison (mirrors the Real Estate scenario-workflow work) is
  a reasonable small follow-up whenever wanted — deliberately not done automatically.
* A scenario-comparison variant of the Professional Deal Summary (Base/Downside/Upside
  side-by-side) is a natural later enhancement, deliberately deferred — needs its own
  design pass on how a multi-scenario summary should work.
* A DCF Professional Deal Summary, mirroring the Real Estate one, is a reasonable future
  follow-up — deliberately not built now (DCF was out of scope for this milestone).
* Screenshots for the README are a reasonable small follow-up whenever convenient.

## Recent verification notes
* 2026-08-13 — user manually resized the browser window and toggled OS dark mode; both held
  up fine with no reported issues, so Phase 6's responsive-behavior item is considered
  adequately covered without further dedicated work for now.

## Deferred (intentionally, for now)
* Real estate: refinancing, multiple debt tranches, waterfalls/promotes. (Multi-year cash
  flows, rent/NOI growth, acquisition/disposition costs, sensitivity analysis, and scenario
  comparison are all done as of 2026-08-13.)
* Real estate (bigger, further out): tenant/rent-roll-level underwriting module — see
  CLAUDE.md Section 8 for the full concept. Not scoped; needs validation with real CRE
  professionals before scoping.
* DCF: historical financials, revenue-driver forecasts, margin/working-capital/CapEx modeling, WACC build-up, comparable-company inputs. (Sensitivity analysis and scenario comparison are done as of 2026-08-13.)
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

**2026-08-13 — Scenario comparison recalculates from saved inputs rather than storing past results**
Alternatives considered: storing the computed results alongside each saved scenario at save time, so comparison would just be a display step with no new network calls.
Chosen to recalculate instead, because a scenario's *inputs* are the thing worth persisting — if the calculation logic itself ever changes (as it already has multiple times this project: the LTV bound, the exit valuation convention, the terminal growth cap), old stored results would silently go stale and misrepresent what the current model would actually produce. Recalculating on demand means a comparison always reflects today's methodology, and surfaces a scenario whose saved inputs no longer pass validation as a visible, per-scenario error rather than a silent wrong number.

**2026-08-14 — Captured future concept: Tenant / Rent-Roll Underwriting Module (not scoped)**
The user wants to explore modeling real estate at the tenant/lease level (occupancy, lease-expiry schedule, rollover exposure, tenant concentration, WALE) instead of one flat NOI growth rate, with an eventual AI-assisted pipeline (rent roll/lease documents → structured tenant data → lease-level assumptions → multi-year NOI → valuation/returns → risk insights). Full concept recorded in CLAUDE.md Section 8. Explicitly not to be built yet — the user wants to validate with real commercial real estate professionals what tenant-level information they actually use in underwriting before committing to specific fields or scope. Design principle to preserve when this is eventually scoped: no arbitrary "tenant health scores" — transparent, evidence-based inputs, and show how they move cash flow rather than a black-box score.

**2026-08-17 — Loan maturity: reject hold periods beyond loan term, don't model balloon payoffs**
Alternatives considered: (1) model a balloon payment/payoff at loan maturity if the hold period runs past it (more realistic, but adds refinancing-adjacent complexity that's explicitly deferred); (2) allow the input but show a warning without changing the math (simpler, but silently produces cash flows using financing that would have contractually expired — misleading, not just imprecise). Chose to enforce `loan_maturity_years >= hold_period_years` as a hard Pydantic validation rule instead, so the engine only ever computes cash flows under financing that's still in place. Standard CRE convention already separates loan term from amortization period ("5-year term, 30-year am"), so this is realistic, not merely simplifying. Also closed a related gap: the real estate sensitivity grid calls the pure calculation function directly (bypassing Pydantic), so its hold-period axis is separately clamped at `loan_maturity_years` to preserve the same guarantee.

**2026-08-17 — Deterministic risk-flag phase: scope and design agreed, then shipped as agreed**
Agreed to build a third architectural layer on top of the existing two (pure financial calculations in `backend/app/calculations/`; deterministic risk logic reads that output rather than modifying it — mirrors how the WACC-vs-terminal-growth check is already separated from `run_dcf()`). V1 scope: exactly three real estate risk flags — low Year-1 DSCR (vs. a named 1.20x reference constant, explicitly not framed as a universal lender rule), exit cap-rate compression (directional only, no magnitude threshold), and capital-loss exposure across the sensitivity grid (% of tested cells with equity multiple < 1.0x, named `capital_loss_exposure` rather than a generic "downside exposure" label to leave room for a future, separate hurdle-rate/target-return concept). Explicitly excluded from V1, with reasons: a debt-yield flag (no defensible universal threshold), a generic LTV/leverage warning (low marginal insight over a value the user already typed in), any arbitrary composite "risk score" (rejected as a design principle, consistent with the tenant-module design principle above). `RiskFlag` returned as a plain dict — `id`, `title`, `category`, `explanation`, `observed_value`, `reference_value` — with no severity/scoring field, and only triggered flags included in the list (empty list = nothing triggered). The sensitivity grid's existing public API/schema and frontend are preserved unchanged: equity multiple is captured internally from underwriting runs the grid already performs, via a shared internal helper, rather than duplicating the computation or extending the public response. Shipped exactly to this plan — no scope drift during implementation.

**2026-08-17 — Dev tooling: frontend dev server supports auto port selection**
Running a second Claude Code session against this repo while a prior session's frontend dev server still held port 5173 caused `preview_start` to fail outright. Added `autoPort: true` to `.claude/launch.json` and changed `frontend/vite.config.js` to bind `server.port` to `process.env.PORT` (falling back to 5173 unchanged) so the preview harness can assign a free port when 5173 is taken. Evaluated and confirmed before committing: zero effect on production (this only touches the local `vite dev` server — `vite build`/Vercel never use it), and no behavior change for a normal single-session `npm run dev`. Kept as its own commit, separate from any product-feature milestone, since it's a dev-environment/tooling concern rather than an app change — see CLAUDE.md Section 12.

**2026-08-17 — Documentation discipline formalized as a standing workflow**
Added an explicit pre-commit documentation review to CLAUDE.md Section 13: before declaring any product-development milestone complete, check whether `README.md`, `PROGRESS.md` (done list, current phase, near-term next steps, decision log), roadmap status, and `CLAUDE.md` itself need updating, and report which docs were reviewed/updated/deferred at each commit milestone. Motivated by the DSCR/debt-yield/loan-maturity commit (`f93ae4d`) shipping without its documentation update, which had to be caught and fixed retroactively in a follow-up commit — this makes that check a required step going forward rather than something that can be silently skipped.

**2026-08-17 — Scenario workflow: Duplicate loads-into-form rather than a background clone**
Alternatives considered: cloning a scenario immediately and silently in the background (the analyst would then have to find and Load the clone separately to edit it). Chosen instead: Duplicate loads the scenario's inputs into the active form immediately (reusing the existing Load mechanism) and pre-fills the name field with a neutral `"{name} (copy)"` suggestion, so the analyst edits in the real form and saves explicitly with the existing "Save Current Inputs" button. Deliberately does not suggest "Downside"/"Upside" in the name, since duplicating a scenario doesn't imply either intention — naming stays entirely up to the analyst. This kept the change almost free: no new save code path, no confirmation dialog, and — because it's implemented entirely inside the shared `ScenarioManager` component using the `onLoad` prop that already existed — it applies identically to both Real Estate and DCF with no module-specific branching.

**2026-08-17 — Base/Downside/Upside: naming convention, not a schema field**
Alternatives considered: an explicit `scenarioType` enum field (Base/Downside/Upside, or similar). Rejected because it would force a fixed vocabulary that doesn't fit every deal (e.g. "Downside 1/2", a refinance case), require the same class of legacy-scenario migration work as the `loan_maturity_years` backfill, and doesn't feed any calculation, sort, or filter that a free-text name doesn't already support equally well. The Duplicate workflow (start from a saved scenario, rename, tweak) naturally produces Base/Downside/Upside-style structure without hard-coding it — consistent with the same "no arbitrary taxonomy" principle already applied to the risk-flags phase and the future tenant-module design principle (CLAUDE.md Section 8).

**2026-08-17 — Assumption-diff comparison: normalize with Number(), not a general normalization framework**
Verified before writing the comparison logic that raw saved-scenario values can differ in string form for an identical economic assumption — the app's own worked example saves `interestRate: "6.0"`, while an analyst typing the same 6% by hand saves `"6"`; naive string equality would have flagged that as a changed assumption. Since every field in the real estate form is a plain `type="number"` input (no free text, dates, or enums), comparing `Number(value)` across the board resolves this with one normalization step — no per-field-type framework was built, since none of the fields need different treatment. Confirmed live in the browser: a duplicated scenario with only Exit Cap Rate changed (and Interest Rate re-typed as "6" instead of the original "6.0") correctly showed Exit Cap Rate as the only changed row, with Interest Rate correctly grouped under "Unchanged."

**2026-08-17 — Professional Deal Summary: dedicated component, not a new tab/route**
Alternatives considered: enhancing print.css alone with no new on-screen component (lowest implementation cost, but the on-screen app would still look like an input form + full detail dump, not "a professional analytical deliverable," and CSS alone can't reorder/condense content); a new top-level tab or route (would need routing infrastructure this app doesn't have, disproportionate to the ask). Chose a dedicated `RealEstateDealSummary` component rendered at the top of the existing results section, above the unchanged full detail — quick-scan summary first, full depth immediately below for whoever wants it, no toggle needed. Real-estate-specific content, so it lives in `features/real-estate/` rather than the shared `components/` folder, matching the project's "factor out shared pieces only once a second module needs them" pattern (README, Architecture section).

**2026-08-17 — Sensitivity in the summary: compact grid, not reduced to a min/max sentence**
The user pushed back on the originally-proposed min/max-only treatment: the sensitivity matrix is itself recognized professional underwriting content, not just supporting detail. Resolved by extracting the previously-inline sensitivity grid markup into a shared `RealEstateSensitivityGrid` component with a `compact` prop that changes only CSS (smaller font/padding) — the same grid data, same base-case-highlight logic, same `/sensitivity` endpoint call, used in both the full results (byte-identical to its prior inline rendering) and the summary. A short supporting "Tested IRR range" line (client-side min/max over already-fetched cells, not a new calculation) sits below the grid as a supplement, not a replacement.

**2026-08-17 — Deal / Property Name: frontend-only metadata, no backend/schema involvement**
Added an optional field purely for labeling the summary/print header. Deliberately kept out of `buildPayload()` (never sent to the API, never touches the financial engine) and given no dedicated backfill logic beyond extending the existing `withLegacyDefaults()` function the same way loan maturity already was — old scenarios simply get `''`. Chosen over any backend/schema change, which would have been unjustified complexity for a display-only label.

**2026-08-17 — Print: two buttons, existing behavior preserved**
Renamed the existing "Print" to "Print Full Analysis" (identical behavior, clearer label) and added "Print Summary" as a new button, rather than changing what the existing button does. A body-class toggle (`print-summary-only`), scoped entirely inside `print.css`'s `@media print` block, hides the full-detail section for the new button only - verified to have zero on-screen effect and confirmed the class is added/removed correctly (including on the browser's `afterprint` event) without invoking a real OS print dialog in an automated check. While extending `print.css`, found and fixed a latent bug predating this milestone: headings and risk-flag cards had no print-specific color override, so printing from OS dark mode would have rendered them illegibly (light text on the white printed page) - fixed with the same explicit-color pattern already used for `.metric` and other elements.

**2026-08-17 — Scenario-comparison summary and DCF summary: both deferred**
Confirmed with the user: V1 works only from the single active underwriting, with no dependency on saved or compared scenarios, keeping the component's logic simple and the core "turn a completed underwriting into a summary" need fully met. A Base/Downside/Upside comparison variant, and a DCF equivalent of this same summary, are both natural next steps but need their own scoping - not built now.

**2026-08-18 — Example deal: real property (100 Symes Road, Toronto), publicly-sourced facts kept separate from illustrative assumptions**
Alternatives considered: keep the round-number placeholder example (simple, but reads as an obviously fake demo, not a believable CRE case); use a real property but present all inputs as if they were sourced (misleading - the app has no way to know a real deal's actual financing/hold/growth assumptions). Chose to source only what the public listing actually states (purchase price, going-in NOI) and clearly label everything else (LTV, rate, amortization, maturity, hold, growth, exit cap, costs) as illustrative via a always-visible disclaimer next to the Load Example Deal button - no new state to track whether the form still matches the untouched example, which would have been disproportionate complexity for a disclaimer. Deliberately did not optimize the illustrative assumptions for an attractive return: the resulting 8% IRR / 1.43x multiple case was chosen because it demonstrates the app's sensitivity grid, risk flags, and financing metrics doing real analytical work (one flag triggers, two don't; the loan-maturity sensitivity clamp activates organically from a realistic 5-year-term-on-5-year-hold structure), not because it looks good. Facts were verified directly against the listing brokerage's own page before implementation, not taken on faith from the request.

**2026-08-24 — DCF ticker search: first third-party API dependency, added deliberately (CLAUDE.md Section 10 threshold)**
Section 10 of CLAUDE.md always anticipated this exact trigger ("third-party API calls... explain the need before adding any of that") and gated the backend's role staying narrow until one arose. This is that moment: the DCF module now needs real company financial data, which the app has no way to source itself. The backend's role stays otherwise unchanged - it validates, normalizes, and calculates; it still holds no user data, no auth, no database. The only new thing it does is proxy two read-only, keyless-or-free external data calls server-side, specifically so the API key never reaches the browser.

**2026-08-24 — Data provider: Alpha Vantage for fundamentals/quotes, SEC EDGAR for filer identification only (not values)**
Evaluated three commercial providers plus SEC EDGAR, verifying each directly rather than trusting documentation or older articles:
- IEX Cloud: confirmed fully shut down (retired all API products August 2024) - not viable.
- Finnhub: live pricing page shows "Standardized Financial Statements" is checked only on their $3,500/month plan, blank on Free - free tier has no fundamentals at all, contradicting some third-party summaries still circulating.
- Financial Modeling Prep: live pricing page shows the free ("Basic") tier limited to end-of-day prices and "Profile and Reference Data"; "Annual Fundamentals and Ratios" is explicitly a Starter ($19/mo) feature - free fundamentals access was removed at some point after older write-ups were published.
- Alpha Vantage: called the actual endpoints live (OVERVIEW, INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW, GLOBAL_QUOTE) and confirmed real, complete data comes back on the free tier - the only one of the three that still does this for $0. Tradeoff accepted: a real 25-requests/day, 5/minute limit, mitigated with server-side caching (see below) rather than avoided by paying for a different provider.
- SEC EDGAR: directly tested XBRL company-facts for AAPL and MSFT (not just read about the format) specifically to evaluate whether it could be the *primary* fundamentals source, per the user's initial preference for an authoritative, auditable source. Found genuine, demonstrated tag inconsistency - Apple reports D&A as one combined tag (`DepreciationDepletionAndAmortization`); Microsoft doesn't use that tag at all and instead splits D&A into `Depreciation` + `AmortizationOfIntangibleAssets`, which must be summed. This confirmed reliable cross-company XBRL normalization needs an ongoing per-concept fallback/aggregation ruleset, not a lookup table, with real risk of silent gaps on less-standardized filers - genuinely more open-ended engineering than this milestone's scope. SEC EDGAR was kept in the architecture anyway, scoped down to what it's cheaply and reliably good for right now: a static ticker→CIK lookup and a constructed link to the company's real filings index, surfaced today as "view source filings" - real progress toward auditability with zero XBRL-parsing risk. Each Alpha Vantage fact SEC could eventually corroborate carries `form`/`filed`/accession-number metadata natively (verified live), so pulling real SEC values in later is a clear, scoped upgrade, not unknown territory.

**2026-08-24 — Provider-agnostic internal data model, so a future SEC-values upgrade doesn't require rewriting the DCF feature**
The internal `CompanyData`/`FinancialPeriod` shape (in `app/schemas/company.py`) has no Alpha-Vantage-specific structure - it's a plain per-fiscal-year record (revenue, EBIT, tax inputs, D&A, CapEx, change in NWC, calculated UFCF, cash, debt, net debt) plus a top-level `source` object naming which provider supplied which category of data. The DCF-facing frontend code only ever reads this normalized shape. If SEC XBRL values are added later, that's additive work inside `app/services/company_data.py` and `app/services/sec_edgar.py` - the schema, the router, and the frontend do not need to change.

**2026-08-24 — Unlevered FCF: proper enterprise-value-DCF construction, not an OCF - CapEx shortcut**
`UFCF = EBIT x (1 - effective tax rate) + D&A - CapEx - change in NWC`, matching the user's explicit direction over the simpler `operating cash flow - CapEx` proxy that was originally proposed. Implemented as pure, independently-tested functions in `app/calculations/company_financials.py`, separate from the HTTP-fetching/normalization code in `app/services/`, consistent with the project's existing separation between calculation and API layers. This choice also sets up the later evolution toward a fully driver-based forecast (revenue -> margin -> taxes -> D&A -> CapEx -> ANWC) with no rework, since that forecast is really just this same UFCF construction applied to projected rather than historical figures.

**2026-08-24 — Caching: two independent TTLs, not one shared cache**
Fundamentals (income statement, balance sheet, cash flow, company profile) get a 24-hour TTL, since they only change when a new quarterly/annual filing is published. The quote (current share price) gets a 15-minute TTL, since it moves continuously during market hours. Coupling both to one TTL would have meant either serving stale prices for a day or re-fetching rarely-changing fundamentals unnecessarily, burning through the free tier's 25-requests/day budget faster than needed. Both are simple in-memory dicts, reset on backend restart - no Redis or database introduced, per explicit instruction to avoid that infrastructure for this milestone.

**2026-08-24 — Two real bugs found and fixed during live end-to-end verification (AAPL, CAT, WMT)**
Both were only findable by testing against the real API with a real key, not by unit tests against hand-written fixtures alone:
1. Alpha Vantage's free tier enforces roughly 1 request/second; a single "Load Company" call fires five sequential requests (overview, income statement, balance sheet, cash flow, quote) with no pacing, and the very first real-key test tripped Alpha Vantage's own per-second rate-limit notice before returning any data. Fixed with a module-level throttle in `app/services/alpha_vantage.py` (minimum ~1.2s between any two requests, at the single point every call passes through) - confirmed the 429 error path itself worked correctly even while finding this, then confirmed the throttle fixes it.
2. Apple's real balance sheet reports the literal string `"None"` for `currentDebt` (a field the NWC calculation depended on) while reporting a real value for the closely-related `shortTermDebt` field for the same period - silently producing `change_in_nwc: null` and therefore `unlevered_fcf: null` for every single historical period, for one of the largest, most-scrutinized public companies. Not a hypothetical edge case. Fixed with a documented fallback (`_current_debt()` in `company_data.py`): use `currentDebt` when present, else `shortTermDebt` - a conservative choice (not summed, since it's not certain the two are additive rather than alternate representations for this provider). CAT and WMT did not hit this specific gap, confirming the fallback generalizes rather than being a single-company patch.
Both fixes are covered by new tests (68 total) using fixtures that reproduce the exact failure shape, not just the fix's happy path.

**2026-08-24 — Live verification results (AAPL, CAT, WMT), sanity-checked against known real-world facts, not just internal consistency**
All three tickers returned complete profile + 5-year historical data, with UFCF/net debt/shares populated for every period after the currentDebt fix. Cross-checked: Walmart's operating margin came back ~4.18% (correctly thin - Walmart is a famously low-margin discount retailer, a strong sanity signal that revenue/EBIT fields and the margin calculation are correctly wired, not just internally self-consistent); Apple's and Caterpillar's UFCF figures were hand-recomputed from the returned EBIT/tax-rate/D&A/CapEx/NWC-change components and matched the API response to the cent; net debt matched `total_debt - cash` exactly for all three; SEC CIKs resolved correctly (Apple's `0000320193` matches the value independently confirmed during the pre-implementation provider research). Caching confirmed working (a repeat AAPL request returned in ~0.25s vs. ~5.4s for a fresh fetch, consuming no additional API calls). The full browser UI pipeline was also verified end-to-end with real data (WMT): sourced fields populate the form, purely-analyst-judgment fields (growth rate, forecast period, WACC, terminal growth) stay blank, no auto-run occurs, and a resulting valuation ($21.78/share against WMT's $106.49 market price) is a large, expected gap - a simple flat-growth DCF given deliberately illustrative test assumptions, not a data or calculation bug; scenario save/load round-tripped all seven fields correctly, including the ticker-sourced ones.

**2026-08-24 — Security fix found in production: Alpha Vantage's own rate-limit message echoes the raw API key**
Found while confirming the key was picked up correctly on Render after deployment: hitting the daily 25-request limit returns a response from Alpha Vantage that includes the caller's own API key in plain text ("We have detected your API key as ..."). The backend was passing that message straight through as the error `detail` returned to the frontend. Since this app is public and the key is shared across every visitor (not issued per-user), any user hitting that rate-limited state would see the shared key exposed in their browser's network tab - a real, live-confirmed exposure, not a theoretical one. Fixed by raising a generic, fixed message for this case instead of relaying Alpha Vantage's raw text; the original detailed message is still printed server-side (visible in Render's Logs) for actual debugging. Covered by a new regression test that simulates Alpha Vantage's real response shape (with a fake key standing in for a real one) and asserts the key never appears in the raised error. 1 new backend test (69 total).
