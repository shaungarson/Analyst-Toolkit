# Roadmap

## Now

No active product milestone — see [`PROGRESS.md`](../PROGRESS.md) for current status.

Real estate is **frozen**: no further changes until the user validates underwriting
conventions with a CRE professional. See "Real estate freeze" in
[`decisions.md`](decisions.md).

## Next

The agreed DCF sequence (see "Revised DCF sequence: data resilience, combined
provenance/price milestone, and a validated real-company demo" in `decisions.md`) — hardening,
SEC EDGAR as primary fundamentals, DCF data resilience, per-value provenance/reference price,
and Costco candidate validation are done; remaining items, in dependency order:

1. ~~**DCF data resilience.**~~ **Done (2026-08-31).** Alpha Vantage fundamentals and current
   price are now genuinely optional — a ticker-search request succeeds on SEC-sourced data
   alone if Alpha Vantage is unavailable, rate-limited, or unconfigured, with any
   Alpha-Vantage-only field honestly absent rather than the whole request failing. Company
   periods are now built from the union of both providers' own fiscal dates rather than
   requiring Alpha Vantage's first. 10 new backend tests (including a regression test for the
   oldest displayed period's prior-year NWC lookup, caught and fixed before this shipped -
   the canonical period list must never include a balance-sheet-only year, but the extra
   balance-only year Alpha Vantage provides specifically for that NWC delta still needs to be
   found); live-verified against AAPL and WMT with the Alpha Vantage key removed entirely
   (full 5-period SEC-sourced responses) and with it configured normally (unchanged
   behavior). See `docs/ARCHITECTURE.md` for the resulting pipeline shape.
2. ~~**Per-value provenance and an editable, dated reference share price — one combined
   milestone.**~~ **Done (2026-08-31).** Every historical field now discloses status
   (reported/combined/calculated/fallback), filing period, filing date, accession number,
   XBRL tag(s), and a source link where applicable — compact dots by default (latest-period
   panel and the 5-year history table alike), full detail one click away via a "Sources"
   toggle, never a wall of permanent badges. `current_price` is retired: the DCF workstation
   now has an editable, dated Reference Price that extends the existing
   `Sourced/Analyst/Adjusted` badge pattern, with its own rule for the reload case (see
   `decisions.md`). Provenance assertions added across the existing company-data test suite,
   plus 3 new tests (reference-price sourcing, and a new route-level test file covering
   full-schema serialization) — 136 backend tests total, up from 133; live-verified against
   AAPL. See `docs/decisions.md` for the full design record.
3. ~~**Bounded validation of a real-company demo candidate.**~~ **Done (2026-08-31) — Costco
   confirmed.** Run live against the deployed production API (`/api/company/COST`), not a
   local fixture. Result: complete and clean. Every field across all 5 SEC-sourced years is
   `reported`/`combined`/`calculated` — zero `fallback` to Alpha Vantage anywhere, a cleaner
   result than AAPL/WMT's original validation runs. `cash`/`total_debt` components are
   sensible (cash + short-term investments; long-term + current debt plus finance leases, no
   overlap). Revenue, D&A, and CapEx all grow smoothly year over year (steady warehouse
   footprint expansion), and operating margin holds in a tight 3.4–3.8% band throughout - the
   thin-margin, high-volume characteristic that makes Costco a legible teaching example in the
   first place. One real, non-disqualifying pattern worth knowing before (4) is built: FY2022
   unlevered FCF dips to ~1.2% of revenue (vs. ~1.9–2.4% every other year), driven by a
   genuine swing in change-in-NWC that year (+$1.08B vs. negative in 4 of 5 years) rather than
   any data-mapping issue - confirmed by re-deriving UFCF by hand from the reported EBIT/tax/
   D&A/CapEx/ΔNWC components. Doesn't affect the most recent year (FY2025, the likely demo
   base year), and is itself fully explained by this milestone's own provenance UI if a viewer
   expands it. See `docs/decisions.md` for the full validation record.
4. **Embedded, provider-independent real-company DCF demonstration**, once (3) confirms a
   suitable candidate — a frozen, embedded five-year financial snapshot and dated reference
   price (no live SEC/Alpha Vantage requests when the demo loads; valuations still run through
   the deployed backend), with three
   ephemeral Downside/Base/Upside cases. Results calculated live through the real DCF engine,
   never hardcoded. WACC and terminal growth stay constant across the three cases; only
   explicit-period FCF growth varies. The cases never touch `localStorage` — a compact panel
   that only appears while the snapshot is active, not a permanent addition to the
   saved-scenario system. Frozen financial period, reference-price date, sources, and demo
   status are disclosed prominently, visually distinct from live ticker-search data. Any
   valuation gap against the reference price gets neutral, direction-agnostic framing, not
   candidate-specific commentary.
5. **Reverse DCF** — analyst case vs. historical performance vs. market-implied FCF growth.
   Needs (2) done first (a real price to solve against). Followed later by deterministic
   "Explain This Valuation" diagnostics, before any AI commentary — a full version benefits
   from reverse DCF being done first; a narrower version (explaining sensitivity/warnings
   already computed today) has no such dependency and could be pulled forward independently
   if ever wanted.

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
