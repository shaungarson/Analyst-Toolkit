# Modeling Conventions

Current, accepted financial methodology for both modules. This describes *what the model
does today*, not how it got here — see [`decisions.md`](decisions.md) for reasoning,
alternatives considered, and superseded approaches.

Every calculation named here is a pure, independently tested function — see
`backend/app/calculations/` and `docs/ARCHITECTURE.md`.

## Real Estate Underwriting

- **Debt amortization:** monthly-pay, monthly-compounding (standard commercial-mortgage
  convention), rolled up into annual schedule rows for display.
- **Loan maturity:** modeled separately from the amortization period (e.g. a 5-year term on a
  30-year amortization schedule). Hard-validated to be at least as long as the hold period —
  the engine never computes cash flows using financing that would have contractually expired.
  Refinancing, extensions, and balloon payoffs beyond the original term are not modeled.
- **NOI growth:** one flat annual rate from Year 2 onward; Year 1 is the unescalated going-in
  NOI (consistent with what "going-in cap rate" means).
- **Acquisition/disposition costs:** flat percentages — added to required equity and deducted
  from sale proceeds, respectively.
- **Exit valuation:** capitalizes NOI one year past the end of the hold period (what a buyer
  is actually purchasing), not the flat going-in figure.
- **DSCR:** NOI ÷ annual debt service, computed per year; becomes undefined once the loan is
  fully amortized.
- **Debt yield:** going-in NOI ÷ original loan amount, a Day-1-only figure, matching standard
  lender convention (not computed per year).
- **Risk flags:** deterministic and rule-based only — low Year-1 DSCR (vs. a named reference
  threshold, not a universal lender rule), exit cap-rate compression (directional, no
  magnitude threshold), capital-loss exposure across the sensitivity grid (% of tested cells
  with equity multiple below 1.0x). No composite or scored "risk rating."
- **Sensitivity grid:** IRR across exit cap rate × hold period, fixed deltas around the base
  case (not user-configurable).

## DCF Valuation

- **Terminal value:** Gordon Growth (perpetuity growth) method; WACC and terminal growth are
  direct inputs, not built up from components.
- **Terminal growth validation:** hard-blocked only for genuine Gordon Growth invalidity —
  WACC must exceed terminal growth, and terminal growth can't fall low enough that the
  underlying perpetuity stops converging
  (`|(1 + terminal_growth_rate) / (1 + WACC)| < 1`, implemented as
  `gordon_growth_converges()`). A narrow WACC/terminal-growth spread, or terminal growth at
  or below −100%, surfaces as an explanatory warning rather than a block.
- **Explicit-period FCF growth:** no fixed ceiling or floor. At or below −100% the result is
  computed and flagged with a specific warning (exactly −100%: every forecast year becomes
  $0; below it: projected cash flow alternates sign each year). Only a genuine computational
  failure — overflow, or a non-finite headline result — is rejected outright, via
  `NonFiniteResultError`, mapped to a clean 422 rather than a server failure.
  See `CLAUDE.md`'s Financial Validation section for the general principle this
  implements.
- **Discounting:** end-of-year convention throughout (not mid-year).
- **Explicit forecast — two modes:** **Quick DCF** projects one flat annual FCF growth rate
  from a base year (unchanged). **Driver-Based DCF** builds the same annual UFCF schedule
  year-by-year from revenue → margin → tax → D&A → CapEx → ΔNWC drivers instead — see its own
  subsection below. Both modes hand their resulting schedule to the same shared valuation
  core (discounting, terminal value, enterprise/equity value, value per share); there is
  exactly one place that math is implemented, not two.
- **Unlevered FCF (sourced company data):**
  `EBIT × (1 − effective tax rate) + D&A − CapEx − change in NWC` — the standard
  enterprise-value-DCF construction, not an operating-cash-flow shortcut. Any missing input
  makes the result undefined rather than silently treating it as zero.
  - **Effective tax rate** = income tax expense ÷ pretax income; undefined when pretax income
    isn't positive.
  - **Net working capital** = (current assets − cash and short-term investments) −
    (current liabilities − current portion of debt).
