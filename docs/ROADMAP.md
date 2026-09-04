# Roadmap

## Now

No active product milestone — see [`PROGRESS.md`](../PROGRESS.md) for current status.

Real estate is **frozen**: no further changes until the user validates underwriting
conventions with a CRE professional. See "Real estate freeze" in
[`decisions.md`](decisions.md).

## Next

The agreed DCF sequence (see "Revised DCF sequence: data resilience, combined
provenance/price milestone, and a validated real-company demo" in
[`decisions.md`](decisions.md)) is complete, together with one item added to it on its own
merits — historical trend mini-charts, proposed and evaluated before reverse DCF. The
completed items, in the dependency order they were built:

1. ~~**DCF data resilience.**~~ **Done (2026-08-31).** Alpha Vantage fundamentals and price
   became genuinely optional, so a ticker search succeeds on SEC-sourced data alone rather
   than failing outright. See "DCF ticker-search data pipeline" in
   [`ARCHITECTURE.md`](ARCHITECTURE.md).
2. ~~**Per-value provenance and an editable, dated reference share price — one combined
   milestone.**~~ **Done (2026-08-31).** Every historical field now discloses its own status,
   period, and source, and `current_price` was retired in favour of an editable, dated
   Reference Price. See "Per-value provenance and reference price disclosure" in
   [`decisions.md`](decisions.md).
3. ~~**Bounded validation of a real-company demo candidate.**~~ **Done (2026-08-31) — Costco
   confirmed.** A live run against the deployed production API returned five complete
   SEC-sourced years with no fallback fields anywhere, clearing Costco as the demo candidate.
   See "Revised DCF sequence: data resilience, combined provenance/price milestone, and a
   validated real-company demo" in [`decisions.md`](decisions.md).
4. ~~**Embedded, provider-independent real-company DCF demonstration.**~~ **Done
   (2026-08-31).** A frozen five-year Costco snapshot and dated reference price drive three
   Low/Base/High growth cases through the real valuation engine with no provider request at
   all. See "DCF demo-entry consolidation and the one-run, three-tab case model" in
   [`decisions.md`](decisions.md).
5. ~~**Historical trend mini-charts.**~~ **Done (2026-08-31).** Two compact, library-free bar
   charts (Revenue, Unlevered FCF) in the sourced-data panel, drawn from period data already
   loaded. See "Historical trend mini-charts" in [`decisions.md`](decisions.md).
6. ~~**Reverse DCF.**~~ **Done (2026-09-02).** Solves for the constant explicit-period FCF
   growth rate that reconciles the dated reference price, reported as "Price-Implied FCF
   Growth" and never framed as a market forecast. A WACC-based reverse-sensitivity table and
   a comparison chart were deliberately deferred out of this milestone's scope — see "Later"
   below. See "Reverse DCF (price-implied FCF growth)" in [`decisions.md`](decisions.md) and
   [`MODELING_CONVENTIONS.md`](MODELING_CONVENTIONS.md).
7. ~~**Explain This Valuation.**~~ **Done (2026-09-02).** Up to three deterministic
   observations synthesized from figures the forward DCF, reverse DCF, sensitivity grid, and
   historical-CAGR helper already compute — no engine or methodology change, and no AI
   commentary, per this sequence's own "before any AI commentary" rule. See "Explain This
   Valuation" in [`decisions.md`](decisions.md).
8. ~~**Driver-Based DCF (v1).**~~ **Done (2026-09-02).** A second forecast-entry mode
   alongside Quick DCF (not a replacement) — revenue → margin → tax → D&A → CapEx → ΔNWC per
   forecast year, sharing one valuation core with Quick DCF. Reverse DCF and live-ticker
   Low/Base/High case management stay Quick DCF-only in v1; Costco's demo and tabs are
   unaffected. See "Driver-Based DCF (v1)" in [`decisions.md`](decisions.md) and
   [`MODELING_CONVENTIONS.md`](MODELING_CONVENTIONS.md).

9. ~~**Driver-Based DCF (v2): evidence-led forecast entry.**~~ **Done (2026-09-03).**
   Per-driver historical evidence with a normalized reference statistic, an explicit
   Initialize Forecast action with transparent per-driver seeding and refusal rules, Flat /
   Fade / Custom row modes (the annual grid repositioned as the advanced schedule editor), a
   one-time terminal-growth target action, real fiscal-year column labels where unambiguous,
   and reduced instructional density. Engine, warnings, payload and CSV unchanged. See
   "Driver-Based DCF (v2): evidence-led forecast entry" in [`decisions.md`](decisions.md) and
   [`MODELING_CONVENTIONS.md`](MODELING_CONVENTIONS.md).
