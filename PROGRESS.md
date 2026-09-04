# Analyst Toolkit — Progress

**Last verified:** 2026-09-04 (two-way Revenue Growth × EBIT Margin driver-interaction grid,
verified against the running app on a fresh backend). 236 backend and 252 frontend tests green,
lint and production build clean. Costco Driver Base Case renders with the centre cell equal to
the base case ($263.25/share); all four inner cells match the tornado exactly ($248.94 / $278.22
on revenue growth, $156.04 / $370.47 on EBIT margin); 320px and 375px show all 25 cells with no
horizontal page overflow, the table scrolling inside its own container; a forced 3.0% flat
margin marks the whole −2pp column with numbered footnotes, warning-level copy in the aggregate
and per-cell years in the accessible text; print rules present and in scope; no console errors.
Supplementary fetches add ~117 ms of wall clock after the headline valuation is already
installed — not material, so the three requests stay sequential.

**Deployment and production verification are still outstanding.**

## Current Milestone

**Driver-Based DCF: two-way Revenue Growth × EBIT Margin sensitivity — code complete, pending
live verification.** A 5 × 5 grid of value per share over uniform ±1pp parallel shifts
(−2pp…+2pp) applied to both drivers together, twenty-five `run_driver_dcf` calls behind `POST
/api/dcf/driver-growth-margin`, rendered between the tornado and the WACC × terminal-growth
grid in Driver mode.

Scope, design and the four corrections applied before implementation are recorded in
[`decisions.md`](docs/decisions.md#driver-based-dcf-two-way-revenue-growth--ebit-margin-sensitivity)
and [`MODELING_CONVENTIONS.md`](docs/MODELING_CONVENTIONS.md).

**Remaining:** deploy, verify in production, then close the milestone documentation.

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
Older entries (2026-08-31 → 2026-09-02: DCF data resilience, per-value provenance and the
dated reference price, the embedded Costco demo, historical trend mini-charts, reverse DCF,
Explain This Valuation, Driver-Based DCF v1, and the cross-company stale-input fix) have
moved out of current state — each has its own record in
[docs/decisions.md](docs/decisions.md), with the full chronological log in
[docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md).

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Rejected / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/UI_AUDIT.md](docs/UI_AUDIT.md) — measured UI findings and the agreed phase plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log
