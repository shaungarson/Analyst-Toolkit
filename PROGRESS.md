# Analyst Toolkit — Progress

**Last verified:** 2026-09-03 (unstable-NWC guidance popover, then Costco demo extended to
Driver-Based DCF). Committed as `31bc1fc` and `7e4c21c`, CI run #26 green, **deployed to
Vercel and Render and production-verified**. Backend unchanged and healthy (no backend file
touched by either commit); frontend 198 tests, lint and production build clean.

Production verification against the live app: the Costco demo activated from Quick DCF with the
network log showing no `/api/company/COST` request; Quick DCF's Base Growth case returning
**$395.69/share**; switching to Driver-Based without reloading the company showing the complete
five-year Driver Base Case (Revenue Growth Fade 7.46 → 6.22 → 4.98 → 3.74 → 2.5%; EBIT Margin,
Tax Rate, D&A and CapEx Flat at 3.43% / 24.55% / 0.88% / 1.83%, all five badged Seeded; NWC
Investment Flat at **-3%**, unbadged, with its own Unstable badge still visible; WACC 7.5%,
terminal growth 2.5%, five forecast years); Run Valuation returning **$263.25/share** on
**$109.08B** enterprise value and **$117.09B** equity value; switching Quick ↔ Driver preserving
each mode's own preset and results without mixing; and the interactive Unstable badge's popover
opening with the full guidance text, closing via its own close button, Escape, and an outside
click, and returning keyboard focus to the trigger every time. Browser console clean throughout.

## Current Milestone

**None in progress.** The Costco demo's Driver Base Case (see below) is complete, committed,
deployed, and production-verified. The engine, warning tiers, completeness rules and shared
valuation core are untouched — every change is input-side. Full design and verification record:
[`docs/decisions.md#costco-demo-a-provider-independent-driver-base-case`](docs/decisions.md);
methodology: [`docs/MODELING_CONVENTIONS.md`](docs/MODELING_CONVENTIONS.md).

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-09-03 — **Costco demo: a provider-independent Driver Base Case.** Reverses v1's
  Quick-only restriction — the demo now populates a complete, deterministic five-year Driver
  Base Case (revenue growth Fade to the shared terminal growth rate; EBIT margin, tax, D&A and
  CapEx Flat at their historical medians, all badged Seeded) alongside the unchanged Quick-mode
  Low/Base/High presets, computed from the same frozen snapshot via the same
  `driverHistory()`/`buildBaseForecast()` pipeline Initialize Forecast uses for any company. NWC
  Investment is force-set to an explicit `-3.0% Flat` demo assumption rather than seeded, since
  Costco's own working-capital history is correctly refused as unstable, and stays unbadged with
  its own Unstable badge still visible. Leaving the demo via a live company load now resets the
  driver schedule even when the ticker matches. No engine, methodology, or backend change.
  Committed `7e4c21c`, CI run #26 green, deployed and production-verified (see Last Verified
  above) — [decisions.md](docs/decisions.md#costco-demo-a-provider-independent-driver-base-case)
- 2026-09-03 — **Guidance for unstable NWC assumptions.** The NWC Investment row's Unstable
  badge is now an accessible popover trigger (not just plain text) explaining what the refusal
  means and how to proceed — a normalized assumption, 0% if none is defensible, sensitivity-tested
  both directions. Opens on click or keyboard activation; closes via its own close button,
  Escape, or an outside click, with focus returned to the trigger every time. No change to
  instability rules, seeding logic, or forecast behavior. Committed `31bc1fc`, CI run #26 green,
  deployed and production-verified (see Last Verified above).
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