- **Cash (sourced data):** cash and cash equivalents plus short-term investments, summed —
  see `decisions.md`'s SEC financial-field conventions record for why this combined meaning
  is preserved.
- **Debt (sourced data):** sum of recognized, non-overlapping, interest-bearing components
  (including finance leases; never operating leases).
- **Per-value provenance (sourced data):** every historical field carries a status —
  `reported` (one direct SEC fact), `combined` (summed from more than one SEC fact),
  `calculated` (derived by formula from other resolved fields, e.g. effective tax rate, ΔNWC,
  net debt, UFCF, revenue growth, operating margin — no single underlying fact), or
  `fallback` (SEC data could not be confidently mapped for the field, so Alpha Vantage
  supplied it instead — never labeled `reported`) — plus filing metadata (tag, period, form,
  filed date, accession number, source link) where applicable, inspectable on demand for both
  the latest period and any older period in the history table. See `decisions.md`'s
  per-value provenance record for the full vocabulary and why `combined`/`calculated` are
  kept distinct.
- **Reference price:** an explicit, dated, editable input — not a live quote. Sourced from
  Alpha Vantage's quote endpoint when available (`Sourced`); an edited sourced value becomes
  `Adjusted`; with no quote available, manual entry gets `Analyst Input`. A saved scenario
  persists enough of the original sourced value/date/ticker to restore the correct status on
  reload — a scenario saved before this existed reads `Analyst Input`, since there's nothing
  to restore. Every company load clears a previous company's price/date rather than letting
  it survive into a load whose own quote came back empty.
- **Implied Upside/Downside:** `(implied value per share ÷ reference price) − 1`, shown only
  when a valid, positive reference price *and* a nonblank "as of" date both exist (sourced or
  manually entered) — deterministic arithmetic, never a buy/sell/attractive framing. A fixed
  disclaimer sentence accompanies the comparison wherever it's shown.
- **Sensitivity grid:** value per share across WACC × terminal growth, fixed deltas around
  the base case; cells outside Gordon Growth's convergence domain are `null`, not computed.
- **Reverse DCF (price-implied FCF growth):** solves for the single constant explicit-period
  FCF growth rate that reconciles a given reference price, holding every other input (base
  year UFCF, forecast period, WACC, terminal growth, net debt, diluted shares) fixed — a
  numerical inverse of the same shared, unrounded valuation core `run_dcf` itself uses
  (`_compute_dcf`), never a second implementation of the formula. Reported strictly as *the
  constant annual growth rate required to reconcile the dated reference price under the
  model's current assumptions* — never framed as a market forecast, an analyst prediction,
  or an objective "correct" growth rate.
  - **Solver domain:** `g > -1`. On this domain every projected cash flow is strictly
    increasing in `g`, so `value_per_share` is too, guaranteeing a unique root for bisection
    to find. This is a reverse-solver *uniqueness* requirement, not a new restriction on
    manually entered forward growth assumptions — those remain governed only by the
    explicit-period FCF growth convention above (no fixed ceiling or floor).
  - **Three outcomes, never collapsed into one generic failure:** `solved` (a unique growth
    rate found within the solver's price tolerance); `target_below_floor` (the target price
    is at or below the mathematical floor `-net_debt / diluted_shares_outstanding` — the
    limit of `value_per_share` as `g → -1+`, never attained — a closed-form fact checked
    before any search, not a search failure); `not_bracketed` (the numerical search itself
    couldn't complete within computational limits — bracketing never found a bound, or
    bisection exhausted its step budget without ever landing within tolerance — an honest
    computational limit, never a fabricated "solved" result and never an economic ceiling on
    growth).
  - **Invalidation:** reads base year UFCF, forecast period, WACC, terminal growth, net
    debt, and diluted shares — all shared with the forward valuation — plus the reference
    price itself (which the forward valuation never reads). It does not read the analyst's
    own FCF growth assumption, since it produces a growth rate rather than consuming one.
    The reference price's "as of" date affects neither calculation numerically; it only
    controls whether a usable reference price currently exists and what date displays
    beside it.
  - **Historical comparison:** shown alongside the solved rate as historical unlevered FCF
    CAGR (endpoint CAGR over the real elapsed fiscal-date span between the oldest and newest
    available periods, not a periods-count approximation), with revenue CAGR as secondary
    context only — never presented as equivalent to FCF growth. Unavailable (shown as such,
    never a misleading number) when either endpoint is missing, zero, or negative, or when
    the endpoints leave no positive elapsed time between them.