10. ~~**Costco demo: a provider-independent Driver Base Case.**~~ **Done (2026-09-03).**
    Reverses v1's Quick-only restriction: the demo now populates a complete, deterministic
    five-year Driver Base Case (revenue growth Fade to the shared terminal growth rate; EBIT
    margin, tax, D&A and CapEx Flat at their historical medians, all badged Seeded) alongside
    the unchanged Quick-mode Low/Base/High presets, with NWC Investment force-set to an
    explicit `-3.0% Flat` demo assumption rather than seeded, since Costco's own working-capital
    history is refused as unstable. Live-ticker Low/Base/High case management (see Later,
    below) is unaffected. See "Costco demo: a provider-independent Driver Base Case" in
    [`decisions.md`](decisions.md) and [`MODELING_CONVENTIONS.md`](MODELING_CONVENTIONS.md).
11. ~~**Driver-Based DCF: standardized ±1pp driver sensitivity (tornado).**~~ **Done
    (2026-09-03).** The first sensitivity treatment of Driver mode's own drivers: a ranked,
    one-driver-at-a-time ±1pp parallel shift across every forecast year, six operating drivers,
    thirteen `run_driver_dcf` calls (one base plus six x two directions) behind `POST
    /api/dcf/driver-tornado`. Rows are ranked by the spread across the base value and both
    tested endpoints (`tested_range`) — not by the distance between the endpoints alone —
    because the two endpoints of one driver can legitimately fall on the same side of base,
    where an endpoint-only measure would rank a driver as having moved nothing. WACC and
    terminal growth are excluded as non-drivers and keep their own grid; sensitivity-cell
    adoption, scroll-to-driver, and the continuity/waterfall/PV-composition charts were all
    deliberately excluded from this milestone. Endpoints whose standardized
    shift introduces a driver warning the base case does not already raise are marked on the
    chart with tier, short name and affected years — never clamped or skipped. See
    "Driver-Based DCF: standardized ±1pp driver sensitivity (tornado)" in
    [`decisions.md`](decisions.md) and [`MODELING_CONVENTIONS.md`](MODELING_CONVENTIONS.md).

## Later

Reasonable follow-ups, not yet scheduled:

- **UI audit Phases 2-4** — the Driver Schedule evidence hierarchy and inline NWC guidance
  (Phase 2), the stacked mobile Driver Schedule and touch targets (Phase 3), and an optional
  type-scale/focus cleanup to be re-justified before it is built (Phase 4). Designs, measured
  evidence and priorities live in [`UI_AUDIT.md`](UI_AUDIT.md); each phase is presented for
  approval before implementation. Phase 1 (dark-only, split accent token, semantic
  accessibility), Phase 2 (Driver Schedule evidence hierarchy, reliability on every row, visible
  History-informed terminology, inline NWC guidance replacing the floating popover) and Phase 3
  (stacked mobile Driver Schedule, 16px/44px fields, collapsed mobile demo disclosure) are done —
  see [`decisions.md`](decisions.md). Phase 4 is gated on a materiality reassessment and may be
  closed unbuilt.

- **Two-way Revenue Growth x EBIT Margin sensitivity table** — the tornado (item 11 above) has
  now settled the perturbation convention: a fixed, stated shift, transparently labeled, rather
  than one scaled to each driver's own historical dispersion. Must inherit the documented
  axis-inversion handling for a non-positive final-year UFCF.
- **Quick DCF FCF-growth sensitivity** — Quick mode's flat FCF growth rate still has no
  sensitivity treatment of its own. The WACC x terminal-growth grid does not cover it, and the
  Driver tornado does not apply (it measures the six operating drivers, which exist only in
  Driver mode). Reverse DCF answers a different question — what growth reconciles a price — not
  how much value moves per unit of growth.

- **Driver-Based DCF: NOL carryforward** — v1's cash-tax convention (`max(EBIT, 0) × rate`)
  gives a loss year no tax benefit against a later profitable one; modeling actual net
  operating loss carryforwards is a real, disclosed limitation, not yet addressed.
- **Driver-Based DCF: terminal-year normalization** — sustainable terminal margins and
  reinvestment economics, deferred rather than assumed. Not scoped as "D&A converges with
  CapEx"; that's one possible refinement among several, not declared as the eventual
  correctness target.
- **Driver-Based DCF: Reverse DCF** — deferred; a multi-driver forecast has no single scalar
  to solve a reference price against the way Quick DCF's one flat rate does.
- **Live-ticker Low/Base/High case management** — a later case-management milestone, once
  Driver-Based DCF itself has been used and stabilized. The intended workflow copies a Base
  case into analyst-edited Low/High cases rather than inventing assumptions; a saved
  driver-scenario's shape is already what that workflow would clone, so no engine redesign is
  expected to be needed for it.
