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
- **D&A (sourced data):** one combined cash-flow D&A fact where the filer reports one — which
  most do, and which is always preferred. A filer that reports no combined tag is summed from two
  explicit components, depreciation plus amortization of intangible assets, **both required for
  every displayed year** — but only for a filer on an explicit verified list, keyed by SEC CIK,
  whose reconstruction has been reconciled by hand against its own filed cash flow statements in
  every year the app displays. Currently **Microsoft and Intel**. An unknown filer that happens
  to tag both components is **not** summed: structural evidence is necessary but not sufficient,
  and a live ticker cannot be reconciled after the app has already served its number. Where a
  filer is unverified, or a verified filer is missing a component for a displayed year, D&A is
  undefined rather than partially constructed — serving depreciation alone is arithmetically
  identical to asserting the filer's amortization is zero. Finance-lease right-of-use
  amortization, financing-cost and debt-discount amortization, securities amortized cost, and
  forward-looking future-amortization disclosures are excluded. See `decisions.md`'s "SEC D&A:
  component summation" record for the per-company reconciliation evidence.
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
`_compute_dcf_core`). Costco's Low/Base/High tabs and Reverse DCF remain Quick DCF-only — see
below. The Costco demo itself is available in both modes: activating it populates a complete
Driver Base Case alongside the Quick-mode Low/Base/High presets, described under "Costco demo:
a provider-independent Driver Base Case" below.

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

### Costco demo: a provider-independent Driver Base Case

The embedded Costco demo (`frontend/src/features/dcf/costcoDemo.js`) provides one complete,
deterministic five-year Driver Base Case, computed from the same frozen snapshot and the exact
same `driverHistory()`/`buildBaseForecast()` pipeline described above — never a hand-typed
schedule that could drift from it. Revenue growth, EBIT margin, tax rate, D&A and CapEx seed
and are badged **Seeded** exactly as they would for any live ticker; revenue growth's Fade
target is moved from the historical median to the shared 2.5% terminal growth rate (the same
one-time "Use terminal growth as target" action above), giving 7.46% → 6.22% → 4.98% → 3.74% →
2.5%. NWC Investment is the one departure: Costco's own history is `unstable` and is correctly
refused, exactly as it would be live, but a blank required cell would not be "immediately ready
to run" — so it is force-set to an explicit **`-3.0% Flat`** demo assumption, deliberately
close to but not asserting the reliability of the frozen history's own ~−3.26% aggregate, and
pointedly left out of `seededFields` so it renders unbadged, directly beneath its own
still-live Unstable badge. No live company-data request is made either way — see
`docs/decisions.md`'s "Costco demo: a provider-independent Driver Base Case" for the full
design record, including why leaving the demo resets the driver schedule even when the ticker
matches.

### Driver-Based DCF: standardized ±1pp driver sensitivity (tornado)

A ranked, one-driver-at-a-time sensitivity over the six operating drivers, available in
Driver-Based mode only. Each row shifts one driver by **±1 percentage point in every forecast
year** (a parallel shift, so a Fade row keeps its fade and a Custom row keeps its per-year
pattern), holding every other driver — and WACC, terminal growth, net debt and share count —
at the base case. Thirteen valuations in total: one base plus six drivers × two directions,
every one of them a full `run_driver_dcf` call, so the tornado can never disagree with the
valuation it sits under.

**The base case is recomputed inside the endpoint**, never supplied by the client or
reconstructed from a separately-rounded figure, so every delta is measured against a base that
provably came from the same run.

**Why a fixed ±1pp rather than each driver's own historical dispersion.** With four usable
observations per driver — and the v2 seeding rules already refusing several of them as
unstable — a dispersion-scaled shift would silently blend *how uncertain* an assumption is
with *how much it matters*, producing exactly the kind of opaque composite score this project
rejects elsewhere (see "Deterministic risk analysis" in `decisions.md`). A fixed, stated shift
is reproducible and legible straight off the chart.

**±1pp is not the same proportional move for every driver, and the ranking reflects that.**
On the Costco base case a 1pp shift is a ~113% relative move for D&A (0.88% of revenue) and a
~4% relative move for the tax rate (24.55%) — so D&A and CapEx top the ranking ahead of revenue
growth. That ordering is correct *given* the convention; it is not a claim that D&A is the most
important assumption in the model. Every row therefore displays the path it actually tested
rather than only its rank.