- **Explain This Valuation:** up to three deterministic observations over already-computed
  outputs — no change to the valuation engine or methodology, only presentation-level
  differences, ratios, and ranges. Price-implied growth vs. the analyst's case and historical
  UFCF CAGR is reported as an exact signed percentage-point difference, never a qualitative
  band; when the difference rounds to 0.0 at the displayed one-decimal precision, it is
  reported as matching that figure rather than as a signed "above"/"below" difference, so the
  wording never implies a direction the displayed number doesn't actually show. Terminal
  value's share of enterprise value (`pv_terminal_value / enterprise_value`) is
  stated only as a proportion, never a sensitivity claim; omitted when enterprise value is
  non-positive/non-finite or the ratio falls outside `[0, 1]`. Sensitivity range is downside
  (`base − gridMin`) and upside (`gridMax − base`) relative to the base-case value per share,
  shown as dollars and, only when that base value is a usable positive reference, percent —
  no severity label at any threshold. Each observation gates independently on the same
  current-ness its own inputs already track (forward vs. reverse), never a combined check.

### Driver-Based DCF (v1)

A second forecast-entry mode alongside Quick DCF, not a replacement — both build an annual
UFCF schedule that feeds the exact same shared valuation core (discounting, terminal value,
enterprise/equity value, value per share; see `backend/app/calculations/dcf.py`'s
`_compute_dcf_core`). Costco's embedded demo, its Low/Base/High tabs, and Reverse DCF all
remain Quick DCF-only — see below.

- **Per-year formulas**, for forecast year *t* given Base Year Revenue (year 0) and that
  year's driver inputs:
  ```
  revenue_t   = revenue_{t-1} × (1 + revenue_growth_rate_t)
  ebit_t      = revenue_t × ebit_margin_t
  cash_taxes_t = max(ebit_t, 0) × tax_rate_t
  nopat_t     = ebit_t − cash_taxes_t
  da_t        = revenue_t × da_pct_of_revenue_t
  capex_t     = revenue_t × capex_pct_of_revenue_t
  delta_nwc_t = nwc_investment_pct_of_revenue_change_t × (revenue_t − revenue_{t-1})
  ufcf_t      = nopat_t + da_t − capex_t − delta_nwc_t
  ```
- **Cash tax / no NOL carryforward:** `max(EBIT, 0) × tax_rate` — a loss year owes no cash
  tax, but earns no offsetting benefit against a later profitable year either. This
  understates value for a name with a near-term loss followed by a rebound; a real, disclosed
  limitation, not a hidden simplification. Deferred: modeling actual NOL carryforwards.
- **ΔNWC convention:** `nwc_investment_pct_of_revenue_change × (revenue_t − revenue_{t-1})` —
  a fraction of the year-over-year dollar *change* in revenue, matching the sourced "Δ NWC"
  historical field shown in Sourced Historical Data (itself already a flow, the period's
  change in net working capital — never the balance-sheet NWC figure the Unlevered FCF
  formula above is built from). Never a balance-sheet ratio.
