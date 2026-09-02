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

## Later

Reasonable follow-ups, not yet scheduled:

- **Driver-based DCF forecast** — revenue → margin → taxes → D&A → CapEx → ΔNWC, replacing
  the current flat-growth explicit period. The long-signaled next evolution of the DCF
  engine; the data layer is already shaped to support it without a rewrite.
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
