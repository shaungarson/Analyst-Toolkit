# Analyst Toolkit — Progress

**Last verified:** 2026-09-04 (UI audit closed — Phase 4 reassessed and deliberately not built).
Documentation-only change; no code touched, so no deployment verification was needed. The last
code milestone, UI audit Phase 3, remains committed, CI green, deployed and production-verified
(see Recently Shipped).

Phase 3's production verification, for reference: at **320px and 375px** with a **15-year Custom**
forecast, all **90 forecast inputs fully visible and focusable**, every editable field **16px /
44px**, the three-segment mode control fitting, and **no horizontal page overflow**; the
breakpoint exact at 719px/720px with the desktop table unchanged; both the Costco and NWC
disclosures collapsing and expanding correctly.

## Current Milestone

**None in progress.** The UI-audit milestone is complete and closed
([`docs/UI_AUDIT.md`](docs/UI_AUDIT.md)). Phases 1–3 shipped and were production-verified;
Phase 4 was reassessed against the audit's materiality standard and **closed unbuilt** — the
remaining type-scale inconsistency is a maintenance concern with no material usability or
credibility effect, and keyboard focus is already functional, visible and sufficiently
contrasted (measured 7.53:1). A small set of typography tokens may be adopted **opportunistically**
when a component is changed for a higher-value reason; a token migration is **not** scheduled.