- **Reverse DCF sensitivity table / comparison chart** — a WACC-based reverse-sensitivity
  grid, and a chart comparing price-implied growth against the analyst's own case and
  historical FCF CAGR. Deliberately deferred out of the core reverse-DCF milestone
  (2026-09-02) until that workflow itself has been used and validated.
- **DCF assumption-difference comparison** — mirrors the real estate scenario-workflow
  feature (highlights exactly which saved-scenario assumptions differ).
- **DCF Professional Deal Summary** — mirrors the real estate one. The 2026-08-28 workstation
  redesign's Valuation Summary column already covers much of the "quick read" need within
  the core page; a separate print-optimized summary artifact is still a distinct, unbuilt
  idea.
- **Scenario-comparison variant of the Professional Deal Summary** (Base/Downside/Upside
  side-by-side) — needs its own design pass on how a multi-scenario summary should work.
- **Contextual (currency/macro-aware) terminal-growth plausibility guidance** — needs a real
  reference-rate data source before it can be more than another hard-coded universal
  threshold; static methodology text covers this for now.

## Rejected

Evaluated and deliberately not built. Recorded so the question does not get re-opened without
new evidence.

- **Historical share-price vs. revenue-growth correlation / "revenue beta"** (2026-09-03) —
  four annual observations cannot support a regression; share prices respond to surprises
  against expectations rather than realised reported growth; "beta" already means covariance
  with the market; and the app holds one dated price with no time series, so it would need a
  new provider for a statistic that is not credible. Reverse DCF already answers the honest
  version of the question. See "Driver-Based DCF (v2)" in [`decisions.md`](decisions.md).
- **Frontend forecast preview duplicating the backend projection** (2026-09-03) — the backend
  remains the sole implementation of `project_driver_years`; two implementations of one
  formula drift. Per-year cash flows are read from the post-run forecast schedule.

## Parked

Deliberately not scoped or scheduled. Do not build until explicitly instructed.

### Real estate

- Refinancing, multiple debt tranches, waterfalls/promotes.
- **Tenant / Rent-Roll Underwriting Module** — a more realistic underwriting workflow,
  modeling a property at the tenant/unit level instead of one flat NOI growth rate. Would
  extend the current multi-year real estate model (tenant-level lease rollups replacing the
  flat growth-rate assumption).
  - Tenant/lease-level inputs (illustrative, not a spec): unit/space count, rent and % of
    total revenue per tenant, lease start/expiry and remaining term, contractual
    escalations, current vs. market rent, renewal probability, expected downtime on
    rollover, TI/leasing commission costs, and transparent tenant-risk factors (credit
    quality, public/private status, financial strength, payment history, revenue
    concentration).
  - Derived property-level metrics (illustrative): occupancy, tenant concentration,
    lease-expiry schedule and % of rent expiring within 1/2/3/5 years, weighted average
    lease term, rollover exposure, projected rental revenue and NOI.
  - Design principle: no arbitrary or falsely precise "tenant health scores." Transparent,
    evidence-based inputs, showing how assumptions move cash flow — not a black-box score
    (see "Deterministic risk analysis" in `decisions.md`).
  - AI-expansion pipeline (same mental model as Phase 9 below, applied here): rent
    roll/lease documents → structured tenant data → lease-level assumptions → multi-year
    NOI → valuation and returns → risk insights.
  - **Gate:** scope is deliberately not finalized. Before committing to specific fields or
    workflow, validate with real commercial real estate professionals what tenant-level
    information they actually use when underwriting — do not build ahead of that input.

### AI Analyst Features (long-term differentiator)

The eventual product direction once the modeling engine is mature — not scoped or scheduled;
see "Long-term product direction" in `decisions.md` for the reasoning. Mental model: raw
deal/company information → structured assumptions → financial model →
scenarios/sensitivities → risks/insights → decision-ready summary/export, with AI and
workflow automation progressively reducing the manual effort between those stages.

Example future capabilities (illustrative, not a spec):

- Importing/extracting data from source documents (OMs, rent rolls, T12s, financial
  statements) into structured model inputs
- Automatically structuring raw inputs for the model
- Identifying missing or inconsistent information in provided data
- Generating and comparing scenarios
- Flagging underwriting or valuation risks
- Interpreting sensitivity results in plain language
- Generating investment summaries or IC-style commentary
- Exporting analysis into professional formats

Does not block the recruiter-ready version of the app.

### Other

- **TypeScript adoption** — deferred until the codebase justifies it.
- **Backend: database, auth, cloud storage** — deferred until there's a clear need
  (cloud-saved analyses, collaboration, proprietary logic staying server-side, a new
  third-party API call) — see `CLAUDE.md`'s Architecture section for the bar this needs to
  clear.
