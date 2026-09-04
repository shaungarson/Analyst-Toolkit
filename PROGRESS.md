# Analyst Toolkit — Progress

**Last verified:** 2026-09-04 (Base-year representativeness — committed `740b940`, CI run #45
green, deployed and production-verified). 265 backend and 316 frontend tests green, lint and
production build clean.

Production verification, for reference: **KO cautioned** ($9.27B working-capital investment,
"History spans 436.7pp against an aggregate of -96.6%"), its −42.44% CAGR shown with the
**unstable**-tier qualification, and Explain This Valuation reduced to the analyst-case clause
alone. **MSFT cautioned** ($12.92B investment, sign-change reason). **Costco demo cautioned** with
a **$1.75B release** — the sign handled correctly in both directions on real data. **NVDA not
cautioned**, CAGR unqualified, and its price-implied-growth-versus-historical comparison (50.9%
vs 50.5%) correctly retained.

## Current Milestone

**None in progress.** Base-year representativeness is complete, deployed and
production-verified (see Recently Shipped).

## Blockers / Frozen Areas

- **Real estate is frozen** — no further changes until the user validates underwriting
  conventions with a CRE professional. See [docs/decisions.md#real-estate-freeze-pending-professional-validation](docs/decisions.md#real-estate-freeze-pending-professional-validation).

## Recently Shipped

- 2026-09-04 — **Base-year representativeness in Quick DCF.** The bounded product-readiness
  review was meant to rank the next feature and found a defect on the default path instead: Quick
  DCF seeded Base Year UFCF from the latest reported year, unnormalized and badged `SOURCED`, with
  no signal about whether that year was typical. Live on the deployed app, **Coca-Cola returned
  $6.65/share, a −90.5% implied downside, and 87.9%/yr price-implied growth**, with the
  sensitivity grid, PV composition, bridge and Explain This Valuation all rendered confidently
  around it — while KO's $9.27B ΔNWC sat displayed two panels above, unremarked. Nothing in the
  engine was wrong; the workspace never said whether the starting figure was usable.

  **The fix reuses Driver mode's own working-capital verdict rather than inventing a second
  statistic** — Driver mode already applied medians, reliability grading and outright refusal to
  the same company, same data, same session. One trigger, two surfaces: a caution beside Base
  Year UFCF naming the latest ΔNWC as a working-capital **investment** or **release** plus the
  engine's stated reason, and a qualification on the historical UFCF CAGR that also stops Explain
  This Valuation using it as a benchmark (the analyst-case clause, which does not depend on
  working-capital history, is kept). **`SOURCED` is untouched** — provenance and representativeness
  are different axes — but the caution is gated on the field still holding its sourced value.

  **Three corrections landed during scoping, all before implementation:** median-of-five UFCF
  dollars is not the normalized truth and differences against it are not "errors"; a scale-aware
  benchmark (median UFCF margin × latest revenue) was tested and **rejected** — it would assert
  $87B against Microsoft's $35B actual during a disclosed capex regime change; and inferring a
  working-capital artifact from UFCF-vs-revenue CAGR divergence was dropped as a heuristic dressed
  as evidence. **No normalized value ships.** The trigger is a proxy that under-fires by design,
  stated as such in the module. Live verification caught the one real defect — the suppression
  flag was never wired into the `explainValuation` call, which the unit tests could not see. The
  CAGR qualification is **tier-aware** — `unstable`, `thin` and `insufficient` each say what they
  mean rather than all being called "unreliable", which was accurate for only one of the three —
  and both the caution and the suppression key off the non-`ok` verdict itself rather than off
  that copy, so an unrecognised future tier still withholds the benchmark. Committed `740b940`,
  CI run #45 green, deployed and production-verified (see Last verified above) —
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

1. **DCF Professional Summary** — the readiness review's top-ranked item of the six considered,
   and the one structural gap against real estate, which has `RealEstateDealSummary.jsx` while DCF
   has no equivalent. Deliberately sequenced after base-year representativeness: a summary makes a
   valuation shareable, and shipping one first would have propagated the defect rather than
   contained it. The summary can now carry a representativeness statement worth printing.
2. **Then reassess further DCF work.** The readiness review ranked the remaining candidates:
   historical loss-year effective tax rate (5 tickers), terminal-year normalization (methodology
   sophistication rather than workflow improvement), another data-coverage milestone (diminishing).
   Scenario/case management was found to be **already built** — save, load, duplicate, compare,
   driver schedules included, Quick/Driver mixing guarded.
3. **Alpha Vantage — retest on a later date.** Still no `market_data_provider` and no
   `reference_price` as of 2026-09-04, while SEC fundamentals resolve normally. Reference-price
   features were evaluated with a manually entered dated price and behaved correctly, so this is a
   data-source outage rather than a product-design question.
4. Out of scope from the coverage work, each needing its own decision: extension-tag ingestion
   (the only route to Microsoft's and Tesla's own D&A lines, and to Alphabet's and Tesla's
   coverage), **historical loss-year effective tax rate** (AMZN, T, MU, BA, INTC FY2024) —
   distinct from forecast NOL carryforwards in `docs/ROADMAP.md`'s Later list — restricted-cash /
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
