# Analyst Toolkit — Progress

**Last verified:** 2026-09-02 (Cross-company stale-input fix — commit `449156d`, CI green,
deployed and production-verified: Base Year UFCF, Net Debt, and Diluted Shares Outstanding
now explicitly replace-or-clear on every company load instead of silently surviving from the
previously loaded company when the new one is missing a field. Reproduced and re-verified
live in production with AAPL → EOSE → AAPL: EOSE's null `unlevered_fcf` correctly blanks Base
Year UFCF with no Sourced badge, EOSE's own Net Debt/Shares populate correctly, a manually
entered WACC survives both switches untouched, and Valuation Summary stays cleared
throughout). Prior verified milestone: 2026-09-02, the deployment polish sprint — see
Recently Shipped below for that and every earlier DCF milestone.

## Current Milestone

**Driver-Based DCF (v1) is complete, has been through closeout review, and its review findings
are resolved — awaiting the user's approval to commit and deploy.** Not yet committed, not yet
pushed, not yet in CI, not yet deployed. Closeout review (including an independent
financial-model review) surfaced three corrections, all now implemented and verified: an
`extreme` warning when the final forecast year's UFCF is zero or negative (Gordon Growth
otherwise produces a negative terminal value with no scrutiny at all); completeness validation
so a blank input is never silently coerced to zero, across every field sent to the API; and a
neutral "Tax Rate" label with copy distinguishing the reported book effective rate from the
forecast cash-tax proxy. Verified at 190 backend and 94 frontend tests, lint and build clean,
with the two behavioral fixes confirmed live against a running dev server. See
`docs/decisions.md#driver-based-dcf-v1` for the full design, correction, and verification
record, and Next Actions below.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-09-02 — Cross-company stale-input fix: `loadCompany` only set the sourced patch for
  Base Year UFCF / Net Debt / Diluted Shares Outstanding when the newly loaded company
  actually had a value, so a field a new company lacks (e.g. EOSE's null `unlevered_fcf`)
  left the *previously* loaded company's figure sitting in the form, unbadged. Fixed by a new
  pure `companyDataToSourcedFields` helper that always returns every key (the real value, or
  `''`), so the merge always replaces; `fieldBadgeType` (also extracted to a pure
  `sourceableFieldBadgeType` helper) now shows no badge for a blank field and "Analyst Input"
  (never "Sourced") for a value the analyst typed in with nothing sourced this load. 11 new
  regression tests. Analyst-only assumptions (WACC, terminal growth, FCF growth rate,
  forecast years) were never affected. Committed `449156d`, CI green, deployed and
  production-verified (see Last Verified above).
- 2026-09-02 — Deployment polish sprint: DCF Valuation is now the app's default module on
  load (was real estate); the DCF module opportunistically pings `/api/health` on mount
  (cache-bypassing, non-blocking, silent on failure) so a cold Render instance starts waking
  before the analyst finishes the form, with a concise status line shown only while still
  waking and Run Valuation never gated on it; real estate now carries a brief scope note
  ("Simplified asset-level underwriting model; further expansion is paused pending external
  practitioner review.") near its intro; `index.html` carries a real title plus Open
  Graph/Twitter metadata and a generated 1200x630 social-preview image; README gets two
  optimized screenshots (DCF Costco demo results, Real Estate Underwriting). No calculation
  or methodology change. Committed `d1659b5`/`862a9b8`, CI green, deployed and
  production-verified (see Last Verified above).
- 2026-09-02 — Explain This Valuation: up to three deterministic observations synthesized
  from outputs the forward DCF, reverse DCF, sensitivity grid, and historical-CAGR helper
  already compute — no change to the valuation engine or methodology, only presentation-level
  differences, ratios, and ranges; no backend or schema change. Price-implied growth vs. the
  analyst's case and historical UFCF CAGR as an exact percentage-point difference (or an
  explicit "matches to displayed precision" when the two round to the same figure); terminal
  value's share of enterprise value, stated only as a proportion; sensitivity range relative
  to the base-case value per share. Frontend: 44 tests (26 new for this milestone), lint, and
  build all pass; 153 backend tests unaffected. Committed `6d7404c`, CI green, deployed and
  production-verified: the live bundle confirmed serving the new code, and a smoke test
  against the Costco demo confirmed all three observations' exact numbers, case-tab
  switching, and independent forward/reverse invalidation, all matching local verification —
  [decisions.md](docs/decisions.md#explain-this-valuation)
- 2026-09-02 — Reverse DCF (price-implied FCF growth): solves for the constant
  explicit-period FCF growth rate that reconciles the dated reference price, shown under
  Valuation Summary alongside historical unlevered FCF CAGR, never framed as a market
  forecast. One shared result per Run Valuation, invalidated independently from the forward
  valuation. Backend 153 tests / frontend 18 tests / lint / build all pass; production
  smoke-tested (solved result reconciling within tolerance, forward valuations unchanged,
  Costco Base Growth's 30.73% untouched, one request per run shared across tabs, zero
  requests on tab switch, the full invalidation matrix, a simulated reverse-request failure
  leaving forward intact, and CSV export honesty) — [decisions.md](docs/decisions.md#reverse-dcf-price-implied-fcf-growth)
- 2026-09-01 — Costco demo-entry consolidation and one-run case tabs: removed the DCF
  module's synthetic "Load Example"; a full-sized "Costco Demo" header button activates the
  demo and opens/closes its disclosure, replacing the old subtle toggle + button pair; case
  selection (renamed Low/Base/High Growth) moved to three accessible result tabs under
  Valuation Summary; one click of Run Valuation calculates all three via parallel calls to
  the existing endpoints, switching tabs afterward is request-free, an assumption edit
  invalidates all three until rerun (verified stale results/exports stay hidden through the
  rerun, not just after it), and CSV exports are case-labeled — [decisions.md](docs/decisions.md#dcf-demo-entry-consolidation-and-the-one-run-three-tab-case-model)
- 2026-09-01 — Costco header profile fix: clean "Costco Wholesale Corporation" name (was the
  raw SEC "/NEW" registrant string), a real classification and dated market cap in place of
  blank fields, both disclosed with source/date.
- 2026-09-01 — AGENTS.md: keeps Codex, used as an external product/finance/UX consultant via
  `CHATGPT_CONSULTANT.md`, strictly read-only and advisory — no file edits, builds, or
  state-changing Git operations, and ambiguous approval language ("let's do it," "commit it")
  must be treated as a request to draft a Claude Code prompt, not authorization to act.
- 2026-09-01 — Source Details inspector: the "Sources" panel is now a bounded (~340px),
  internally-scrolling panel with a sticky header and a dynamic status summary, replacing an
  unbounded field-by-field dump. Friendly-first provenance detail (source/period/filing link
  prominent, raw tag/accession muted) is now shared with the 5-year history cell popover —
  [decisions.md](docs/decisions.md#source-details-inspector-bounded-friendly-first-provenance-detail)
- 2026-09-01 — Chart color and print refinements: Revenue/UFCF mini-chart bars and provenance
  dots use more distinguishable colors; print output keeps chart bars solid black regardless.
- 2026-08-31 — Historical trend mini-charts: two compact CSS bar charts (Revenue, Unlevered
  FCF) in the sourced-data panel, shared fiscal-year strip, independent scales, correct
  handling of negative/zero/missing values, no chart library — [decisions.md](docs/decisions.md#historical-trend-mini-charts)
- 2026-08-31 — Embedded, provider-independent Costco DCF demo: a frozen real 5-year snapshot
  and dated reference price, three Low/Base/High Growth cases (only FCF growth varies; WACC
  and terminal growth fixed), zero network requests to load, real `/api/dcf/valuation` engine
  to calculate — [decisions.md](docs/decisions.md#revised-dcf-sequence-data-resilience-combined-provenanceprice-milestone-and-a-validated-real-company-demo)
- 2026-08-31 — Costco (COST) confirmed as the real-company demo candidate: validated live
  against the deployed production API — all 5 years map with zero Alpha Vantage fallback, one
  explicable (not disqualifying) working-capital-driven FCF dip in FY2022 — [decisions.md](docs/decisions.md#revised-dcf-sequence-data-resilience-combined-provenanceprice-milestone-and-a-validated-real-company-demo)
- 2026-08-31 — Per-value provenance + editable, dated reference share price: historical
  fundamentals disclose source/status/filing metadata field-by-field; `current_price`
  replaced by an editable `reference_price`/`reference_price_as_of` pair with honest
  Sourced/Adjusted/Analyst Input status, including correct status recovery on a saved-scenario
  reload — [decisions.md](docs/decisions.md#per-value-provenance-and-reference-price-disclosure)
- 2026-08-31 — DCF data resilience: Alpha Vantage fundamentals and current price are now
  optional field-level enrichment, not a hard dependency; company periods build directly
  from SEC's own fiscal dates — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Next Actions

1. Driver-Based DCF (v1) is implemented, reviewed, and its review findings resolved —
   awaiting explicit approval to commit and deploy. See
   `docs/decisions.md#driver-based-dcf-v1`. Deferred out of v1 and worth picking up next,
   in rough priority order: a warning when a forecast year's EBIT margin is negative (the
   no-NOL asymmetry binds silently in exactly that case), guarding the "Last Actual"
   NWC-investment cell against a near-zero Δ Revenue denominator, and rendering the full
   per-year build-up on screen rather than only in the CSV export — Driver mode's
   auditability argument mostly rests on seeing why each year's UFCF is what it is.
2. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log (all 51 dated decisions, every phase, every milestone)
