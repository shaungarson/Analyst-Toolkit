# Analyst Toolkit — Progress

**Last verified:** 2026-09-01 (historical trend mini-charts, chart-color/print refinements,
the Source Details inspector redesign, and the AGENTS.md Codex-consultant boundary all
pushed and deployed to production)

## Current Milestone

None — awaiting direction. DCF data resilience, per-value provenance + an editable dated
reference price, Costco (COST) confirmed as the demo candidate, the embedded Costco DCF
demo, historical trend mini-charts, and the Source Details inspector redesign are all
shipped and deployed to production. See `docs/ROADMAP.md` and `docs/decisions.md`.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

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
  and dated reference price, three Downside/Base/Upside cases (only FCF growth varies; WACC
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

1. **Reverse DCF** (next in the agreed DCF sequence) — see `docs/ROADMAP.md`. Not started,
   not authorized to begin yet.
2. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log (all 51 dated decisions, every phase, every milestone)
