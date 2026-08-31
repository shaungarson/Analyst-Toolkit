# Analyst Toolkit — Progress

**Last verified:** 2026-08-31 against commit `160df8f`

## Current Milestone

None — awaiting direction. Documentation and context restructuring (splitting the former
monolithic `PROGRESS.md` into current-state, roadmap, decisions, and reference docs) is
complete as of 2026-08-31.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-08-30 — SEC EDGAR made primary source for DCF historical fundamentals (Alpha Vantage
  as fallback + current price) — [decisions.md](docs/decisions.md#sec-financial-field-conventions-and-derivation-rules)
- 2026-08-30 — DCF `fcf_growth_rate` validation: no fixed ceiling or floor — [decisions.md](docs/decisions.md#dcf-explicit-period-fcf-growth-validation)
- 2026-08-29 — DCF hardening: route-level API tests, CI pipeline
- 2026-08-28 — DCF terminal growth validation redesign (Gordon Growth convergence domain) — [decisions.md](docs/decisions.md#dcf-terminal-growth-validation)
- 2026-08-28 — DCF workstation redesign (dense 3-column analyst layout, current-price comparison)

## Next Three Actions

1. Await user review/approval of this documentation restructuring.
2. Per-value provenance is next in the agreed DCF sequence (see `docs/ROADMAP.md`) — not
   started, not authorized to begin yet.
3. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log (all 51 dated decisions, every phase, every milestone)