**Endpoints are labeled by assumption direction (−1pp / +1pp), never as upside/downside**, and
the two endpoints of one driver may legitimately fall on the **same side** of the base value.
Three real mechanisms in this engine produce that, none of them hypothetical:

- **NWC investment is a percentage of the year-over-year *change* in revenue**, not a
  balance-sheet ratio, so in a declining-revenue year the change is negative and a higher
  percentage *releases* cash rather than consuming it — reversing the driver's sign entirely.
- **Revenue growth applied to a negative-revenue year** (permitted and warned on, never
  blocked) makes revenue more negative as the rate rises.
- **`max(EBIT, 0) × tax_rate` puts a kink at EBIT = 0**, so a driver sitting near that boundary
  is asymmetric across the two directions.

Because of this, rows are ranked by the **spread across the base value and both tested
endpoints** (`max(base, −1pp, +1pp) − min(base, −1pp, +1pp)`), not by the distance between the
two endpoints alone. The two measures agree exactly whenever the endpoints straddle the base
case — the ordinary situation — but when both land on the same side, an endpoint-only measure
collapses toward zero and would rank a driver that genuinely moved the valuation in both
directions as though it had moved nothing at all.

**Every driver is shifted in every forecast year; only revenue growth compounds.** The ±1pp
applies to all N years for all six drivers alike — none of them is a single-year perturbation.
Revenue growth is structurally different not because it is applied more often but because it
compounds the revenue base into each subsequent year, and therefore into the final year that
terminal value is built from, while the other rate drivers act on each year's own revenue
without carrying forward. That difference is economically real and is what the chart exists to
show — not a scaling artifact to normalize away.

**WACC and terminal growth are deliberately excluded.** They are not operating drivers, and
ranking "what do I believe about the business" against "what discount rate do I use" in one
ordered chart conflates two different questions. They keep their own WACC × terminal-growth
grid, which the chart points to without claiming either is larger.

**Uncomputable sides go null, one side at a time.** A perturbation that overflows returns
`null` for that direction only — the opposite direction and the other five drivers still
report normally, and the row is marked incomplete and sorted after every complete row (then by
its one available absolute delta). Only the **base** case re-raises rather than nulling: if the
analyst's own unperturbed inputs cannot be computed, the request fails cleanly rather than
returning a chart measured against a base that doesn't exist — the same rule both sensitivity
grids already apply to their own base cell.

**A tested endpoint can be an assumption the engine itself warns about, and is marked rather
than corrected.** This is the ordinary case, not an edge case: any company whose D&A runs below
1% of revenue has a negative D&A percentage at −1pp. Costco's is 0.88%, so its −1pp endpoint is
−0.12% — which `driver_warnings` flags as `negative_da_percent` when entered directly — and on
the real demo inputs that endpoint drives the **top-ranked row**.

The perturbation is neither clamped to zero nor skipped: silently substituting a different
assumption than the one the convention states would break both the "standardized ±1pp" claim
and this project's rule against quiet economic substitution (see `CLAUDE.md` §6). Instead, each
endpoint's own valuation returns its driver warnings, those are compared against the base
case's by `(year, id)`, and any **newly introduced** warning is grouped by id and marked on
that endpoint with its tier, short name, and affected years — all as visible text, not a
hover-only tooltip. Warnings the analyst's own base-case inputs already raise are never
re-reported as something the shift caused, and a warning that already existed in some years but
newly extends to others is still caught, since the comparison is per `(year, id)` rather than
per id.

This is a **standardized mechanical sensitivity**: not a probability, not a confidence
interval, and not an estimate of how uncertain any assumption actually is.


### Driver-Based DCF: two-way Revenue Growth × EBIT Margin sensitivity

A 5 × 5 grid of value per share, available in Driver-Based mode only, over standardized
**parallel shifts of −2pp, −1pp, base, +1pp and +2pp** applied to revenue growth (rows) and
EBIT margin (columns) in **every forecast year**, holding every other driver — and WACC,
terminal growth, net debt and share count — at the base case. Exactly **twenty-five**
`run_driver_dcf` calls: the centre cell *is* the base case, so it reuses that run rather than
valuing an identical schedule a second time — which also means the centre cell has only one
possible origin, the same reason the base is computed inside the endpoint rather than supplied
by the client.