- **No hard economic bounds** on any driver value beyond what the arithmetic itself requires
  to stay finite (none of the formulas above divide by a driver value, so none has a
  structural floor or ceiling) — same Financial Validation Principle as Quick DCF's FCF
  growth rate. A tax rate outside 0%–100%, a negative D&A or CapEx percentage, a non-positive
  Base Year Revenue, a forecast year whose revenue comes out zero or negative, and a final
  forecast year whose UFCF is zero or negative (see **Terminal year** below) all stay
  computable and surface as `driver_warnings` (id/tier/year/explanation) instead of being
  blocked. Completeness is a separate question from plausibility, and is enforced across every
  value sent to the API — Base Year Revenue, all six drivers in every forecast year, WACC,
  Terminal Growth Rate, Net Debt, and Diluted Shares Outstanding. A *blank* input is a missing
  assumption, not a zero one, so Run Valuation and scenario comparison both reject an
  incomplete set with a message naming the missing fields and make no valuation request; the
  payload builder enforces the same invariant itself rather than relying on each caller's
  pre-check. This matters most for the shared assumptions, where a silently coerced zero is a
  value the backend accepts as entirely valid (0% terminal growth, $0 net debt) and would
  therefore produce a confident, wrong valuation rather than an error. A genuinely entered zero
  is always a valid assumption, and whether it is *computationally* acceptable remains the
  backend's decision. Revenue hitting exactly zero in some year is a permanent lock — flagged once, at
  the year it first happens, since every later year is a mechanical consequence (any finite
  growth rate times zero is still zero), not a new event. Revenue going negative is a
  one-year event whose sign in later years depends entirely on their own growth rates —
  deliberately *not* described as "alternating," unlike Quick DCF's single exponentiated
  rate: each driver year has its own independent rate, so no alternating pattern is
  guaranteed the way it is for a flat rate raised to successive powers.
- **Base Year Revenue** is a sourced, adjustable field (Sourced/Adjusted/Analyst Input,
  identical mechanism to Base Year UFCF) — pulled from the loaded company's latest period
  `revenue`, blanked with no badge (never a leftover figure) when that company doesn't have
  one, via the same `companyDataToSourcedFields` helper the cross-company stale-input fix
  established.
- **"Last Actual" reference row (superseded in v2 by the per-driver evidence row below,
  which shows every usable observation rather than the latest pair):** what the two most
  recent sourced periods imply for each
  driver, shown for context only, never sent to the API and never itself a forecast input.
  Every cell is independently guarded — a missing required value or a zero/non-finite
  denominator (e.g. zero prior revenue, zero Δ Revenue) renders `n/a` for that cell alone,
  never a fabricated number, `Infinity`, or `NaN`. The tax row is labeled neutrally as **Tax
  Rate**, not "Cash Tax Rate": its Last Actual cell is the *book* effective rate
  (income tax expense ÷ pre-tax income), while the forecast rate is used as a cash-tax proxy
  on positive EBIT. Applying an effective rate to EBIT is standard UFCF practice, but the two
  are different measures — on a company with meaningful net interest expense the book rate
  over pre-tax income exceeds the same expense over EBIT — so the UI says so directly rather
  than letting a "Cash" label sit beside a book figure.
- **Sensitivity grid:** identical WACC × terminal growth grid and convergence-domain nulling
  as Quick DCF's, holding the entire driver schedule fixed.
- **Reverse DCF: Quick DCF-only.** A multi-driver forecast has no single scalar to solve a
  reference price against; Driver mode shows explanatory copy instead of attempting one.
- **Explain This Valuation:** only the terminal-value-share and sensitivity-range
  observations apply (both read generic `enterprise_value`/`pv_terminal_value`/
  `value_per_share`/sensitivity-grid fields `DriverDCFResults` shares with `DCFResults`, so
  neither needed a Driver-specific code path). The price-implied-growth-comparison
  observation is Reverse-DCF-dependent and never appears in Driver mode.