Print remains **out of scope** for the audit and untracked; the existing Print controls and
README wording are deliberately untouched.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-09-04 — **UI audit closed; Phase 4 deliberately not built.** Reassessed by re-measuring
  the deployed build: the type scale is genuinely unchanged (23 distinct sizes, 51 nodes under
  12px, since Phases 1–3 were scoped not to touch it) but immaterial — nothing below 12px carries
  a number, contrast failures are at zero, and every editable mobile field is 16px. Keyboard focus
  measured at **7.53:1**, above the 3:1 non-text requirement. A broad refactor would touch nearly
  every component and risk regressions in a theme with zero contrast failures, to fix a
  maintenance concern with no user-facing symptom. Documentation-only —
  [decisions.md](docs/decisions.md#ui-audit-closed-phase-4-type-scale-and-focus-styling-deliberately-not-built)
- 2026-09-03 — **UI audit Phase 3: stacked Driver Schedule below 720px.** Driver-Based DCF was
  unusable on a phone: the table was 956px in a 285px container with the Driver column pinned
  `sticky` at 224px, leaving 61px for inputs 88px wide — **1 of 7 inputs reachable**, and none at
  the default scroll position. Below 720px the table now renders as one panel per driver, as a
  **CSS presentation switch over the same markup, handlers and state** — no second layout
  component, no `matchMedia` branch, nothing duplicated to drift. A `<tbody>` per driver keeps
  each driver's row and note row in one panel; `data-year` on each forecast cell renders the
  fiscal year through `::before` without duplicating the input. Editable fields are **16px** (the
  floor below which iOS zooms the page on focus) and **44px** tall, as is the Flat/Fade/Custom
  control. The Costco disclosure collapses behind "Demo data and assumptions" on mobile only —
  with no unscoped collapse rule, so widening can never strand the content. **All 90 inputs
  visible and focusable at 320px and 375px with a 15-year forecast, no horizontal overflow,
  desktop unchanged.** No calculation, payload, or state-model change —
  [decisions.md](docs/decisions.md#stacked-driver-schedule-below-720px) ·
  [UI_AUDIT.md](docs/UI_AUDIT.md)
- 2026-09-03 — **UI audit Phase 2: Driver Schedule evidence hierarchy and inline NWC guidance.**
  The evidence cell previously rendered as one undifferentiated run
  (`’22 3.48 ’23 -10.87 … agg -3.26%UNSTABLE`), where the derived statistic read as another
  observation and the status collided with the figure. It is now two labelled regions —
  **Historical evidence** (full `FY22` labels, 10px → 12.5px) and **Historical benchmark**
  (`Median` / `Aggregate`, retiring `med`/`agg`) — with reliability right-aligned beside the
  benchmark. Two regions rather than two columns because the table already fills its container
  exactly at 1440px; verified against the live DOM that the new strings need **no extra column
  width**. Reliability is now stated on every row including `Reliable`, since a blank meant
  "assessed and fine" and "not assessed" identically. `Unstable` is said once, with **Not used
  as starting point** as its consequence, keyed off `driver.seedable` so it can never
  contradict Initialize Forecast. The floating popover is deleted — the badge is static text and
  the note row became an inline `<button aria-expanded>` disclosure — removing hand-computed
  positioning, a flip-height guess, a document-level listener, manual focus return, and a CSS
  specificity workaround. Visible "Seeded" → **History-informed**; internal `seededFields` /
  `clearSeed` unchanged. No calculation, payload, or state-model change —
  [decisions.md](docs/decisions.md#driver-schedule-evidence-hierarchy-and-inline-nwc-guidance) ·
  [UI_AUDIT.md](docs/UI_AUDIT.md)
- 2026-09-03 — **UI audit Phase 1: dark-only interface, split accent token, semantic
  accessibility.** A contrast sweep of the populated workspace found **15 WCAG AA failures in
  dark mode against 1 in light** — including the Load Company and Costco Demo buttons that begin
  every session, and a sourced value (`$6.45B`). The dark palette was promoted to `:root` and
  both `prefers-color-scheme` blocks removed, so the app is dark-only with no toggle and no
  second palette to keep passing. `--accent` was split by role: `--accent` (`#4a6f92`) for
  surfaces, `--accent-text` (`#6b89a6`) for foreground text — because one token cannot serve
  both, with white-on-accent at 5.28:1 and accent-as-text at 3.12:1. Result: **0 contrast
  failures with every accent surface unchanged.** Semantics: `<main>`, a visually-hidden DCF
  `<h1>` (the workspace has no visible page title by design), `aria-current` on the active
  module, accessible names for all six tables via existing headings, and decorative step
  numerals hidden. No engine, payload, or layout change —
  [decisions.md](docs/decisions.md#dark-only-interface-and-a-split-accent-token) ·
  [UI_AUDIT.md](docs/UI_AUDIT.md)
- 2026-09-03 — **Driver-Based DCF: standardized ±1pp driver sensitivity (tornado).** The first
  sensitivity treatment of Driver mode's own drivers — the existing grid tests WACC × terminal
  growth, neither of which is a driver. `POST /api/dcf/driver-tornado` runs thirteen
  `run_driver_dcf` calls (one base, computed server-side rather than trusted from the client,
  plus six drivers × two directions) applying a ±1pp parallel shift across every forecast year,
  so Fade and Custom rows keep their shape. Ranked by the spread across the base value and both
  endpoints, not the endpoint distance alone — identical when the endpoints straddle base, but
  correct when they don't, which happens for real: NWC investment reverses sign in a
  declining-revenue year, revenue growth reverses against a negative-revenue year, and
  `max(EBIT, 0) × tax_rate` kinks at EBIT = 0. An endpoint whose shift introduces a driver
  warning the base case doesn't already raise is marked with its tier, short name and affected
  years — never clamped or skipped, since substituting a different assumption than the stated
  ±1pp would make the comparison unreliable. Rendered as a real table with a bar column (values
  readable without hover, the table's own semantics carrying accessibility with no duplicated
  summary, no chart library and deliberately no shared charting layer yet). WACC and terminal
  growth excluded as non-drivers, with a neutral pointer to their own grid that claims nothing
  about relative magnitude. Committed `a4430ce`, CI run #28 green, deployed and
  production-verified (see Last verified above) —
  [decisions.md](docs/decisions.md#driver-based-dcf-standardized-1pp-driver-sensitivity-tornado)
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

1. **Next feature, for separate scoping — Driver-Based Revenue Growth × EBIT Margin sensitivity
   table.** It shows the interaction between two major value drivers and complements the existing
   one-variable tornado, which tests drivers only in isolation. The tornado already settled the
   perturbation convention this was waiting on. Not started; scope it before building.
2. Also open in [`docs/ROADMAP.md`](docs/ROADMAP.md)'s Later column: **Quick DCF FCF-growth
   sensitivity**, the one remaining assumption with no sensitivity surface of its own.
3. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Rejected / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/UI_AUDIT.md](docs/UI_AUDIT.md) — measured UI findings and the agreed phase plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log
