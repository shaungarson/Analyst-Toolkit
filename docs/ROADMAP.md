# Roadmap

## Now

No active product milestone — see [`PROGRESS.md`](../PROGRESS.md) for current status.

Real estate is **frozen**: no further changes until the user validates underwriting
conventions with a CRE professional. See "Real estate freeze" in
[`decisions.md`](decisions.md).

## Next

The agreed DCF sequence (see "DCF forward-sequence rationale" in `decisions.md`) — hardening
and SEC EDGAR as primary fundamentals are done; remaining items, in dependency order:

1. **Per-value provenance** — filing period, filing date, accession number, source link, XBRL
   tag, and a reported/combined/calculated confidence marker, surfaced in the UI. The
   underlying data already exists internally (`backend/app/services/sec_fundamentals.py`);
   this is a schema/UI-exposure milestone, not new data-fetching work.
2. **Editable, dated reference share price** — no real-time requirement.
3. **Reverse DCF** — analyst case vs. historical performance vs. market-implied FCF growth.
   Needs (1) and (2) done first.
4. **Deterministic "Explain This Valuation" diagnostics** — before any AI commentary. A full
   version benefits from reverse DCF being done first; a narrower version (explaining
   sensitivity/warnings already computed today) has no such dependency and could be pulled
   forward independently if ever wanted.

Open question flagged for when this sequence completes: whether Alpha Vantage remains in the
DCF pipeline at all once SEC EDGAR and the reference price both land — an explicit decision
to make then, not a silent drift.

## Later

Reasonable follow-ups, not yet scheduled:

- **Driver-based DCF forecast** — revenue → margin → taxes → D&A → CapEx → ΔNWC, replacing
  the current flat-growth explicit period. The long-signaled next evolution of the DCF
  engine; the data layer is already shaped to support it without a rewrite.
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
- **README screenshots.**

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