- **Scenarios:** a `forecastMode` discriminator (`'quick'` default) is saved alongside the
  rest of a scenario's inputs; a scenario saved before Driver mode existed has no such key
  and loads as Quick DCF. Scenario comparison is limited to scenarios sharing one forecast
  mode in v1 — a mixed selection shows an explanatory message instead of a table.
- **Terminal year:** uses the schedule's own final explicit year as-is, with no adjustment
  toward a sustainable steady-state margin or reinvestment level. This is a known
  simplification, not a claim that any particular convergence (e.g. D&A approaching CapEx)
  is the "correct" terminal assumption — sustainable terminal margins and reinvestment
  economics remain a genuinely open modeling question, deferred rather than papered over.
  One consequence is surfaced explicitly rather than left implicit: if that final year's UFCF
  is zero or negative, Gordon Growth produces a zero or negative terminal value, often a
  negative enterprise value with it, and a sensitivity grid that can read backwards. The two
  axes are not equally affected, and the distinction matters when reading the grid: with a
  negative final-year UFCF (and terminal growth above −100%) value per share **always** falls
  as terminal growth rises — the reverse of normal — because a more negative terminal value is
  being discounted. The WACC axis only inverts once that terminal value dominates the explicit
  period's own positive present values; where the final year is only slightly negative, WACC
  still behaves normally. A final year of exactly zero is a third case again: terminal value is
  zero, so the grid is flat along the growth axis and normal along WACC. All of this is
  computationally fine and none of it is blocked; it raises an `extreme`-tier
  `non_positive_terminal_year_fcf` warning asking the analyst to verify the terminal-year
  economics, worded to say direction *may* become counterintuitive rather than asserting it
  always does.
- **Not in v1:** live-ticker Low/Base/High case management (Costco's predetermined tabs are
  unaffected and stay Quick DCF-only) — a saved driver scenario's `data` shape is already
  what a future "copy Base into edited Low/High cases" workflow would clone, so no engine or
  schema redesign is expected to be needed for it later.

### Driver-Based DCF: historical evidence and forecast initialization (v2)

The engine, the per-year formulas, the warning tiers, and the completeness rules above are
unchanged. What follows governs only how a schedule is *built* — where a starting value comes
from, how it is labeled, and when the app refuses to produce one. Nothing here computes cash
flows: the backend's `project_driver_years` remains the sole implementation of the projection
arithmetic, and no part of it is reproduced in the frontend.

- **Evidence shown per driver, not one "Last Actual" cell.** Each driver row shows every
  usable annual observation from the sourced periods plus one normalized reference statistic.
  Level ratios (EBIT margin, tax, D&A, CapEx) get up to five observations from five periods;
  the two that need a prior year (revenue growth, NWC investment) get up to four. Deliberately
  **no standard deviations, confidence intervals, or regression statistics** — at most five
  observations these would assert a precision the history cannot support.

- **Reference statistic per driver.** Median for revenue growth, EBIT margin, tax rate, D&A
  and CapEx — robust to a single acquisition, COVID, or restructuring year in a five-year
  window in a way a mean is not. **Aggregate** (ΣΔNWC ÷ ΣΔRevenue over the window) for NWC
  investment, because it is a ratio of two flows: aggregating numerator and denominator
  weights each year by how much revenue actually moved, so a small-Δ year cannot dominate. On
  the Costco snapshot the candidates diverge materially — −3.26% aggregate, −5.25% median,
  −8.41% latest year — which is why the choice is stated here rather than left implicit.

- **Per-observation exclusions**, each recorded with its reason rather than silently shrinking
  the sample: revenue not positive; the numerator not reported; a negative reported CapEx (a
  filer-side sign anomaly — excluded and named, never sign-flipped into a plausible-looking
  positive); an effective tax rate the backend already resolved as undefined (pre-tax income
  not positive); a non-finite ratio; and, for NWC investment only, a year whose revenue moved
  by less than **2% of prior revenue**. That materiality floor generalizes v1's zero-denominator
  guard: a 0.1% revenue move produces a finite but meaningless ratio, so guarding only against
  an exact zero was not enough.

