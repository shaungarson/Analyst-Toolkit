# Analyst Toolkit — Progress

**Last verified:** 2026-09-03 (Driver-Based DCF v2 — evidence-led forecast entry, including a
five-item closeout correction pass). Backend 190 tests unchanged and passing (no backend file
touched); frontend 164 tests, lint and production build clean. Live-verified against the
running backend and real SEC data: COST initialized, seeded and valued at $202.50/share; AT&T
used as the data-quality fixture (12% EBIT/pre-tax divergence disclosed, CapEx unseedable
across all five periods, direction-reversing NWC window refused where the pre-fix aggregate
would have been 764%); a different ticker clears all driver cells while a same-ticker reload
preserves them; a saved Driver scenario's cells do not survive a subsequent ticker load, with
the scenario itself and the shared assumptions intact; Quick DCF's Costco Base Growth still
$395.69; browser console clean. Not yet committed or deployed — see Next Actions.

## Current Milestone

**None in progress.** Driver-Based DCF v2 (evidence-led forecast entry) is complete and
verified locally. The engine, warning tiers, completeness rules and shared valuation core are
untouched — every change is input-side. Full design, correction and verification record:
[`docs/decisions.md#driver-based-dcf-v2-evidence-led-forecast-entry`](docs/decisions.md);
methodology: [`docs/MODELING_CONVENTIONS.md`](docs/MODELING_CONVENTIONS.md).

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-09-03 — **Driver-Based DCF v2: evidence-led forecast entry.** Per-driver historical
  evidence (every usable observation plus one normalized reference statistic — median for five
  drivers, aggregate ΣΔNWC ÷ ΣΔRevenue for working capital); an explicit **Initialize Forecast**
  action that shows its plan and basis before writing anything and badges what it writes as
  historical-derived starting points; refusal rather than a weak seed where history is thin,
  unstable or sign-flipping; **Flat / Fade / Custom** row modes with the annual grid
  repositioned as the advanced schedule editor; a one-time (never live) "use terminal growth as
  target" action; real fiscal-year column labels where the fiscal period is unambiguous;
  and instructional text reduced to one line plus a print-preserving disclosure. A closeout
  correction pass then hardened the NWC aggregate denominator (direction-reversal and
  net-versus-gross checks), replaced per-row seed clearing with a whole-schedule reset that
  preserves only a positively-identified same-ticker reload, surfaced every material note plus
  excluded-period counts and reasons, gave
  observations visible fiscal-year labels, and removed the duplicated step badge. Rejected in
  scope: historical price correlation / "revenue beta", and any frontend duplication of the
  backend projection. Local verification only — [decisions.md](docs/decisions.md#driver-based-dcf-v2-evidence-led-forecast-entry)
- 2026-09-02 — Driver-Based DCF (v1): a second forecast-entry mode alongside Quick DCF,
  building the annual UFCF schedule from revenue → margin → tax → D&A → CapEx → ΔNWC drivers,
  both modes feeding one shared valuation core. Committed `62badf0`, CI run #22 green, deployed
  and production-verified — [decisions.md](docs/decisions.md#driver-based-dcf-v1)
- 2026-09-02 — Cross-company stale-input fix: sourced fields now always replace or clear, so a
  field the newly loaded company lacks can never keep the previous company's figure. Committed
  `449156d`, CI green, deployed — [decisions.md](docs/decisions.md#cross-company-stale-input-fix-base-year-ufcf-net-debt-diluted-shares-base-year-revenue)
- 2026-09-02 — Deployment polish: DCF is the default module, opportunistic backend warm-up,
  real page metadata and social preview, README screenshots. Committed `d1659b5`/`862a9b8`.
- 2026-09-02 — Explain This Valuation: up to three deterministic observations synthesized from
  figures already computed; no engine or methodology change. Committed `6d7404c` —
  [decisions.md](docs/decisions.md#explain-this-valuation)
- 2026-09-02 — Reverse DCF (price-implied FCF growth): solves for the constant explicit-period
  growth rate that reconciles the dated reference price, never framed as a market forecast —
  [decisions.md](docs/decisions.md#reverse-dcf-price-implied-fcf-growth)
- 2026-09-01 — Costco demo-entry consolidation and one-run case tabs —
  [decisions.md](docs/decisions.md#dcf-demo-entry-consolidation-and-the-one-run-three-tab-case-model)
- 2026-09-01 — AGENTS.md: keeps Codex strictly read-only and advisory as an external consultant.
- 2026-09-01 — Source Details inspector: bounded, friendly-first provenance detail —
  [decisions.md](docs/decisions.md#source-details-inspector-bounded-friendly-first-provenance-detail)
- 2026-08-31 — Historical trend mini-charts (Revenue, Unlevered FCF), library-free —
  [decisions.md](docs/decisions.md#historical-trend-mini-charts)
- 2026-08-31 — Embedded, provider-independent Costco DCF demo; Costco validated as the demo
  candidate against the live production API —
  [decisions.md](docs/decisions.md#revised-dcf-sequence-data-resilience-combined-provenanceprice-milestone-and-a-validated-real-company-demo)
- 2026-08-31 — Per-value provenance and an editable, dated reference share price —
  [decisions.md](docs/decisions.md#per-value-provenance-and-reference-price-disclosure)
- 2026-08-31 — DCF data resilience: Alpha Vantage became optional field-level enrichment
  rather than a hard dependency — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Next Actions

1. **Commit and deploy Driver-Based DCF v2**, then production-verify: one Driver-Based
   valuation with a seeded schedule against the production backend, and the Costco Base Growth
   case still returning $395.69 through the Quick DCF path.
2. Driver-Based follow-ups now in [`docs/ROADMAP.md`](docs/ROADMAP.md)'s Later column, in
   rough priority order: **driver sensitivity (tornado)** — the current grid is WACC × terminal
   growth only, so Driver mode's own drivers get no sensitivity treatment at all; then the
   two-way Growth × Margin table.
3. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Rejected / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log