**Why this exists alongside the tornado.** The tornado moves one driver at a time and so
cannot show how these two combine — and they do combine, because a year's UFCF depends on
revenue and margin multiplicatively through EBIT, while the reinvestment drivers (CapEx, D&A,
NWC investment) scale with revenue independently of margin. Whether more revenue growth raises
or lowers value per share therefore depends on the margin and reinvestment the same schedule
carries. Both outcomes are ordinary, and the grid computes which one applies rather than
asserting either.

**Neither axis is presented with an assumed direction, and this is a substantive convention
rather than cautious wording.** The WACC × terminal-growth grid's legend can say that a lower
WACC generally raises value; this grid's cannot say the equivalent about revenue growth,
because on a reinvestment-heavy schedule it is false. On a schedule of 25% revenue growth, 18%
EBIT margin, 25% tax, D&A 4% of revenue, CapEx 12% and NWC investment 15% of Δrevenue, the
direction **reverses inside the grid itself**: at −2pp margin, moving revenue growth from −2pp
to +2pp takes value per share from $2.32 to $1.40, while at +2pp margin the same shifts take it
from $13.16 to $13.99.

**The two axes are not symmetric, and the docs say so rather than implying they are.** Holding
a year's revenue fixed, UFCF is increasing in EBIT margin only when that year's revenue is
**positive** and its tax rate is **at or below 100%** — EBIT is revenue × margin, so a
negative-revenue year (permitted and warned on, never blocked) reverses the relationship, and
cash tax of `max(EBIT, 0) × rate` above 100% takes more than a profitable year's entire EBIT.
The revenue-growth axis is genuinely non-monotone under ordinary assumptions. Neither
condition is assumed by the engine or by the grid.

**A per-year cash-flow relationship is not a valuation threshold.** For a year with positive
EBIT, that year's UFCF is `R × (m(1−t) + d − c − n) + n × R_prior`, so the sign of
`m(1−t) + d − c − n` governs whether more revenue raises or lowers *that year's* cash flow.
That is a useful local explanation and nothing more: it does not determine the total valuation
response, which also runs through compounding into later years, discounting, each year's own
driver path where the schedule is a Fade or Custom, and the terminal value built off the final
year alone. The grid is computed from twenty-five full valuations, never from this expression,
and the test suite asserts the observed cells rather than the algebra.

**Axes are labelled as shifts, not levels.** A Fade or Custom row has no single level to
perturb, so the columns and rows read `−2pp … +2pp` against the analyst's own schedule, and the
actual schedules the shifts were applied to are reported beneath the grid in the same
Flat/Fade/Custom-aware form the tornado uses. A representative value (an average, or the first
year) is never invented to stand in for a varying row.

**Overlap with the tornado is exactly four cells.** The cells at (±1pp growth, base margin) and
(base growth, ±1pp margin) test precisely what the tornado's revenue-growth and EBIT-margin
rows test, and agree with them — this is asserted in the test suite, so the two views cannot
drift. The ±2pp cells and every combination off those two lines have no tornado equivalent;
they are what this grid adds.

**A 1pp step is uniform across both axes deliberately, and is not the same proportional move
for both.** A per-axis step tuned to each driver's typical dispersion would reintroduce the
uncertainty-versus-magnitude blending the tornado's convention already rejects, and would leave
two shift conventions to explain instead of one. The cost is disclosed rather than corrected
for: on a schedule whose EBIT margin runs 3.43%, −2pp leaves **1.43%** — still positive, but a
58% relative reduction, where −2pp on revenue growth is a far smaller relative move. Each axis
therefore reports the schedule it actually shifted.

**Uncomputable cells go null individually; the base cell re-raises.** Unlike the two WACC
grids there is no per-cell Gordon Growth convergence check, because WACC and terminal growth
are held fixed here: if the base case converges, every cell does. The only null is a
computational overflow, and the centre cell raises rather than nulling — the same rule the
tornado and both grids apply to their own base.

**A cell whose combined shift introduces a warning is marked, not corrected.** Each cell's own
valuation returns its driver warnings, compared against the base case's by `(year, id)` through
the same `new_endpoint_warnings` helper the tornado uses. Distinct warnings are listed once
beneath the grid, most severe first and **numbered**; a marked cell carries those numbers as a
superscript, so a grid raising two different warnings says which cell raised which rather than
only that something was flagged. The cell's accessible text names each warning **and the
forecast years it affects**, taken from that cell's own warning.

