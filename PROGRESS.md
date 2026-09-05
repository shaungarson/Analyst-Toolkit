# Analyst Toolkit — Progress

**Last verified:** 2026-09-05 (DCF Professional Summary — committed `ec64be5`, CI run #47 green,
deployed and production-verified). 265 backend and 341 frontend tests green, lint and production
build clean.

Production verification covered every path: **Quick demo** — "Base Growth case" label and the
analyst comparison ("22.7 percentage points above the 8.00%/yr assumption in this valuation"),
with the historical CAGR correctly withheld since Costco's working-capital history is unstable.
**Driver demo** — no Quick case label, no Base Year UFCF qualification, no CAGR qualification, no
price-implied growth, and the multi-driver note present; $263.25 matching local. **Live KO in both
modes**, with no provider price available: the reference-price block, implied upside/downside and
price-implied growth are all absent and the artifact degrades cleanly to value-per-share plus the
bridge line. **Print paths under real print media**: Print Full Analysis excludes the summary
(panel `display: none`, 6 pages of analysis); Print Summary while collapsed prints the complete
artifact alone on **one page at Letter and A4** (panel `block`, analysis hidden).

**No production-only findings.** Production matched local verification in every case.

## Current Milestone

**None in progress.** The DCF Professional Summary is complete, deployed and production-verified
(see Recently Shipped).

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-09-04 — **DCF Professional Summary.** The one structural gap against real estate, which has
  had a deal summary and a one-page print path since its own milestone. A compact, print-optimized
  decision artifact — identity, conclusion, principal assumptions, qualifications, tested
  sensitivity range, provenance — served by **one component for both forecast modes**, which the
  near-identical result payloads make natural (they differ only in `fcf_growth_warnings` vs
  `driver_warnings`). Collapsed preview by default with View/Hide Summary, Print Summary and Print
  Full Analysis; it stays **mounted** while collapsed, so `aria-controls` resolves and Print
  Summary works without expanding it first.

  **Driver mode shows reference price, as-of date and implied upside/downside only.** A proposal
  to bracket the price on the Revenue Growth × EBIT Margin grid was rejected on review: that
  surface varies **two of six** drivers, so bracketing a price on it would describe those two
  while silently holding four fixed. Driver mode says instead that a multi-driver forecast has no
  single rate to solve against. Driver paths report **start, end and range** rather than "Custom
  (5 years)", derived from actual values rather than the row-mode label. Sensitivity extrema come
  from **valid cells only** and are labelled a tested range, never a confidence interval. Warnings
  are never filtered or capped and use the app's real tiers; the per-year chip was dropped after
  reviewing real output, since every driver explanation already opens with "Year N…".

  **Review found four defects after a first "verified" report**, all fixed: ordinary Print Full
  Analysis was including the collapsed summary (`.no-screen` is force-shown in `@media print` and
  the panel had no ordinary-print exclusion — my check had tested DOM presence *without* print
  media, which proved nothing); base-year representativeness and the historical CAGR qualification
  rendered in Driver mode, which starts from revenue and never uses Base Year UFCF; the Quick
  demo case label printed on Driver summaries; and the solved price-implied growth never named the
  analyst's own FCF growth assumption, which is always relevant even when the historical CAGR is
  withheld as unreliable.

  **Real print-to-PDF is what made this correct.** Verified with headless Chrome's own print
  pipeline rather than emulating `@media print` in the CSSOM — the method earlier print work used,
  and the reason `UI_AUDIT.md` had left print untracked. It found what emulation could not: the
  artifact measured 933px against 960px of usable Letter height and still printed on two pages,
  because `.feature-page`'s padding and the panel's margin survived into print. Both were the same
  cause — workspace.css is imported *after* print.css, so equal-specificity print overrides lose
  the tie — fixed with `body`-scoped selectors, not `!important`. An earlier measurement had also
  understated height by measuring at screen width instead of the 7.5in printed column. Nothing was
  truncated and no type shrunk; the ~84px recovered came from page chrome and spacing —
  [decisions.md](docs/decisions.md#dcf-professional-summary)

- 2026-09-04 — **Base-year representativeness in Quick DCF.** The readiness review found a defect
  on the default path: Quick DCF seeded Base Year UFCF from the latest reported year with no signal
  about whether it was typical, and **Coca-Cola returned $6.65/share with a −90.5% implied
  downside**. The fix reuses Driver mode's existing working-capital verdict: a caution naming the
  latest ΔNWC as an **investment** or **release** plus the engine's own reason, and a tier-aware
  qualification on the historical UFCF CAGR that also stops Explain This Valuation using it as a
  benchmark. `SOURCED` untouched; the caution clears once the analyst edits the field; no
  normalized value offered. Flags COST, KO and MSFT; correctly silent on NVDA. Committed `740b940`,
  CI run #45 green, deployed and production-verified —
  [decisions.md](docs/decisions.md#base-year-representativeness-in-quick-dcf)
- 2026-09-04 — **SEC D&A: component summation for filers with no combined tag.** Four basket
  filers — MSFT, GOOGL, TSLA, INTC — report **no** combined cash-flow D&A tag at any period, so
  D&A and therefore unlevered FCF were `None` for all five years. A combined fact is now always
  preferred (**a correctness rule, not ordering**: where both exist, components do not reproduce
  it — Ford 0.49×, Amazon 0.65×, Home Depot 1.16×), and only a period without one falls back to a
  two-component sum available solely to filers on an **explicit allowlist keyed by SEC CIK**,
  added after hand reconciliation against their own filed statements in every displayed year —
  currently MSFT and INTC. **Alphabet and Tesla were examined and refused**, and two earlier
  drafts were corrected before commit: the first made amortization *optional* (arithmetically
  identical to assuming zero), the second admitted any filer tagging both components on
  structural evidence its own docs called insufficient. Measured coverage: **complete 6 → 7**,
  partial 4 → 5, none 7 → 5. Committed `1338e38`, CI run #43 green, deployed and
  production-verified —
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

1. **Reassess further DCF work** — the readiness review's remaining candidates, in its ranking:
   historical loss-year effective tax rate (5 tickers), terminal-year normalization (methodology
   sophistication rather than workflow improvement), another data-coverage milestone (diminishing).
   Scenario/case management was found **already built**.
2. **Scenario identity (small, surfaced by the summary milestone).** The app restores a saved
   scenario's *data* but not its name, which is why the Professional Summary can label the Costco
   demo case but not a saved scenario. Worth its own decision if named scenarios should stay
   identifiable after load.
3. **Alpha Vantage — retest on a later date.** Still no `market_data_provider` and no
   `reference_price` as of 2026-09-05, while SEC fundamentals resolve normally. Confirmed again
   during this milestone's production verification: with no provider price, both modes degrade
   cleanly. A data-source outage, not a product-design question.
4. Out of scope from the coverage work, each needing its own decision: extension-tag ingestion,
   **historical loss-year effective tax rate** (AMZN, T, MU, BA, INTC FY2024) — distinct from
   forecast NOL carryforwards in `docs/ROADMAP.md`'s Later list — restricted-cash /
   short-term-investment mapping (PG, INTC FY2021–23), derived EBIT (JNJ), segment-dimensioned
   debt (F).
5. Real estate: no action planned until the user has the CRE-professional conversation.

## See Also

- [docs/ROADMAP.md](docs/ROADMAP.md) — Now / Next / Later / Rejected / Parked
- [docs/decisions.md](docs/decisions.md) — durable decision history
- [docs/UI_AUDIT.md](docs/UI_AUDIT.md) — measured UI findings and the agreed phase plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current technical state
- [docs/MODELING_CONVENTIONS.md](docs/MODELING_CONVENTIONS.md) — current financial methodology
- [docs/archive/PROGRESS_HISTORY.md](docs/archive/PROGRESS_HISTORY.md) — full pre-restructuring implementation log
