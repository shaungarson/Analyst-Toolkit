# Analyst Toolkit — Progress

**Last verified:** 2026-09-02 (Reverse DCF — price-implied FCF growth — committed, pushed, CI
green, and verified live in production on both Render and Vercel, including a focused
production smoke test covering the full invalidation matrix, CSV export, and a simulated
reverse-request failure). Prior to this: 2026-09-01, Costco header profile fix and the
one-run/three-tab demo consolidation both pushed and verified live in production, on top of
the historical trend mini-charts, chart-color/print refinements, the Source Details inspector
redesign, and the AGENTS.md Codex-consultant boundary already deployed.

## Current Milestone

**Explain This Valuation** — implemented and verified locally, **not yet committed or
deployed**: the frontend suite (41 tests — 23 of them new for this milestone, up from 18),
lint, and build all pass; 153 backend tests unaffected (no backend change); manually verified in the
dev server against the Costco demo (tab switching, independent forward/reverse invalidation,
mobile responsive layout, print CSS wiring). Awaiting review before commit. See
`docs/ROADMAP.md` and `docs/decisions.md`.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

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

1. Review and, if approved, commit and deploy **Explain This Valuation** (implemented,
   locally verified, currently uncommitted).
2. After that: no DCF milestone currently planned — next direction open (the deferred
   reverse-DCF sensitivity table/comparison chart, driver-based forecasting, or something
   else; see `docs/ROADMAP.md`).
3. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log (all 51 dated decisions, every phase, every milestone)