**The aggregate carries warning-level copy, never one cell's engine explanation.** The engine
writes explanations per cell, naming that cell's particular years and computed figures. Reusing
one of those sentences for an entry that counts several cells would describe the others
incorrectly — a fabricated detail, which is worse than no detail — so the list beneath the grid
states what is true of every cell raising that id, and the engine's exact sentence stays
attached to the cell it belongs to.

A negative EBIT margin is **not** itself something this engine warns about — only a resulting
condition, such as a non-positive final-year UFCF, raises a warning of its own.

### DCF traceability: reported history to forecast, and where enterprise value comes from

Two presentation-only views over figures the valuation response already returns. No engine,
payload or methodology change; both are frontend-only.

**Reported history to forecast.** Reported actuals and the analyst's forecast on one axis, so
a forecast that breaks from the company's own history is visible rather than inferred. Both
sides are **nominal** — deliberately not discounted, because the question is whether the
forecast continues the history, and history is nominal. Discounting is the composition view's
question, and mixing the two would make a flat forecast look like it decays.

Unlevered FCF is charted in **both** forecast modes — the only metric that exists on both
sides in both, since Quick DCF projects FCF directly and carries no revenue at all. Revenue is
added in **Driver mode only**, where the projection builds it explicitly.

**Each metric is gated on its own usable data: one reported observation plus one forecast
value.** Not two observations — the two-period minimum belongs to the historical trend
mini-charts, which draw a *trend* and need two points to have one, whereas a handoff needs
only a point to hand off from. The two metrics gate independently, because a company can
report revenue for a period whose unlevered FCF could not be constructed from the filing. A
period missing the metric is dropped rather than carried as a null, so a gap can never push
the reported/forecast boundary around.

**Where enterprise value comes from.** Two readings on two scales, never one. Terminal value
is routinely 70–90% of enterprise value, so drawn on a shared scale the annual bars collapse
into slivers and the annual breakdown — the only thing this adds over the existing
terminal-value observation — becomes decorative. The same reasoning the historical trend
charts already apply to Revenue against Unlevered FCF.

1. **Annual present values**, on their own signed scale.
2. **The aggregate contribution to enterprise value**, on a signed axis.

Reading 2 is **not a clamped 100% stack**. A stack can only draw two same-signed parts summing
to the whole, so a −18% / 118% case would have to be clipped or rescaled — drawing a picture
that is not the number. The axis spans the signed range actually present and each segment runs
from the zero line in the direction of its own sign, so a mixed-sign case looks mixed.

**The aggregate explicit contribution is `enterprise_value − pv_terminal_value`, never the sum
of the per-year present values.** The backend rounds each forecast row's `present_value` and
`enterprise_value` independently from the unrounded figures, so summing the rows can miss
enterprise value by a few cents and the two contributions would not reconcile to exactly 100%.
Deriving it by subtraction from the same two rounded numbers the rest of the UI shows makes
the reconciliation exact by construction. The per-year rows remain what the annual bars plot —
they are the detail, not the total.

### Terminal value's contribution to enterprise value: one rule

A percentage contribution is reported whenever enterprise value is **finite and strictly
positive** — *including* contributions **above 100% or below 0%**, which are real whenever the
explicit period's own present value is negative. A reinvestment-heavy forecast reaches this
with every driver in a normal range. Where enterprise value is zero, negative or non-finite,
**no percentage is claimed at all**: a share of nothing is not a smaller share, and a share of
a negative denominator inverts the intuitive reading rather than describing it. The dollar
components are still stated in that case; only the proportion is withheld.

**Contribution language, not "the remaining X%."** At 118% terminal and −18% explicit, "the
remaining" is false. Both halves are stated as contributions, which stays true across the whole
sign range: *"Terminal value contributes 118% of enterprise value; the explicit 5-year forecast
period contributes −18%."*

This supersedes the narrower rule Explain This Valuation previously applied, which suppressed
any share outside `[0, 1]` as confusing. That hid a real and informative case — precisely the
one the composition view exists to surface. The rule now lives in one module and both the chart
and the observation read it from there, so the two cannot state different things about the same
number.

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
