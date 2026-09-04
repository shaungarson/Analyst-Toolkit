# Analyst Toolkit — Progress

**Last verified:** 2026-09-04 (SEC D&A component summation — local verification complete;
not yet committed, deployed or production-verified). 265 backend and 293 frontend tests green,
lint and production build clean.

Component reconstructions were validated against the filers' own cash flow statements across
**every** relevant year, not the latest alone: **Intel exact in all five**, **Microsoft within
±5% and two-sided** (+1.2%, −4.9%, −4.6%, −2.6%, +1.0%) against a line that also carries a
non-D&A "other" bucket and was itself restated between filings. **Alphabet and Tesla are
refused** — see below. All thirteen combined-tag filers re-checked and unchanged.

## Current Milestone

**SEC D&A component summation — code complete after a material correction, awaiting deploy
verification.** Implemented, tested and live-verified locally. Scope limited to D&A normalization
by instruction: no extension-tag ingestion, NOL handling, cash mapping, derived EBIT or DCF
Professional Summary.

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-09-04 — **SEC D&A: component summation for filers with no combined tag.** Four basket
  filers — MSFT, GOOGL, TSLA, INTC — report **no** combined cash-flow D&A tag at any period, so
  D&A and therefore unlevered FCF were `None` for all five years. A combined fact is now always
  preferred (**a correctness rule, not ordering**: where both exist, components do not reproduce
  it — Ford 0.49×, Amazon 0.65×, Home Depot 1.16×), and only a period without one falls back to
  an explicit two-component sum with **both components required in every period**, gated at
  filer level.

  **Two admitted, two refused — and the refusals are the substance.** A first version made
  amortization *optional* and returned depreciation-only figures for Alphabet and Tesla. That was
  wrong and was corrected before commit. "Optional" is arithmetically identical to **assuming
  zero** for a filer that does not tag the concept — the same silent-substitution failure mode as
  the J&J staleness defect, reached by a different route. Alphabet reports
  `AmortizationOfIntangibleAssets` **only on 10-Qs**, never annually, while its 10-Ks disclose
  accumulated amortization of finite-lived intangibles: it *has* amortization, so its
  depreciation line is not its D&A and the "exact match" supported only that line. Tesla's
  residual was attributed to impairment; its filing reports **no material impairments**, and the
  gap is **systematic** — −18.2%, −23.2%, −28.6%, −35.4%, −32.6% across FY2025–FY2021 — including
  the single year it tags both components. Both now return `None`.

  **Validating only the latest year is what let that through**; all displayed years are now
  checked, which is also what exposed Microsoft's deviation as **two-sided**, not conservative —
  its latest component sum *exceeds* its filed aggregate, and Microsoft restated that line
  between filings (FY2025 34,153 → 29,433).

  **The fallback is an explicit allowlist keyed by SEC CIK, not a rule the module infers.** A
  second correction replaced a structural completeness gate that would have admitted *any*
  unexamined filer tagging both components — necessary but not sufficient evidence, and a live
  ticker cannot be reconciled after the app has already served its number. A filer is added only
  after hand reconciliation against its own filed statements in every displayed year: currently
  **MSFT and INTC**. Resolution is per period, so a gap in the extra period fetched solely for
  the prior-year NWC balance cannot erase D&A from the five displayed years — a defect the
  window-based gate had, now pinned by a test. Slots stay explicit, never a name pattern: finance-lease ROU amortization (**a verified 15%
  double-count at Microsoft**), financing-cost amortization, securities amortized cost,
  forward-looking future-amortization disclosures, and an Intel OCI **pension** line matching
  only on "unamortized" — on a filer the gate admits. Measured, not projected: **complete 6 → 7**
  (+MSFT), partial 4 → 5 (+INTC at 1/5), none 7 → 5. Five fixtures cut from real filings, 51 KB;
  no network-dependent CI tests —
  [decisions.md](docs/decisions.md#sec-da-component-summation-for-filers-with-no-combined-tag)

- 2026-09-04 — **Analysis Outputs: progressive disclosure.** Presentation only, DCF Sensitivity
  & Bridge tab. The tab-level "How to read this" legend is gone (it explained three different
  outputs at once and pointed at the wrong one first); each output now carries a concise
  caption, and the two charts with real methodology behind them carry their own inline "How to
  read this" disclosure, collapsed by default. Roughly 600 words of always-visible prose became
  ~150, with two controls where there were two before. Result-specific warnings stay visible in
  every state — that is the invariant, and it is what the new component tests pin. No engine,
  endpoint, payload, geometry or computed value changed. Print behaviour was checked by
  emulating `@media print` in the CSSOM at paper width (toggles hidden, both regions expanded,
  headings intact); real pagination remains unverified. Committed `b8aeb02`, deployed and
  production-verified (Costco driver demo on the deployed build: both disclosures collapsed, the
  D&A caution chip visible, $263.25/share matching local) —
  [decisions.md](docs/decisions.md#analysis-outputs-progressive-disclosure-and-where-warnings-live)
- 2026-09-04 — **SEC period discovery: silent staleness, and a verified CapEx fallback.** Period
  discovery anchored on a single tag, `OperatingIncomeLoss`; Johnson & Johnson stopped tagging it
  after FY2014, so the app served **FY2014 financials as J&J's latest period** with `reported`
  provenance and no warning — a silent substitution, the failure mode `CLAUDE.md` §6 names as
  recurring. Discovery now anchors on the **union** of the revenue and EBIT tag sets with a
  contiguity cut and a wholesale-staleness check, and stale periods are dropped rather than
  flagged. `PaymentsToAcquireProductiveAssets` added to `_CAPEX_TAGS` after verifying real company
  facts. Ford verified and deliberately left unfixed (segment-dimensioned debt). Complete SEC-only
  coverage went **3 → 6** of the basket. Committed `bcb649f`, CI run #38 green, deployed and
  production-verified —
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

1. **Deploy and verify SEC D&A component summation in production.** Commit, push, confirm CI, then
   load MSFT, GOOGL, TSLA and INTC against the deployed API. Expected: **MSFT** five SEC-sourced
   D&A years and a complete unlevered-FCF series; **INTC** five D&A years but still 1/5 UFCF;
   **GOOGL and TSLA** no D&A and 0/5, which is the corrected, intended refusal — not a
   regression.
2. **Resume the paused DCF product-readiness review** using real-company archetypes, once the
   above is verified. It was paused when the pre-flight found the data layer could only load the
   archetype it was validated on; complete SEC-only coverage is now **7** of 17 rather than 3, so
   materially more archetypes are reachable. The modelling questions it was meant to rank are
   unchanged: scenario workflow, terminal-year normalization, NOL handling, a professional summary
   artifact, or no further DCF feature.
3. **Alpha Vantage — retest on a later date.** Retested 2026-09-04 against production with four
   uncached tickers: still no `market_data_provider` and no `reference_price`, while SEC
   fundamentals resolved normally. That retest fell on the *same day* as the 15-ticker probe that
   most likely exhausted the 25/day cap, so it neither confirms nor refutes quota exhaustion.
   Gates nothing, but with no AV there is no reference price for any live ticker, which removes
   Implied Upside/Downside and Reverse DCF outside the Costco demo.
4. Out of scope from the coverage work, each needing its own decision: extension-tag ingestion
   (the only route to Microsoft's and Tesla's own D&A lines), loss-year tax treatment
   (AMZN, T, MU, BA, INTC FY2024), restricted-cash / short-term-investment mapping (PG, INTC
   FY2021–23), derived EBIT (JNJ), segment-dimensioned debt (F).
5. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Rejected / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/UI_AUDIT.md](docs/UI_AUDIT.md) — measured UI findings and the agreed phase plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log
