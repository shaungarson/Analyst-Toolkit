# Analyst Toolkit — Progress

**Last verified:** 2026-08-31 (embedded Costco demo implemented and verified; committed
locally, awaiting push and deployment)

## Current Milestone

None — awaiting direction. DCF data resilience, per-value provenance + an editable dated
reference price, and Costco (COST) confirmed as the demo candidate are shipped and deployed
to production. The embedded, provider-independent Costco DCF demo itself (three ephemeral
Downside/Base/Upside cases, no network request to load, real backend engine to calculate) is
implemented, verified, and committed locally — awaiting push and deployment. See
`docs/ROADMAP.md` and `docs/decisions.md`.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

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
- 2026-08-30 — SEC EDGAR made primary source for DCF historical fundamentals (Alpha Vantage
  as fallback + current price) — [decisions.md](docs/decisions.md#sec-financial-field-conventions-and-derivation-rules)

## Next Three Actions

1. Push the embedded Costco demo (committed locally) to `origin/main` once approved.
2. **Reverse DCF** (step 5 of the agreed DCF sequence) — see `docs/ROADMAP.md`. Not started,
   not authorized to begin yet.
3. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log (all 51 dated decisions, every phase, every milestone)
