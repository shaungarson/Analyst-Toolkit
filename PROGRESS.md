# Analyst Toolkit — Progress

**Last verified:** 2026-08-31 (per-value provenance + editable reference price implemented
and verified; pending commit)

## Current Milestone

None — awaiting direction. **Per-value provenance and an editable, dated reference share
price** (step 2 of the agreed DCF sequence) is implemented and verified as of 2026-08-31:
every sourced historical field now discloses how it was obtained (reported / combined /
calculated / fallback, with filing metadata and a source link where applicable), and the
former "current price" is now an explicit, dated, editable Reference Price that clearly
distinguishes Sourced from Adjusted from Analyst Input. See `docs/ROADMAP.md` and
`docs/decisions.md`. Not yet committed.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-08-31 — Per-value provenance + editable, dated reference share price: historical
  fundamentals disclose source/status/filing metadata field-by-field; `current_price`
  replaced by an editable `reference_price`/`reference_price_as_of` pair with honest
  Sourced/Adjusted/Analyst Input status — [decisions.md](docs/decisions.md#per-value-provenance-and-reference-price-disclosure)
- 2026-08-31 — DCF data resilience: Alpha Vantage fundamentals and current price are now
  optional field-level enrichment, not a hard dependency; company periods build directly
  from SEC's own fiscal dates — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 2026-08-30 — SEC EDGAR made primary source for DCF historical fundamentals (Alpha Vantage
  as fallback + current price) — [decisions.md](docs/decisions.md#sec-financial-field-conventions-and-derivation-rules)
- 2026-08-30 — DCF `fcf_growth_rate` validation: no fixed ceiling or floor — [decisions.md](docs/decisions.md#dcf-explicit-period-fcf-growth-validation)
- 2026-08-29 — DCF hardening: route-level API tests, CI pipeline
- 2026-08-28 — DCF terminal growth validation redesign (Gordon Growth convergence domain) — [decisions.md](docs/decisions.md#dcf-terminal-growth-validation)

## Next Three Actions

1. Commit and push per-value provenance + reference price once reviewed and approved.
2. **Bounded validation of a real-company demo candidate** (Costco, tentatively) is next in
   the agreed DCF sequence — see `docs/ROADMAP.md`. Not started, not authorized to begin yet.
3. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log (all 51 dated decisions, every phase, every milestone)