- **Refusal rules — the app declines to seed rather than producing a weak number.**
  - Fewer than two usable observations: never seeded. A single year is not a run rate, and
    this project's own review found copying the latest observation across to be the
    worst-performing of the candidate rules.
  - Exactly two usable observations: seeded, but the row is flagged **Thin history**.
  - NWC investment additionally refuses on a **compromised denominator**, checked *before* the
    ratios are looked at, because a denominator problem makes the aggregate itself meaningless
    and complaining about dispersion would describe the wrong fault. Two conditions: the annual
    revenue changes must not **reverse direction**, and the net cumulative change must be at
    least **90% of the gross annual movements**. The per-year 2% materiality floor does not
    cover this — it screens each year individually, and two individually material years can
    still nearly cancel. Worked example: revenue +1000 with +100 of working capital (10.00%)
    followed by −990 with −80 (8.08%) gives two ordinary, same-signed ratios only 1.9pp apart,
    so the spread test passes comfortably — yet the sums are 20 over 10, a **200% aggregate**.
    AT&T is the live case: FY2022 revenue −$13.3B and FY2025 +$3.3B leave a net of −$10.0B
    against $16.6B gross (60%), and the pre-check aggregate would have been **764%**. In both
    cases **no reference statistic is reported at all** — an inflated aggregate is not evidence
    of anything, and displaying one invites exactly the copy-across the refusal prevents. The
    annual observations are still shown. The second condition is implied by the first whenever
    the check runs (same-signed deltas make |Σ| equal Σ|·| exactly, so the ratio is 1.0); it is
    enforced rather than assumed so the guarantee does not rest on the sign test's own
    implementation. A consistently *falling* revenue window is not refused — direction must
    reverse, not merely be negative; refusing every declining company would be an economic
    judgement rather than a denominator fact.
  - NWC investment also refuses on **ratio instability** once the denominator is sound: the
    observations changing sign (working capital both consumed and released as revenue grew), or
    a spread exceeding twice the aggregate's own magnitude. Costco fails both (14.4pp spread
    against a −3.26% aggregate) and is refused; its CapEx spans 0.29pp against 1.83% and is
    not. Apple's is worse still (−42.20 / −20.95 / −312.39 / +71.79) and is likewise refused.
  - A refused row is left **completely blank** — never backfilled with the latest observation
    and never with zero — with the reason stated on the row and the observations still shown.
    The existing completeness guard then blocks Run Valuation until the analyst fills it in,
    so no new blocking logic was needed.

- **Initialize Forecast is explicit and reviewable.** It never runs automatically, on company
  load or otherwise. Clicking it shows a plan naming each value it will write and the basis
  for it ("CapEx 1.83% — median of 5 observations, FYE 2021–2025") together with what it will
  refuse and why; only then does it write anything. Applied values are badged **Seeded** and
  described as historical-derived starting points, not forecasts produced or endorsed by the
  application; the badge clears the moment the analyst edits that row.

