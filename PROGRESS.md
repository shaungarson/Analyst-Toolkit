# Analyst Toolkit — Progress

**Last verified:** 2026-09-04 (SEC data-integrity milestone — committed `bcb649f`, CI run #38
green, deployed and production-verified). 249 backend and 293 frontend tests green, lint and
production build clean.

Production verification, for reference: **J&J's latest period is now 2025-12-28, was
2014-12-28** — and its unlevered FCF is 0/5, which is the correct outcome: honest refusal on
current periods instead of confident answers built on eleven-year-old data. PepsiCo, Home Depot
and NVIDIA moved 0/5 → 5/5 on the CapEx fallback; Amazon and AT&T reach 4/5, the fifth year
blocked by a loss-year tax rate that is deliberately out of scope; Costco unchanged at 5/5 as the
control. Figures match the local SEC-only measurements exactly.

## Current Milestone

**Analysis Outputs: progressive disclosure — built and locally verified, not yet committed or
deployed.** Presentation only, DCF Sensitivity & Bridge tab. The tab-level "How to read this"
legend is gone (it explained three different outputs at once and pointed at the wrong one
first); each output now carries a concise caption, and the two charts with real methodology
behind them carry their own inline "How to read this" disclosure, collapsed by default. Roughly
600 words of always-visible prose became ~150, with two controls where there were two before.
Result-specific warnings stay visible in every state — that is the invariant, and it is what
the new component tests pin. No engine, endpoint, payload, geometry or computed value changed —
[decisions.md](docs/decisions.md#analysis-outputs-progressive-disclosure-and-where-warnings-live)

Remaining: commit, deploy, production verification. Print behaviour was checked by emulating
`@media print` in the CSSOM at paper width (toggles hidden, both regions expanded, headings
intact); real pagination is unverified.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-09-04 — **SEC period discovery: silent staleness, and a verified CapEx fallback.** Found by
  a bounded data-layer readiness review that was meant to choose the next *modelling* milestone
  and found a data-integrity defect instead. Period discovery anchored on a single tag,
  `OperatingIncomeLoss`, justified in its own docstring as present for every company in a
  three-company validation sample. **Johnson & Johnson stopped tagging it after FY2014**, so
  discovery walked back eleven years and the app served **FY2014 financials as J&J's latest
  period** — `reported` provenance, no warning, every downstream figure derived from it. Missing
  data already refused honestly; this *substituted* silently, the failure mode `CLAUDE.md` §6
  names as recurring. Discovery now anchors on the **union** of the revenue and EBIT tag sets
  (PepsiCo resolves through EBIT with no mapped revenue tag, so both are needed), with a
  contiguity cut and a wholesale-staleness check. Stale periods are **dropped, not flagged**: the
  wrong year's data is not an assumption an analyst can weigh. The first attempt filtered every
  period against the newest, which would have discarded the legitimate multi-year history every
  chart is built from — Costco collapsed from five periods to two, and the control fixture that
  existed to catch exactly that caught it. `PaymentsToAcquireProductiveAssets` added to
  `_CAPEX_TAGS` after verifying real company facts (six of seventeen report no
  `PaymentsToAcquirePropertyPlantAndEquipment` fact at all); `PaymentsForRepurchaseOfCommonStock`,
  `PaymentsToAcquireBusinesses*` and `PaymentsToAcquireMarketableSecurities` deliberately **not**
  added despite matching the same pattern at full coverage. Ford verified and left unfixed —
  segment-dimensioned debt, structural rather than a mapping defect, pinned by a test. Coverage
  reported separately from methodology limits: complete SEC-only coverage went **3 → 6** of the
  basket (the valid-current baseline was 3, not 4 — J&J's apparent 5/5 was FY2010–FY2014 data),
  with every remaining blocker an out-of-scope methodology question. Four focused fixtures cut
  from real filings, **40 KB** against ~65 MB for the full basket; no network-dependent CI tests.
  Committed `bcb649f`, CI run #38 green, deployed and production-verified (see Last verified
  above) —
  [decisions.md](docs/decisions.md#sec-period-discovery-silent-staleness-and-a-verified-capex-fallback)
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
- 2026-09-03 — **Driver-Based DCF, v1 through the ±1pp tornado.** Evidence-led forecast entry
  (v2), the provider-independent Costco Driver Base Case, inline guidance for unstable NWC
  assumptions, and the standardized ±1pp driver sensitivity. Each has its own record in
  [decisions.md](docs/decisions.md) and [MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md).

Older entries (2026-08-31 → 2026-09-02) moved out of current state — see
[docs/decisions.md](docs/decisions.md) and
[docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md).

## Next Actions

1. **Operational follow-up, not a milestone — Alpha Vantage retest.** AV was returning
   `RateLimitedError` throughout the readiness review and at the time this milestone closed. Very
   likely exhausted by the review's own 15-ticker probe (~75 requests against a 25/day free cap,
   at 5 requests per uncached ticker), but the pre-probe baseline was never established. **It may
   stay rate-limited for another day or two**, so this is deliberately not gating any milestone.
   When it clears: load ≤4 uncached tickers and record `source.market_data_provider` and
   `profile.reference_price` for each. If AV is unhealthy for a reason other than the probe, that
   is its own finding — with no AV there is no reference price for any live ticker, which
   silently removes Implied Upside/Downside and Reverse DCF, and it is the fallback whose absence
   turned several SEC mapping gaps into total UFCF failures during the review.
2. **Resume the paused DCF product-readiness review** using real-company archetypes. It was
   paused when the pre-flight found the data layer could only load the archetype it was validated
   on; complete SEC-only coverage is now 6 of 17 rather than 3, so more archetypes are reachable.
   The modelling questions it was meant to rank are unchanged: scenario workflow, terminal-year
   normalization, NOL handling, a professional summary artifact, or no further DCF feature.
3. Out of scope from the coverage review, each needing its own decision: D&A component summation
   (TSLA, GOOGL, MSFT, INTC), restricted-cash treatment (PG), derived EBIT (JNJ),
   segment-dimensioned debt (F), loss-year tax treatment (AMZN, T, MU, BA).
4. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Rejected / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/UI_AUDIT.md](docs/UI_AUDIT.md) — measured UI findings and the agreed phase plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log
