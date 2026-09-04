# Analyst Toolkit — Progress

**Last verified:** 2026-09-04 (SEC data-integrity milestone — implemented, 249 backend and 279
frontend tests green, lint and production build clean). **Not yet deployed or
production-verified**, and the bounded Alpha Vantage retest is still outstanding.

## Current Milestone

**SEC period discovery: silent staleness and a verified CapEx fallback — code complete, pending
Alpha Vantage retest, deployment and production verification.**

Found by a bounded data-layer readiness review that was meant to pick the next *modelling*
milestone. It found a data-integrity defect instead: period discovery anchored on
`OperatingIncomeLoss` alone, and **Johnson & Johnson stopped tagging it after FY2014**, so the app
served **FY2014 financials as J&J's latest period** with `reported` provenance and no warning.
Full record:
[`decisions.md`](docs/decisions.md#sec-period-discovery-silent-staleness-and-a-verified-capex-fallback).

**Remaining:** bounded Alpha Vantage retest after the daily reset, deploy, verify production,
then close.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-09-04 — **DCF traceability: history→forecast continuity and enterprise-value composition.**
  One milestone framed around a single outcome — history → forecast → present value → enterprise
  value — rather than around the bar geometry the two charts share. Both frontend-only against
  figures the valuation response already returns; no engine, endpoint or payload change.
  *Continuity* puts reported actuals and the forecast on one axis with a hard labelled break,
  **nominal on both sides** because the question is whether the forecast continues the history.
  Unlevered FCF in both modes (the only metric existing on both sides in both), Revenue in Driver
  mode; each gates independently on **one** reported observation plus one forecast value, not the
  two-period minimum the trend charts apply — that threshold belongs to a trend, a handoff needs
  only a point to hand off from. *Composition* sits directly above the Value Bridge, which begins
  at Enterprise Value as a given: two readings on two scales, and the aggregate is a **signed
  axis, not a clamped 100% stack**, so a −18% / 118% case stays geometrically honest rather than
  being clipped or rescaled. The aggregate explicit contribution uses `enterprise_value −
  pv_terminal_value`, so the two reconcile to exactly 100% despite independent per-row rounding.
  Terminal value's contribution became **one rule across the app**, superseding Explain This
  Valuation's previous suppression of any share outside 0–100% — which hid precisely the case the
  chart exists to surface. Values are visible text in a value strip, not only an `aria-label`;
  that requirement surfaced the one real defect, a 19-of-20 label collision at 320px, fixed and
  re-measured at zero. Geometry extraction stayed narrow: four pure functions into
  `barGeometry.js`, still no charting layer and no library. Committed `c6b637d`, CI run #36 green,
  deployed and production-verified (see Last verified above) —
  [decisions.md](docs/decisions.md#dcf-traceability-history-to-forecast-continuity-and-pv-composition)
- 2026-09-04 — **Driver-Based DCF: two-way Revenue Growth × EBIT Margin sensitivity.** The first
  surface showing two drivers *interacting* — the tornado moves one at a time and so cannot say
  whether growth creates or destroys value, which depends on the margin and reinvestment the
  same schedule carries. A 5 × 5 grid over uniform ±1pp parallel shifts (−2pp…+2pp) applied to
  both drivers together in every forecast year, behind `POST /api/dcf/driver-growth-margin`.
  **Twenty-five** `run_driver_dcf` calls: the centre cell *is* the base case and reuses that run,
  which also leaves it one possible origin — the same reason the base is computed in the
  endpoint rather than supplied by the client. Neither axis is presented with an assumed
  direction, and that is the load-bearing decision: on an ordinary reinvestment-heavy forecast
  the direction reverses **inside one grid** (at −2pp margin, growth from −2pp to +2pp moves
  value $2.32 → $1.40; at +2pp margin the same shifts move it $13.16 → $13.99). Exactly four
  cells overlap the tornado and are asserted equal to it. Reuse over abstraction throughout: the
  two-driver shift composes `_shift_driver`, per-cell warnings reuse `new_endpoint_warnings`,
  tinting reuses the WACC grid's own classes, and the only new shared frontend export is a
  one-line rate formatter — with a second chart built, that is what proved reusable, not a
  charting layer. Warnings a cell introduces carry **numbered footnotes** identifying which
  warning; the aggregate carries warning-level copy, because the engine writes explanations per
  cell naming that cell's own years and figures. No monotonicity test on the growth axis —
  encoding "more growth is worth more" would assert a belief the engine correctly refuses to
  hold. Sequencing was contested against a charts-first proposal and settled on the roadmap's
  side; six factual corrections were applied across two review rounds. No change to the
  valuation engine, existing payloads, or any other surface. Committed `671324c`, CI run #34
  green, deployed and production-verified (see Last verified above) —
  [decisions.md](docs/decisions.md#driver-based-dcf-two-way-revenue-growth--ebit-margin-sensitivity)
- 2026-09-03/04 — **UI audit, Phases 1–3 shipped and Phase 4 closed unbuilt.** Dark-only
  interface with a split accent token, Driver Schedule evidence hierarchy and inline NWC
  guidance, and a stacked mobile Driver Schedule; the type-scale/focus phase was reassessed on
  the deployed build and deliberately not built. Full measured findings and per-phase records:
  [UI_AUDIT.md](docs/UI_AUDIT.md) · [decisions.md](docs/decisions.md)
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

## Next Actions

1. **Finish this milestone:** bounded Alpha Vantage retest (≤4 uncached tickers, recording
   `source.market_data_provider`), deploy, production-verify, close.
2. **Then resume the paused DCF product-readiness review** using real-company archetypes. It was
   paused when the pre-flight found the data layer could only load the archetype it was validated
   on. Re-run it once coverage is known-good; the modelling questions it was meant to rank —
   scenario workflow, terminal-year normalization, NOL handling, a professional summary artifact,
   or no further DCF feature — are unchanged.
3. Out of scope and each needing its own decision, from the coverage review: D&A component
   summation (TSLA, GOOGL, MSFT, INTC), restricted-cash treatment (PG), derived EBIT (JNJ),
   segment-dimensioned debt (F), loss-year tax treatment (AMZN, T, MU, BA).
4. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Rejected / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/UI_AUDIT.md](docs/UI_AUDIT.md) — measured UI findings and the agreed phase plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log