- **A driver schedule survives only a same-company reload.** A successful company load clears
  all six driver rows across every forecast year and resets their modes and seed markers,
  unless the company already on screen is *positively identified* as the same normalized
  ticker. Preserving is the exception, not the default: two ordinary paths leave a populated
  schedule with no company identified — loading a saved scenario (which restores `driverForm`
  while clearing `companyData`) and a failed ticker lookup (which clears `companyData` and
  leaves the schedule) — and in both, the next successful load would otherwise adopt values
  built for another company, or for none, as assumptions about the new one. Resetting an
  unidentified schedule can discard driver values entered before any company was loaded; that
  trade is accepted deliberately, because a figure valued against the wrong company is worse
  than re-entering assumptions, and the reset is visible where the stale value was not.

  When it fires, the reset clears every row rather than only those still badged as seeded,
  because per-row seed tracking is not sound enough to do it selectively: a Fade row can hold a historically seeded Year 1 value and an
  analyst-chosen final-year target simultaneously, and editing either endpoint clears the row's
  marker — so the *other* endpoint, still derived from the previous company's history, would
  survive the next ticker load unbadged. That is the cross-company stale-input bug recurring at
  cell granularity. Per-cell provenance would also fix it but is materially worse for the job:
  it doubles the state the schedule carries and has to survive resizes, mode switches, fade
  regeneration and scenario round-trips, each a place a marker can desynchronize from the value
  it describes — and the failure mode when it does is a stale figure presented as the analyst's
  own. Scope is deliberately narrow: only the company-specific driver schedule resets. Shared
  assumptions (WACC, terminal growth, forecast period, net debt, diluted shares) are analyst
  judgement that carries across companies and are untouched, as are saved scenarios.
  Re-loading the *same* identified ticker resets nothing — the evidence is unchanged, so the
  schedule built against it is still valid.

- **Tax rate: the book/cash distinction is preserved, and disclosed where it matters most.**
  The historical evidence remains the *book* effective rate (income tax expense ÷ pre-tax
  income); the forecast rate remains a *cash-tax proxy* applied to positive EBIT with no NOL
  carryforward. Seeding carries the median book rate across, which is standard UFCF practice,
  and adds one targeted disclosure: when the latest period's pre-tax income differs from EBIT
  by more than 10% (material net interest), the row states that the book rate is a weaker
  proxy for tax on EBIT there. A disclosure, never a substitution — the app has no jurisdiction
  data, and inventing a statutory rate would be exactly the silent economic judgement the
  Financial Validation Principle warns against. Costco's gap is ~4%, so a normal company gets
  no warning it does not need.

- **Row forecasting modes are UI generators, not model state.** Flat writes one value to every
  year; Fade linearly interpolates `v_t = v_1 + (v_N − v_1) × (t−1)/(N−1)` between a Year 1
  value and a final-year target; Custom exposes the per-year grid. All three write into the
  same `driverYears` array the API has always received, so the payload, completeness checks,
  warnings, scenario save/load, and CSV export are unchanged. Interpolation is **linear in the
  driver value** — deliberately not exponential or S-curved, which would add modeling surface
  without adding analyst judgement. A one-year forecast is a degenerate fade and yields the
  start value alone.
  - Mode switches are immediate and predictable, so a mode never displays one number while the
    schedule holds another: → Custom changes no values (and does not count as an analyst edit),
    → Flat broadcasts year 1, → Fade keeps the existing first and last values as endpoints and
    straightens the middle. A row whose endpoints are still blank is left blank rather than
    filled.
  - **Forecast-length changes** regenerate Flat and Fade rows at the new length, using the
    endpoints as they were *before* the resize, so a fade target survives a change in either
    direction instead of being flattened into a plateau. Custom rows keep the existing
    behaviour exactly (earlier years untouched; the last year cloned into new trailing years),
    which is what preserves manual overrides.

- **Revenue growth initializes in Fade mode with both endpoints at the historical reference.**
  That puts the row in the shape a real forecast usually takes without inventing a terminal
  target the history does not contain. Every other driver initializes Flat, because margins,
  capital intensity and tax rates mean-revert rather than trend by default; fading them would
  assert a view the evidence does not support.

- **Terminal growth is never bound to revenue growth.** A clearly labeled, optional
  **"Use terminal growth as target"** action copies the Terminal Growth Rate into revenue
  growth's final-year fade target **once**. There is no live binding in either direction:
  afterwards, editing terminal growth does not move the schedule, and editing the schedule does
  not move terminal growth. Terminal growth is perpetual *FCF* growth and is not required to
  equal a terminal-year *revenue* growth rate; the action exists because the two are often
  related in an analyst's thinking, not because the model requires them to agree.

