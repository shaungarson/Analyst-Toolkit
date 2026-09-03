# Analyst Toolkit — Progress

**Last verified:** 2026-09-03 (Driver-Based DCF v2 — evidence-led forecast entry, including a
six-item closeout correction pass). Committed as `9d06901`, CI run #24 green, **deployed to
Vercel and Render and production-verified**. Backend 190 tests unchanged and passing (no
backend file touched); frontend 169 tests, lint and production build clean.

Production verification against the live app and real SEC data: COST loaded from SEC EDGAR with
per-driver evidence showing visible fiscal-year labels and medians, FY2026E–FY2030E column
labels on a "Fiscal years ending August" basis, and no step badge on the panel; Initialize
Forecast's plan naming all five seeds with their bases and refusing working capital by reason,
then applying them (revenue growth Fade, the rest Flat, NWC left blank); Fade interpolating
7.46 → 6.22 → 4.98 → 3.74 → 2.5 with exact endpoints; Custom revealing and preserving a
hand-edited interior year while clearing that row's Seeded badge; Flat writing one value to
every year; the one-time terminal-growth target proving independent (changing Terminal Growth
to 1.25% left the schedule at 2.5%); one Driver-Based valuation returning $190.66/share on
$76.79B enterprise value with its sensitivity grid; a saved Driver scenario loaded with no
company identified, then AAPL loaded — all 30 driver cells cleared with no scenario value
surviving, modes reset to Custom, badges gone, shared assumptions and the saved scenario itself
intact; and Quick DCF's Costco Base Growth case still returning **$395.69**. Browser console
clean throughout.

## Current Milestone

**Costco demo: a provider-independent Driver Base Case — complete and verified locally, not
yet committed.** The Costco demo is no longer Quick DCF-only: activating it now populates a
complete, deterministic five-year Driver Base Case (computed from the same frozen snapshot and
the same `driverHistory()`/`buildBaseForecast()` pipeline Initialize Forecast uses) alongside
the unchanged Quick-mode Low/Base/High presets, and the analyst can switch Quick ↔ Driver with
the demo loaded either way. NWC Investment is force-set to an explicit `-3.0% Flat` demo
assumption rather than seeded (Costco's own working-capital history is `unstable` and correctly
refused, same as it would be for a live ticker) and stays unbadged, distinct from the five
historically-seeded rows. No engine, methodology, or backend change. Full design and
verification record: [`docs/decisions.md#costco-demo-a-provider-independent-driver-base-case`](docs/decisions.md);
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
  backend projection. Committed `9d06901`, CI run #24 green, deployed and production-verified
  (see Last Verified above) — [decisions.md](docs/decisions.md#driver-based-dcf-v2-evidence-led-forecast-entry)
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

1. Driver-Based follow-ups in [`docs/ROADMAP.md`](docs/ROADMAP.md)'s Later column, in rough
   priority order: **driver sensitivity (tornado)** — the current grid is WACC × terminal growth
   only, so Driver mode's own drivers get no sensitivity treatment at all; then the two-way
   Growth × Margin table.
2. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Rejected / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log
