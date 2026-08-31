# Analyst Toolkit — Progress

**Last verified:** 2026-08-31 (per-value provenance + reference price shipped and deployed;
Costco confirmed as the real-company demo candidate)

## Current Milestone

None — awaiting direction. Steps 1–3 of the agreed DCF sequence are shipped and deployed to
production: DCF data resilience, per-value provenance + an editable dated reference price,
and Costco (COST) confirmed as the validated real-company demo candidate. Step 4 (the
embedded demo itself) is next but not authorized to begin. See `docs/ROADMAP.md` and
`docs/decisions.md`.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

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
- 2026-08-30 — DCF `fcf_growth_rate` validation: no fixed ceiling or floor — [decisions.md](docs/decisions.md#dcf-explicit-period-fcf-growth-validation)
- 2026-08-29 — DCF hardening: route-level API tests, CI pipeline

## Next Three Actions

1. **Embedded, provider-independent Costco DCF demonstration** (step 4 of the agreed DCF
   sequence) — see `docs/ROADMAP.md`. Not started, not authorized to begin yet.
2. Reverse DCF (step 5) — needs (4) done first.
3. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log (all 51 dated decisions, every phase, every milestone)