- **Forecast column labels.** Real fiscal-year estimate labels (`FY2027E`) are used only when
  the sourced fiscal year-end is unambiguous — a year-end in **June through December**, where
  the calendar year the fiscal year ends in and the filer's own fiscal-year label agree
  essentially universally. Fiscal years ending January through May fall back to generic
  `Year 1…N`: two large retailers with near-identical January year-ends label the same fiscal
  year differently from one another, and a wrong fiscal-year label is worse than a generic one.
  No company loaded, no periods, or an unparseable date also falls back. When FY labels are in
  use the panel states the basis ("Fiscal years ending August").

- **Relationship to Quick DCF, stated precisely.** Under ordinary positive-revenue assumptions,
  holding all six driver ratios flat makes every UFCF component proportional to revenue
  (ΔNWC_t = nwc% × revenue_t × g/(1+g)), so UFCF_t = revenue_0 × (1+g)^t × K — a geometric
  schedule, the same *shape* Quick DCF's single flat growth rate produces. It is **not**
  necessarily the same valuation: Driver mode derives a normalized cash-flow level from revenue
  and operating ratios, while Quick DCF begins from a sourced base-year UFCF, so the two differ
  by that level even where the shape coincides. This is why Fade — not Flat — is the
  initialization default for revenue growth, and it is stated in the panel's own methodology
  disclosure rather than left for the analyst to discover.

- **Every material note is rendered, and excluded periods are named.** A driver's note is shown
  whenever it is non-null, not only when the history is otherwise unreliable: the tax
  cash-proxy caution is company-specific and fires on histories that are perfectly reliable, so
  gating notes on reliability hid the one disclosure most likely to change an analyst's mind
  about a seeded rate. AT&T is the live case — four usable tax observations, a reliable 19.89%
  median, and a 12% pre-tax-versus-EBIT divergence that now says so. Each row also reports how
  many periods were excluded from its statistic and why (AT&T: one period where the effective
  rate is undefined; five where CapEx is not reported at all; two below the NWC materiality
  floor, with the actual revenue movements quoted). Silently shrinking a sample makes a thin
  reference look better evidenced than it is.

- **Observations carry visible fiscal-year labels.** Each value is shown under a two-digit
  fiscal-year-end label (’21…’25), matching the year strip the historical trend mini-charts
  already use. Not a tooltip: a hover-only label is unreadable on touch, unreachable by
  keyboard, and absent from print — and a column of undated percentages is not evidence.

- **The panel carries no step number.** The numbered sequence belongs to the three analytical
  columns (Sourced Historical Data, Assumptions, Valuation Summary). Numbering this full-width
  panel as well produced a duplicated "2" and a visible 2 → 1 → 2 → 3 reading order, since it
  renders above the column badged "1". It is a workspace for step 2's forecast inputs rather
  than a step of its own.

- **Instructional density.** The panel carries one orientation line on screen; the tax,
  working-capital, and Quick-DCF-relationship methodology sits behind a disclosure control.
  The full text stays in the DOM and prints unconditionally via the existing `.no-screen`
  pattern, so a printed or exported analysis always carries the complete methodology regardless
  of on-screen expand state.

## Shared conventions

- **Scenario comparison** recalculates every scenario from its saved *inputs* at view time,
  never from a stored past result — so a comparison always reflects the model's current
  methodology, and a scenario whose saved inputs no longer validate surfaces as a visible
  per-scenario error.
- **Scenario naming** (e.g. "Base," "Downside," "Upside") is a free-text convention, not a
  schema field or enum.
- **Worked examples:** where real-world data is used (the real estate example, 100 Symes
  Road, Toronto), only independently verified facts are presented as sourced; every other
  input is clearly labeled illustrative.
