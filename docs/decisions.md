# Decision Log

Durable architecture, product, and methodology decisions — consolidated from the project's
full chronological log, which remains intact at
[`docs/archive/PROGRESS_HISTORY.md`](archive/PROGRESS_HISTORY.md). This file exists to make
*why* things are the way they are findable without reading a development journal; it is not
itself a journal, and not every historical decision appears here — routine implementation
choices, UI-detail decisions, and dev-tooling notes stay archive-only.

**Status labels:** **Accepted** — current, in force. **Superseded** — replaced; the record
explains what replaced it and why. **Deferred** — deliberately not decided yet, with a
stated trigger condition.

---

## Core stack, backend, and deployment
**Status:** Accepted

React + Vite, plain JavaScript (TypeScript deferred until the codebase justifies it — see
`docs/ROADMAP.md`). Python/FastAPI backend from day one, ahead of when the frontend-first
default would normally introduce one — chosen because Python is the language most associated
with analyst/data work, keeping the door open for heavier data analysis later without a
rewrite. Deployment: GitHub → Render (backend) + Vercel (frontend), chosen as the
best-documented free-tier pairing for a static frontend + small Python API with no database.
Alternatives considered and rejected: JS-only calculations in the browser (simpler, but wrong
language for the domain's future direction); Railway/Fly.io for the backend and GitHub Pages
for the frontend (more setup complexity or a poor fit for a Vite SPA, no clear benefit).

## Stateless architecture: local persistence and client-side export
**Status:** Accepted

Saved scenarios live in browser `localStorage`, not a backend database — consistent with
keeping the backend stateless (see Architecture in `CLAUDE.md`) until cloud-saved analyses,
collaboration, or another real need justifies one. Revisit only if `localStorage` proves
genuinely limiting. CSV export is generated entirely client-side (the data needed is already
rendered in the browser), so no export endpoint exists — adding one would be backend
complexity with no corresponding benefit.

## Long-term product direction and scope gates
**Status:** Accepted

The modeling engine (real estate + DCF calculators) is the foundation, not the end state —
this project is not meant to become "just" an increasingly sophisticated financial
calculator. The long-term differentiator is an AI-powered analyst *workflow* tool: raw
deal/company information → structured assumptions → financial model → scenarios/sensitivities
→ risks/insights → decision-ready summary/export, with AI and automation progressively
reducing the manual effort between those stages. This is explicitly gated on the modeling
engine being solid first and is not scoped or scheduled — see `docs/ROADMAP.md`'s Parked
column for the full capability list and the Tenant/Rent-Roll Underwriting Module concept,
which applies the same mental model to real estate specifically and is itself gated on
validating tenant-level data needs with real CRE professionals before any scoping work.

## Real estate: cash-flow and debt conventions
**Status:** Accepted

Debt amortization is monthly-pay, monthly-compounding (the real commercial-mortgage
convention), rolled up into annual schedule rows for display — flagged to the user as a
genuine convention choice before being decided. NOI grows at one flat annual rate from Year 2
onward (Year 1 is the unescalated going-in NOI); exit value capitalizes NOI one year past the
end of the hold period, i.e. what a buyer is actually purchasing. **Superseded:** the original
V1 approach used flat going-in NOI for exit valuation with no acquisition/disposition costs —
replaced once multi-year growth modeling shipped (2026-08-13), which fixed that simplification
for free. Loan maturity is modeled separately from amortization period (standard "5-year term,
30-year am" CRE phrasing) and is hard-validated to be at least as long as the hold period —
alternatives considered were modeling a balloon payoff (adds refinancing-adjacent complexity,
explicitly deferred) or allowing the input with only a warning (would silently compute cash
flows under financing that had contractually expired — rejected as misleading, not just
imprecise).

## DCF: forecast and discounting conventions
**Status:** Accepted

Discounting is end-of-year, not mid-year — flagged as a genuine, material convention choice
(mid-year typically increases valuation a few percent) and decided deliberately for V1
simplicity; mid-year remains a natural future enhancement. The explicit forecast period
applies one flat annual FCF growth rate rather than a revenue-driver build-up (revenue →
margin → taxes → D&A → CapEx → ΔNWC) — deferred scope, not yet built; see
`docs/ROADMAP.md`. Unlevered FCF uses the proper enterprise-value construction, `EBIT × (1 −
effective tax rate) + D&A − CapEx − change in NWC`, not an operating-cash-flow-minus-CapEx
shortcut, which would blend in after-tax-interest and other financing effects that don't
belong in an unlevered figure — implemented as pure, independently tested functions,
deliberately shaped so a future driver-based forecast is the same construction applied to
projected rather than historical figures, not a rewrite.

## Sensitivity and scenario-comparison design
**Status:** Accepted

Both sensitivity grids (real estate: exit cap rate × hold period; DCF: WACC × terminal growth)
use fixed deltas around the base case, not user-configurable ranges — both exist to answer one
question fast ("how exposed am I to X and Y moving against me") without turning a risk view
into another form to fill in. Both compute their center cell through the exact same function
used for the headline result, verified by dedicated tests to reproduce it exactly. Scenario
comparison recalculates from each scenario's saved *inputs* on every view rather than storing
past computed results — because calculation logic has already changed multiple times in this
project (LTV bounds, exit valuation convention, terminal growth validation), and stored
results would silently go stale. A scenario whose saved inputs no longer pass current
validation surfaces as a visible, per-scenario error rather than a silently wrong number.

## Deterministic risk analysis, no black-box scoring
**Status:** Accepted

Real estate risk flags (low Year-1 DSCR, exit cap-rate compression, capital-loss exposure
across the sensitivity grid) are a third architectural layer reading already-computed output,
not modifying it. Each flag is transparent and rule-based — a named reference threshold and an
explanation, never a composite "risk score." Explicitly excluded from scope for the same
reason: a debt-yield flag (no defensible universal threshold) and any generic LTV/leverage
warning (low marginal insight over a value the analyst already typed in). This is a standing
design principle, not specific to real estate risk flags alone: saved scenarios use a
free-text name rather than a fixed `Base/Downside/Upside` enum field, for the same reason — a
rigid taxonomy doesn't fit every deal and doesn't feed any calculation a free-text name
doesn't already support. The same principle is the explicit design constraint for the future
Tenant/Rent-Roll Underwriting Module (`docs/ROADMAP.md`): transparent, evidence-based
tenant-level inputs, never an arbitrary "tenant health score."

## Institutional visual direction
**Status:** Accepted

Navy/charcoal on warm neutrals, muted and conservative, chosen over a lighter "modern
fintech" alternative (indigo/emerald accents, softer corners) — both were built as real
mockups and compared side by side, not decided from description alone. Chosen because the
target audience (PE, real estate asset management, recruiters) is more likely to read
navy/charcoal as "understands finance culture" than a startup-fintech look, which risks
reading as generic SaaS. Implemented as CSS custom properties so the palette is centralized
and revisitable from one place, not hand-picked per component.

## External-data architecture and provider evolution
**Status:** Accepted

The DCF ticker-search feature is this project's first and only third-party API dependency,
added deliberately once the DCF module needed real company financial data the app had no way
to source itself. The internal `CompanyData`/`FinancialPeriod` shape is deliberately
provider-agnostic — a plain per-fiscal-year record with a `source` field, no
provider-specific structure — so adding or changing a values provider is additive, not a
rewrite. **Superseded:** the original architecture (2026-08-24) used Alpha Vantage for all
fundamentals and quotes, with SEC EDGAR scoped down to a ticker→CIK lookup and filings-index
link only — SEC XBRL tag naming was found to vary genuinely by company (e.g. D&A reported as
one combined tag for some filers, split across two for others), which was assessed at the
time as more open-ended engineering than that milestone's scope. This was superseded
2026-08-30 once that XBRL normalization work was actually built — SEC EDGAR is now the
primary fundamentals source; see the SEC financial-field conventions record below. Provider
selection itself was verified live, not from documentation: IEX Cloud was confirmed fully
shut down, Finnhub and Financial Modeling Prep were confirmed to have removed free-tier
fundamentals access since older write-ups were published, and Alpha Vantage's actual
endpoints were called live and confirmed working on the free tier before being chosen as a
provider at all. Two independent caches (fundamentals: 24h TTL; quote: 15min TTL) avoid
serving stale prices or burning through Alpha Vantage's 25-requests/day budget unnecessarily.

## SEC financial-field conventions and derivation rules
**Status:** Accepted

SEC EDGAR (XBRL company facts) is the primary source for DCF historical fundamentals; Alpha
Vantage fills any field SEC can't confidently map for a period, and remains the sole current-
price source. Every fallback chain was built from real tag variation confirmed against
AAPL/CAT/WMT filings, not guessed from documentation (e.g. Walmart's D&A tag changed between
2020 and 2025; Caterpillar never adopted the modern revenue tag at all). Two fields required
an explicit methodology decision rather than a mechanical mapping: **cash** sums
cash-and-equivalents plus short-term investments, preserving the app's pre-existing combined
meaning rather than SEC's narrower cash-only tag, which would have materially understated
cash for a company like Apple. **Debt** sums a defined set of non-overlapping, recognized
interest-bearing components (including finance leases, explicitly never operating leases),
marked as a calculated (not directly-reported) figure internally, falling back to Alpha
Vantage entirely — never zero, never silent — if a filer's composition can't be confidently
and completely mapped. Diluted shares use `WeightedAverageNumberOfDilutedSharesOutstanding`,
not SEC's point-in-time basic share count, to match this app's existing diluted-share field.
Full per-fact provenance (XBRL tag, accession number, filed date, form, confidence) is
computed and, as of 2026-08-31, exposed via the API — see "Per-value provenance and reference
price disclosure" below.

## Per-value provenance and reference price disclosure
**Status:** Accepted

Every historical DCF field now discloses how its value was actually obtained, and the former
"current price" is now an explicit, dated, editable Reference Price — one combined milestone
(2026-08-31) because both extend the same underlying value/source/date/status shape already
partially built as the workstation's `Sourced/Analyst/Adjusted` field badges.

**Four-word status vocabulary, not three.** `reported` (a single direct SEC XBRL fact),
`combined` (summed from more than one SEC fact — e.g. cash + short-term investments, or debt
across several interest-bearing tags), `calculated` (derived by formula from other
already-resolved fields — effective tax rate, ΔNWC, net debt, UFCF, revenue growth, operating
margin — with no single underlying fact at all, so it carries a formula string instead of
components), and `fallback` (SEC data could not be confidently mapped for the field, so
Alpha Vantage supplied it instead — never labeled `reported`, regardless of how confident
Alpha Vantage's own data is). `combined` is
deliberately a different word from `sec_fundamentals.py`'s internal "calculated" confidence
tier, which meant the same thing at that layer — kept as `combined` at the API/UI boundary
specifically to not collide with this module's own, differently-scoped "calculated" status.

**Progressive disclosure, not a badge per field.** A single small color-coded dot sits inline
after each value (latest-period panel and the 5-year history table alike) with a native
tooltip; a "Sources" toggle reveals the full breakdown (tag, fiscal period, filing form/date,
accession number, a live link to the actual SEC filing index page) on demand, plus a shared
legend. Chosen over always-expanded metadata specifically because CLAUDE.md's provenance
requirement pairs "surface everything" with "do not cover the workstation in badges" — the
two are only reconcilable through disclosure depth, not by leaving anything out.

**Reference price replaces "current price" as a clean rename, not a compat shim** —
internal API, one frontend consumer, consistent with this project's standing preference for
direct renames over backwards-compatibility shims. `CompanyProfile.reference_price` /
`reference_price_as_of` populate from Alpha Vantage's quote (`"05. price"` /
`"07. latest trading day"`, both live-verified field names) when available; the analyst can
edit either the price or the date, and editing a sourced value flips its badge from `Sourced`
to `Adjusted` rather than silently continuing to present it as untouched sourced data. With no
quote available (Alpha Vantage down, unconfigured, or the ticker has no quote), the field
starts blank and manual entry gets `Analyst Input` status — the same label the app already
used for assumption fields with no data-provider counterpart at all, deliberately not a new
fourth reference-price-specific label.

**Reloaded scenarios restore the correct `Sourced`/`Adjusted`/`Analyst Input` status, not a
blanket downgrade.** An earlier version of this milestone always relabeled a reloaded price
`Analyst Input`, reasoning that a reload has no live `sourcedSnapshot` left to compare
against — corrected before commit, because that quietly discarded real information the app
already had at save time (whether the price was ever sourced at all, and from where) for no
benefit. The fix: `referencePriceSourcedValue`/`referencePriceSourcedDate`/
`referencePriceSourceTicker` are persisted in the saved scenario's own data alongside the
live `referencePrice`/`referencePriceDate` (the same localStorage mechanism that already
persists every other assumption; never sent to the valuation API, which only ever reads the
named calculation fields it whitelists). The status badge is computed by comparing the live
fields against these persisted "as sourced" fields — the exact same comparison whether the
company was just loaded or the form was just restored from a saved scenario, one function,
no reload-specific branch. A scenario saved before this field existed simply has empty
sourced-baseline fields, which correctly reads as `Analyst Input` — an honest "unknown,"
not a wrong "still sourced" claim, so backward compatibility falls out of the same logic
rather than needing a special case.

**A reference price is cleared, not carried over, when a new company's load has none.**
Every company load now explicitly sets all five reference-price fields — to the new
company's real values, or to `''` — rather than only setting a field when the API response
had one. Before this fix, loading a company with a sourced price and then loading a second
company whose quote came back empty left the first company's price and its "Sourced" badge
on screen, silently implying it as if it were the second company's own market price.

**Requires a valid positive number *and* a nonblank date before showing the upside/downside
comparison** — see
"Implied upside/downside" above, superseded by this milestone to gate on a usable price
generally rather than specifically an Alpha-Vantage-sourced one. A fixed, direction-agnostic
disclaimer sentence ("The difference reflects the model's selected assumptions and simplified
flat-growth methodology. It is not an investment recommendation.") accompanies the comparison
every time it's shown, reusing the same neutral-framing language already decided for the
future embedded demo (see "Revised DCF sequence" below).

## DCF terminal-growth validation
**Status:** Accepted

Hard-blocked only for genuine Gordon Growth mathematical invalidity: WACC must exceed
terminal growth, and terminal growth can't sit low enough that the underlying perpetuity
stops converging (`|(1 + g) / (1 + WACC)| < 1`, a derived boundary, not an arbitrary cap).
Assumptions that are valid but structurally unusual — a narrow WACC/terminal-growth spread,
or terminal growth at or below −100% — surface as explanatory warnings instead of being
blocked. **Superseded:** the original V1 approach hard-capped terminal growth at a flat 6%,
an economic-judgment call dressed as validation — replaced 2026-08-28 after a multi-round
methodology discussion that also caught and corrected a real error in an intermediate
proposal (a bare `WACC > g` check, which misses the convergence domain's actual lower bound).
Universal magnitude-based "unusual growth" thresholds were considered and rejected — what's
economically reasonable depends on currency and macro conditions this app has no data source
for; a hard-coded threshold would just be the same judgment-cap problem in warning-shaped
clothing. This is the origin of the validation principle now stated in `CLAUDE.md`: hard-block
only for genuine computational/structural invalidity, never for analyst-judgment-dependent
economic reasonableness.

## DCF explicit-period FCF-growth validation
**Status:** Accepted

No fixed ceiling or floor on `fcf_growth_rate`, applying the same principle as terminal
growth. At or below −100% the arithmetic stays finite and well-defined, so it's computed and
flagged with a specific warning rather than rejected — exactly −100% means every forecast
year becomes $0; below it, projected cash flow alternates sign year to year rather than
continuing to decline. Only a genuine computational failure (overflow, or a non-finite
result from an extreme combination of base FCF, growth rate, and forecast length) is rejected
outright, enforced at the actual computation rather than any fixed input ceiling — a
single-field ceiling can't guarantee numeric safety, since overflow depends on base FCF,
growth rate, and forecast length together. An interim design — hard-blocking below −100% as
"structural invalidity" — was proposed, then corrected during review before anything was
committed: the arithmetic there stays well-defined and only the *interpretation* is
economically odd, which is a case for a warning under the principle above, not a block. This
correction is why `CLAUDE.md`'s validation principle explicitly names "economically strange"
quietly substituting for "computationally invalid" as a recurring failure mode to watch for.

## Live verification requirement for provider integrations
**Status:** Accepted

Every external-data integration in this project has shipped with a bounded live verification
step against real tickers, in addition to fixture-based tests — and every time, it has found
at least one real bug fixtures alone did not surface. First instance (2026-08-24): Alpha
Vantage's free tier enforces ~1 request/second and the first real-key call tripped its own
rate limit; Apple's real balance sheet reports the literal string `"None"` for `currentDebt`
while reporting a usable `shortTermDebt` for the same period, silently producing undefined
NWC/UFCF for one of the largest public companies. Second instance (2026-08-30): Alpha Vantage
normalizes a 52/53-week fiscal year end to calendar month-end while SEC reports the filer's
actual date, which silently broke the SEC-primary match for most of Apple's history until
live verification caught it. This record exists specifically so the requirement doesn't get
skipped as "just extra work" on a future integration — it has concretely paid for itself
twice already, on two unrelated provider quirks a hand-written fixture would not have
guessed.

## Upstream-error sanitization and credential protection
**Status:** Accepted

Found live in production (2026-08-24): Alpha Vantage's own rate-limit response echoes the
caller's API key back in plain text ("We have detected your API key as ..."). Since this
app's key is shared across every visitor (not issued per-user) and the error was being
relayed straight through as the API's `detail` response, any user who hit the rate-limited
state would see the shared key exposed in their browser's network tab — a real, live-
confirmed exposure. Fixed by raising a generic, fixed message for this specific case instead
of relaying upstream text; the original detail is still printed server-side (visible in
Render's Logs) for actual debugging, never returned to the client. This is now a standing
rule for any provider integration, stated in `CLAUDE.md`: upstream error responses are never
relayed to the client verbatim without checking whether they can carry a secret or other
sensitive detail.

## Sourced facts vs. illustrative assumptions
**Status:** Accepted

Where a worked example uses real-world data, only what's actually verifiable is presented as
sourced, and everything else is clearly labeled illustrative — never presented as if it were
sourced fact. The real estate worked example (100 Symes Road, Toronto) sources purchase price
and going-in NOI from the public listing (verified directly against the brokerage's own page)
while financing, growth, hold, and exit assumptions are explicitly labeled illustrative via an
always-visible disclaimer. The illustrative assumptions were deliberately not engineered for
an attractive return — the resulting case is moderate and believable specifically because it
demonstrates the app's sensitivity grid and risk flags doing real analytical work, not because
it looks good.

## Implied upside/downside: arithmetic, not a recommendation
**Status:** Accepted

`Implied Upside/Downside = (implied value per share ÷ reference price) − 1`, shown only when
a valid, positive reference price exists — sourced from Alpha Vantage's quote endpoint,
manually entered, or a sourced value the analyst has edited — never framed as "undervalued,"
"attractive," or "buy." **Superseded (2026-08-31):** the original version required a
real *sourced* current price specifically (never shown for manual entry); the reference-price
milestone below made manual entry a first-class path with its own honest status, so the gate
is now "a usable positive number exists," not "it came from Alpha Vantage." The
never-a-recommendation positioning is unchanged: the app performs deterministic arithmetic on
numbers the analyst can see and can invalidate; it does not make or imply a recommendation. A
fixed disclaimer sentence accompanies the comparison wherever it's shown.

## Reverse DCF (price-implied FCF growth)
**Status:** Accepted

Solves for the single constant explicit-period FCF growth rate that reconciles a target
(reference) price under every other DCF input held fixed — the last item in the "Revised DCF
sequence" below, needing a real, dated reference price to solve against (item 2) and real
historical performance to compare it with. Reported strictly as *the growth rate required to
reconcile the dated reference price under the model's current WACC, terminal growth,
forecast period, base year FCF, net debt, and share count* — never as a market forecast, an
analyst prediction, or an objective "correct" growth rate, the same never-a-recommendation
positioning already established for Implied Upside/Downside.

**One shared unrounded valuation core for both directions, not a second formula
implementation.** `_compute_dcf` is the one place the forward valuation formula actually
lives; both `run_dcf` (rounded, forward, existing public API) and the new
`implied_fcf_growth_rate` (reverse solver) call it. The solver bisects against the core's raw
`value_per_share` directly, never against `run_dcf`'s already-cent-rounded output — solving
against a pre-quantized target would mean the "root" found is only accurate to within that
$0.01 step, not to the solver's own numerical tolerance.

**Solved by bisection, not a closed form, over a domain chosen for genuine mathematical
uniqueness.** Unlike terminal value, the explicit-period sum has no algebraic inverse once
discounting is involved. On `g > -1`, every projected cash flow `base_year_fcf * (1+g)^t` is
strictly increasing in `g` (`t ≥ 1`, `base_year_fcf > 0`), so `value_per_share` — a
positive-weighted sum of those terms run through terminal value, discounting, net debt, and
shares — is strictly increasing too, guaranteeing bisection converges to a *unique* root, not
just *a* root. At `g ≤ -1`, `(1+g)^t` alternates sign by year and monotonicity breaks down
entirely — exactly the region the existing forward engine already treats as economically
incoherent (see "DCF explicit-period FCF-growth validation" above). This is a reverse-solver
*uniqueness* requirement, stated explicitly as such, not a new restriction on what an analyst
can type into the forward form — manually entered growth rates remain validated exactly as
before, no ceiling or floor.

**Three distinct outcomes, deliberately not collapsed into one "failed."**
`target_below_floor`: the target price is at or below the mathematical floor
(`-net_debt / diluted_shares_outstanding`, the limit of `value_per_share` as `g → -1+`,
never attained) — a closed-form fact about the inputs, checked before any search is
attempted, not a search failure; the floor itself is computed and returned on every
response for diagnostics, but the frontend only ever displays it while explaining this
status, never alongside a successful result. `not_bracketed`: the numerical search itself
couldn't complete within computational limits — either adaptive bracketing (doubling
outward from a target above `f(0)`, or approaching `-1` from above for a target below it)
never found a bound within its defensive step cap, or genuine float64 overflow fired first
(both empirically verified: targets up to `1e300` solve; `1e305` genuinely overflows at a
15-year forecast). `solved`: a unique `g` was found within the solver's price tolerance
(half a cent, matching `run_dcf`'s own 2dp precision). None of these read as an economic
ceiling on growth — deliberately not the originally-considered flat percentage search cap,
which would have silently reintroduced exactly the kind of arbitrary economic threshold this
project's validation principle already rejects for the forward form (see "DCF
terminal-growth validation" above).

**Caught in pre-commit review, not shipped:** the bisection loop originally fell through to
`status: "solved"` using the last midpoint tried even when the loop exhausted its full step
budget without ever landing within tolerance — fabricating a "solved" result for a target
that was never actually reconciled (verified directly: a synthetic 1-step budget against a
$500 target returned a "solved" $11.02 reconciliation, a $489 miss). Fixed with a `for...else`
on the bisection loop: exhausting the loop without hitting `break` now returns
`not_bracketed`, the same honest "couldn't solve this within computational limits" outcome as
a bracket that never formed at all, never a fabricated convergence.

**Independent invalidation, not shared with the forward valuation's own staleness.** Reverse
DCF reads base year UFCF, forecast period, WACC, terminal growth, net debt, and diluted
shares — every one shared with the forward valuation — plus the reference price itself,
which the forward valuation never reads; it deliberately does not read the analyst's FCF
growth assumption, since it produces a growth rate rather than consuming one. The reference
price's "as of" date invalidates neither calculation — it only gates whether a usable
reference price currently exists and what date displays beside it. This required extending
result-staleness tracking to ordinary single-company/manual mode, not just Costco demo mode,
which previously had no forward-staleness notion at all — showing a stale valuation beside
edited assumptions is a correctness problem regardless of mode.

**Caught in pre-commit review, not shipped:** the reverse-DCF card was originally nested
inside the forward result's own `activeResults` conditional branch, so a forward-only edit
(e.g. the analyst's FCF growth rate, which reverse DCF never reads) collapsed the entire
branch to the generic "assumptions changed" banner — hiding a reverse result that was still
completely valid. Fixed by making the reverse-DCF card an independent sibling of the forward
result block, with its own state ternary, so each side's stale/loading/error/success state
renders (or doesn't) entirely independently of the other's. Verified live in both
directions: editing FCF growth rate leaves the reverse card fully intact, and a simulated
reverse-DCF network failure leaves a successful forward result fully intact.

**A failed rerun is its own current outcome, not a stale one.** `runSingleValuation`
originally cleared `results` on a failed forward rerun but never cleared `resultsStale`,
so a rerun triggered from an already-stale state left the generic "assumptions changed,
click Run Valuation to refresh" notice showing in front of the real error — even though
clicking Run Valuation is exactly what had just been done and failed. Fixed by clearing
`resultsStale` on the failure path too, the same way it already clears on success; a failed
rerun now shows the actual friendly error message, with old results and CSV/Print correctly
staying hidden throughout. Caught and fixed in the same pre-commit review pass as the two
issues above, before anything shipped.

**Kept discoverable before any reference price exists.** The Price-Implied FCF Growth card
always renders — never conditioned on a usable reference price existing — so the feature is
visible even on a freshly loaded company or the empty pre-load state, with a concrete "enter
a positive reference price and as-of date" instruction rather than disappearing entirely.

**Historical context is unlevered FCF CAGR specifically, labeled as such, with revenue CAGR
only as clearly secondary context.** Computed from the real elapsed time between the oldest
and newest available `fiscal_year_end` dates (not `periods.length - 1` — a company's fiscal
calendar, like Costco's 52/53-week year, doesn't land exactly 365 days apart), endpoint-based
by definition (an interior dip, e.g. Costco's real FY2022 UFCF dip, doesn't disqualify it),
returning "unavailable" rather than a misleading number when either endpoint is missing,
zero, or negative. Labeled "Historical UFCF CAGR" in the UI (not the bare "Historical FCF
CAGR" an earlier draft used) specifically so it reads as the same cash-flow concept the DCF
itself is built on, matching the "UFCF" abbreviation already used elsewhere in the sourced-
data panel.

**CSV export preserves conditional context, and only for a genuinely current result.** The
Price-Implied FCF Growth section is appended only when the reverse result is currently
showing as solved (never stale, loading, unavailable, or failed), and always includes the
dated reference price alongside all six held-constant assumptions — never the growth figure
in isolation from the conditions it depends on.

**Scope deliberately held to the approved design, nothing broadened in review.** One reverse
request per Run Valuation click; one shared result across all three Costco cases, compared
against whichever case's tab is active; placement under Valuation Summary, not beside the
editable reference price input; no saved derived output; no WACC-based reverse-sensitivity
table or comparison chart (see `docs/ROADMAP.md`'s Later column). Costco's own price-implied
growth result (30.73% under Base Growth's assumptions) was not adjusted or tuned during this
milestone — the same "arithmetic only, don't engineer the number to look better" discipline
already established for the embedded demo's forward valuation gap.

## Explain This Valuation
**Status:** Accepted

Deterministic, frontend-only synthesis of up to three observations drawn from outputs the
forward DCF, reverse DCF, sensitivity grid, and historical-CAGR helper already compute — no
change to the valuation engine or methodology, only presentation-level differences, ratios,
and ranges over already-returned numbers; no backend or schema change. Reached after a
proposal-critique-revision cycle, not built as first drafted; several of the corrections
below reversed a design choice in the original proposal, including one caught after initial
approval and fixed before commit (see the percentage-point-equality point below).

**Exact percentage-point differences, not qualitative bands.** The first draft proposed
"materially/somewhat/roughly" labels for the gap between price-implied growth and the
analyst's case/historical UFCF CAGR. Rejected before implementation: an invented magnitude
threshold to decide those cutoffs would repeat exactly the pattern `CLAUDE.md`'s standing
lesson warns against (an economic-judgment label dressed as something more objective), just
applied to a presentation string instead of a validation block. An exact signed
percentage-point difference lets the analyst judge materiality themselves.

**A near-zero difference must not silently claim a direction.** Caught in a post-approval
review pass, fixed before commit: the first implementation always wrote "X.X percentage
points above/below," including when the underlying gap rounded to 0.0 at the same
one-decimal precision actually displayed — "0.0 percentage points above" implies a direction
that the displayed number doesn't actually show. Fixed with a shared `gapClause` helper: when
`Math.abs(diff).toFixed(1)` — the exact same call used for display — equals `'0.0'`, the
clause reads "matches Y to displayed precision" instead of a signed comparison. Derived from
the display formatting itself rather than a separately hand-picked threshold, so the wording
and the number shown can never disagree. Verified for both directions (a gap that rounds to
0.0 from slightly above and slightly below zero) and for exact equality with both the
analyst's case and historical CAGR, independently.

**Terminal value's share of enterprise value states only what the ratio supports.** The
first draft additionally claimed a high share implies greater sensitivity to WACC/terminal
growth than to the explicit-period forecast — corrected in review: proportion of value and
sensitivity (how much output moves per unit change in an input) are different questions, and
the ratio alone proves only the former. Final wording states the proportion only. Omitted
when `enterprise_value` is non-positive or non-finite, or when
`pv_terminal_value / enterprise_value` falls outside `[0, 1]` — the latter is reachable when
explicit-period PV is itself negative (large negative FCF growth), making terminal value
exceed 100% of a smaller enterprise value. Arithmetically real, but confusing stated as "X%
of enterprise value," so specifically excluded. Explicit-period length is read from
`forecastYears`, never hardcoded, so the wording stays correct at any forecast length.

**Sensitivity range is relative to the base case, with an explicit denominator, no
threshold language.** Downside (`base − gridMin`) and upside (`gridMax − base`) are each
shown in dollars and, when usable, as a percent of `activeResults.value_per_share` — the
current headline result, stated as the denominator rather than left implicit, and the same
value the grid's own center cell is built to reproduce exactly. No "highly sensitive" label
at any threshold — the numbers are left to speak for themselves, the same reasoning as the
first point above. When the base value per share is non-positive or non-finite, the percent
figures are dropped (division by a non-positive base would flip or undefine the intuitive
sign) and only the dollar range is shown, with a plain note explaining why no percent is
present — never silently computed and shown anyway.

**A fourth candidate — redirecting to an existing severity-tier warning — was cut, not
shipped.** It named an existing warning without synthesizing anything about it, which is
padding, not an observation, under this project's own "two or three strong observations over
five weak ones" standard. Final scope: three diagnostics.

**Independent forward/reverse invalidation, preserved exactly.** The price-implied-growth
diagnostic reads only `showReverseResult`/`reverseResult` (plus the live `form.fcfGrowthRate`
value and `historicalFcfCagr`, neither of which is a forward result) — never
`activeResults`/`activeResultsStale`. The terminal-value-share and sensitivity-range
diagnostics read only `showActiveResults`/`activeResults`/`activeSensitivity`. Verified live:
editing the case-specific FCF growth rate (in `FORWARD_STALE_FIELDS`, not
`REVERSE_STALE_FIELDS`) leaves the price-implied-growth observation fully intact, correctly
updated to the new live value, while the other two disappear until rerun — confirming the
same independent-invalidation behavior already established for the reverse-DCF card itself.

**No color coding, applied to all three observations, not only the price-implied-growth
one.** "Above" or "below" the analyst's case or historical CAGR isn't inherently good or bad,
so no `value-positive`/`value-negative` reuse — extended to the terminal-value and
sensitivity observations too, for internal consistency of the whole section with the
existing "arithmetic only, never a recommendation" principle (Implied Upside/Downside). All
three observations render in one uniform text color, confirmed via computed style.

**No live-verification requirement.** Unlike the DCF ticker-search pipeline's provider
integrations, this milestone reads only outputs already computed by existing, already-tested
code — no new external data source, so `CLAUDE.md`'s live-verification standing lesson does
not apply here. Verification is 23 new unit tests (synthetic inputs covering every omission
guard and edge case) plus manual dev-server verification against the Costco demo (tab
switching, invalidation, mobile layout, print CSS wiring) — the synthetic tests cover the
degenerate cases; the demo covers the ordinary integrated path.

## Real estate freeze pending professional validation
**Status:** Deferred — trigger: user validates real-estate underwriting conventions with a
CRE professional

A full project review (2026-08-29) found real estate has no CapEx/reserve line item anywhere
in the cash-flow-to-equity calculation — the single most likely gap an experienced CRE
reviewer would flag, and one among several findings suggesting real estate's underwriting
conventions should be validated against real commercial-real-estate practice before further
investment. Until that conversation happens, all real-estate findings from the review (and
any further changes to that module) are deferred, not rejected. Work continues on the DCF
side in the meantime.

## DCF forward-sequence rationale
**Status:** Superseded — by "Revised DCF sequence: data resilience, combined provenance/price
milestone, and a validated real-company demo" below (2026-08-31)

Agreed order (2026-08-29): hardening → SEC EDGAR as primary fundamentals → per-value
provenance → an editable dated reference price → reverse DCF → deterministic
"Explain This Valuation" diagnostics, before any AI commentary. Real dependencies, not an
arbitrary ordering: SEC EDGAR must land before per-value provenance, since accession numbers
and XBRL tags can't be shown for data that doesn't come from XBRL; the reference price and
SEC EDGAR are independent of each other but both must land before reverse DCF, which needs a
real price to solve against and real historical performance to compare against; a full
explain-this-valuation layer benefits from reverse DCF being done first, though a narrower
version (explaining sensitivity/warnings already computed today) has no such dependency.
Risk flagged and still open: whether Alpha Vantage remains in the DCF pipeline at all once
SEC EDGAR and the reference price both land is worth an explicit decision when the time
comes, not a silent drift.

The dependency reasoning above (why provenance needs SEC EDGAR first, why reverse DCF needs a
real price) remains valid; what changed is the order itself, and two new items were inserted
ahead of what this entry originally called "next." The open question about Alpha Vantage's
place in the pipeline is answered, not left open, by the entry below: it stays, but becomes a
genuinely optional fallback rather than a hard dependency.

## Revised DCF sequence: data resilience, combined provenance/price milestone, and a validated real-company demo
**Status:** Accepted

Reached after a candid critique-and-revision pass on a proposed real-company demo, not
approved as first drafted. Revised order: (1) DCF data resilience, (2) per-value provenance
and an editable dated reference price as one milestone, (3) bounded validation of a
real-company demo candidate, (4) an embedded, provider-independent demo with three ephemeral
cases, (5) reverse DCF,
followed later by deterministic valuation explanations.

**Data resilience is first because it has independent value, not because the demo strictly
requires it.** SEC EDGAR being "primary" for fundamentals today doesn't mean independent:
`get_company_data()` still fetches Alpha Vantage unconditionally and propagates its failures
(rate limit, missing key, unreachable) as a hard error, even when SEC data alone would be
sufficient for the fields that matter. Alpha Vantage's currently documented standard
free-service limit is 25 requests/day (see
[alphavantage.co/support](https://www.alphavantage.co/support/) — the same page notes that
verified educational or open-source projects can request an exception, so this isn't
necessarily true of every key; the fix must make the architecture resilient regardless of
what any specific key's actual limit turns out to be, not assume one fixed number). Hitting
whatever limit applies currently takes SEC-sourced data down with it for no reason, for real
live ticker-search users today — that's worth fixing on its own merits. The embedded,
provider-independent demo (item 4) doesn't strictly need this fix first, since its data is
frozen and embedded and makes no live provider requests when it loads — but the demo must
not be used to paper over the live-path reliability problem instead of fixing it. The
reliability fix stays first because of its own independent user value, not because of a hard
technical dependency on it.

**Provenance and the reference price are one milestone, not two,** because they share the
same underlying shape — value, source, date, sourced-vs-manual status — already partially
built as the DCF workstation's `Sourced/Analyst/Adjusted` field badges. Building them
together avoids shipping one UI pattern for historical fundamentals and a second,
incompatible one for the reference price a milestone later.

**One company with three cases, not two companies,** because this app has no
comparable-company framework — comparable-company inputs are listed among this project's
deferred items in `README.md` — and building one just to make a two-ticker comparison
meaningful would be out-of-scope expansion beyond the current roadmap, not a small addition. A
Low/Base/High Growth spread (originally named Downside/Base/Upside; renamed with the later
one-run/three-tab redesign - see "DCF demo-entry consolidation" below) on one company also
reuses the naming convention and scenario-comparison pattern already
established for real estate (see "Deterministic risk analysis" above), and demonstrates what
this app actually does — how assumptions move an output for a fixed business — better than an
apples-to-oranges cross-company comparison would.

**Costco was the preferred candidate, and item 3's validation (2026-08-31) confirmed it.** It
fits the current flat-growth model reasonably well — a single, well-understood business,
historically stable growth, no segment-blending problem the way a multi-segment conglomerate
would have — but was untested territory for `sec_fundamentals.py`'s extraction pipeline,
which had only been validated against AAPL, CAT, and WMT. Item 3 existed specifically to
confirm, not assume, that Costco's real SEC data maps completely and that the resulting
historical UFCF series is clean enough to be pedagogically useful — not distorted by unusual
working-capital or CapEx timing — before committing to it.

Run live against the deployed production API, not a local fixture: all 5 years map with zero
`fallback` to Alpha Vantage anywhere — every field is `reported`, `combined` (cash and total
debt, both sensible, non-overlapping components), or `calculated`, a cleaner result than
AAPL/WMT's own original validation runs. Revenue, D&A, and CapEx all grow smoothly year over
year; operating margin holds in a tight 3.4–3.8% band throughout, itself a legible teaching
point about the wholesale-club business model. One real, non-disqualifying pattern: FY2022
unlevered FCF dips to roughly half the surrounding years' margin, traced by hand back to a
genuine year-over-year swing in change-in-NWC (a large retailer's working-capital cycle, not
a mapping defect) - confirmed by re-deriving UFCF manually from the reported EBIT/tax/D&A/
CapEx/ΔNWC components. It doesn't touch the most recent year (FY2025, the likely demo base
year) and is itself explainable via this milestone's own provenance UI, so it did not trigger
reconsidering the candidate.

**Demo mechanics, decided in advance and shipped as decided (2026-08-31):** the three cases
never touch `localStorage`, never as persistent saved scenarios. The entry point was later
consolidated (2026-09-01): a full-sized "Costco Demo" disclosure button in the header,
replacing the DCF module's old synthetic "Load Example" outright rather than sitting beside
it, activates the demo on first use and thereafter only opens/closes the disclosure - case
selection itself moved to result tabs under Valuation Summary, not the button or the
disclosure panel. See "DCF demo-entry consolidation" below for the full design. Every
case's results are calculated live
through the real `/api/dcf/valuation` engine from frozen inputs, never hardcoded — verified
via the network log (loading a case makes zero `/api/company` requests; "Run Valuation" still
POSTs to the real endpoint) and via the resulting numbers, a clean monotonic spread across
the three cases ($335.59 / $395.69 / $464.96 per share) rather than anything that could have
been hand-typed to look plausible. WACC (7.5%) and terminal growth (2.5%) stay constant
across all three cases; only explicit-period FCF growth varies (4% / 8% / 12%) — the clearest
possible story for what's being demonstrated, stated in a plain-language line in the panel
itself so a nontechnical viewer knows what changed and what didn't, with a more elaborate
multi-variable version left as a future option rather than the default.

**Reference price sourcing hit its own contingency: Alpha Vantage was unavailable when the
snapshot was built,** which the original "Revised DCF sequence" entry above didn't have to
resolve at planning time. Per the standing rule that an invented number is worse than an
honest gap, the price instead comes from a named, dated, single-sourced third-party close
(stockanalysis.com's historical price table, $943.88 as of 2026-08-31) — read directly from
the rendered page, not summarized through a fetch tool (an earlier attempt via a
markdown-conversion fetch tool produced two different numbers for the same page across two
calls, which is exactly the kind of unverifiable source this rule exists to reject). The
frozen `CompanyProfile.reference_price`/`reference_price_as_of` fields are left `null` in the
snapshot itself (accurately reflecting what SEC EDGAR and Alpha Vantage actually returned);
the demo applies the stockanalysis.com price as a separate, explicitly-labeled constant,
never presented as if either provider had supplied it.

**Disclosure is not optional.** The frozen financial period, the reference price's "as of"
date, the data sources, and the fact that this is a demo (not live data) must all be
prominent and visually distinct from how the live ticker-search experience presents current
data — a viewer must never be able to mistake a frozen snapshot for something current.
Implemented as an amber "⬤ Embedded demo snapshot · not live data" label in the company bar
(reusing the palette's existing "fallback" amber — already the color for "worth a second
look, not a plain live fact") plus the full source/date breakdown in the demo panel itself;
loading a real ticker afterward clears both immediately.

**Valuation gaps get neutral, not candidate-specific, framing.** Any gap between the model's
implied value and the reference price is presented with fixed, direction-agnostic language —
the difference reflects the model's selected assumptions and simplified flat-growth
methodology, not an investment recommendation — decided before the actual numbers are known,
not a bespoke explanation for why the candidate specifically looks over- or undervalued. A
company-specific defense would read as the tool excusing its own result and would edge toward
commentary on a real company, which this app's "arithmetic only, never a recommendation"
principle (see "Implied upside/downside" above) is meant to avoid.

This framing turned out to matter in practice, not just in principle: all three Costco cases
imply a value approximately 51-64% below the $943.88 reference price ($335.59-$464.96 vs.
Costco's real market price - 64.4% for Low Growth, 58.1% for Base Growth, 50.7% for High
Growth). This is a genuine, expected consequence of a 5-year flat-growth DCF at
ordinary assumptions (7.5% WACC, 8% base-case growth) applied to a stock the market prices at
a large quality/compounding premium (roughly 50x earnings) - not a sign the assumptions,
the data, or the reference price are wrong. Nothing was adjusted to narrow this gap; doing so
to make the numbers "look right" against the market price would have defeated the entire
point of a deterministic, non-recommendation tool.

## Historical trend mini-charts
**Status:** Accepted

A small, self-contained insertion ahead of reverse DCF - proposed and evaluated on its own
merits (analytical usefulness, implementation scope, accessibility, responsive layout, print
behavior, risk of scope creep) before being built, not assumed onto the roadmap. Two compact
CSS bar charts (Revenue, Unlevered FCF) in `HistoricalTrendCharts.jsx`, rendered inside
`CompanySourcedData.jsx` whenever at least two historical periods are loaded - the same
`periods` array already on `companyData` for a live ticker load or the embedded Costco demo,
so there is no new network request and no backend change.

**No chart library, matching the existing convention.** `ValueBridge.jsx` and the
sensitivity heatmap already establish this app's pattern of small, purpose-built CSS
visualizations rather than a charting dependency. The trend charts follow the same rule:
every bar position is a CSS percentage set inline by the component, height is fixed in px,
so the chart is fluid at any width (the narrow desktop Step 1 column and the wider
single-column mobile layout both just work) without a breakpoint of its own.

**Two independent scales, not a dual-axis chart.** Revenue and Unlevered FCF differ by an
order of magnitude; a shared scale would flatten UFCF into a nearly straight line. Each
metric gets its own chart with its own min-max range label, and the two charts share one
fiscal-year label strip below them (periods are newest-first from the API; the component
reverses them once so every consumer reads oldest-to-newest, left to right).

**Positive, negative, zero, and missing values are each handled explicitly, not defaulted.**
The domain always includes zero (`Math.min(0, ...usable)` / `Math.max(0, ...usable)`), so a
positive bar grows up from a visible baseline and a negative bar grows down from it - this
is what makes the real Costco FY2022 UFCF dip (and any future negative-UFCF company) legible
at a glance rather than needing the reader to compare raw numbers. An exactly-zero value
still renders a small visible tick at the baseline (a real reported zero is real data);
a missing (`null`) value renders no bar at all, not a zero-height one - the two must not
look the same, and only the `null` case is silently absent. Verified against the real
5-year Costco series (the FY2022 dip is now visually obvious) and against a synthetic
mocked series covering positive, negative, and missing values in the same 5-year run,
confirmed by hand-checking the resulting bar geometry against the domain math, not just
eyeballing the screenshot.

**A metric with fewer than two usable values falls back to text, per metric, not
all-or-nothing.** A single bar (or none) isn't a trend, and a chart implying one would be
misleading - `MiniBarChart` checks its own metric's non-null count independently, so
Revenue can still render a real chart even if UFCF doesn't have enough history, and vice
versa. Verified with a synthetic company carrying only one non-null UFCF value: Revenue
chart rendered normally, UFCF fell back to "Not enough history to chart."

**Not hover-only.** Each chart's container carries `role="img"` and a real `aria-label`
summarizing the full year/value sequence (e.g. "Unlevered FCF by fiscal year: 2021 $4.66B,
2022 $2.81B, ..."), independent of the per-bar `title` tooltip used for the exact figure on
pointer hover. The bars themselves are `aria-hidden`, so assistive tech reads the one
summary rather than a set of unlabeled generic elements.

**Print needed a fix the rest of the workspace didn't.** The sensitivity heatmap already
established that this app's `--accent`/tint-based colors go "near-invisible against
printed white" and print.css's existing fix is to drop the tint entirely, since the cell's
own number still carries the value on paper. A bar chart doesn't have that fallback - the
bar's fill *is* the data, so losing it silently would make the chart look broken, not
gracefully degraded, in print. Two changes instead: `print-color-adjust: exact` (plus the
`-webkit-` prefix) so the fill reliably survives a browser's default "background graphics
off" print setting, and the fill itself is forced to solid black for both positive and
negative bars in print - the same fix already used for `.value-positive`/`.value-negative`
(color, not the semantic token) - relying on baseline position, not color, to distinguish a
negative bar on paper, exactly as the on-screen version already requires. Text and border
colors that use dark-mode-aware tokens (`--text-h`, `--text`, `--border`) also needed the
same explicit `#000`/`#444`/`#ccc` print overrides already applied elsewhere in `print.css`
(company bar, kv-list, sensitivity legend) - the same near-invisible-when-printing-from-
dark-mode issue this project has hit and fixed multiple times before.

## Source Details inspector: bounded, friendly-first provenance detail
**Status:** Accepted

Replaced the "Sources" panel's unbounded field-by-field dump with a bounded (~340px),
internally-scrolling inspector: a sticky header, a dynamic status summary ("4 reported · 3
calculated") in place of a static legend that named every possible status regardless of
whether this company actually had one, and compact per-field rows that expand individually
rather than showing every field's full metadata at once.

**Friendly-first, technical-second is a new content-ordering principle**, applied here and
to the existing 5-year history cell popover via a shared `ProvenanceDetailRow`: source,
fiscal period, form, and a "View filing" link render prominently; the raw XBRL
tag/accession/filed-date renders smaller and muted below it, never instead of it. A
"combined" field's components collapse into one friendly line (every tag folded into one
technical line) when they share a single filing - verified as the common real-world case
(Costco's cash/total-debt components) - and fall back to one line per component only when a
field's pieces genuinely come from different filings.

**Focus management follows the app's existing disclosure-toggle convention, not a modal
pattern:** opening the panel does not steal focus into it, consistent with the History and
Costco Demo toggles; closing it explicitly returns focus to the "Sources" button, so a
keyboard user never loses their place.

## DCF demo-entry consolidation and the one-run, three-tab case model
**Status:** Accepted

The DCF module's synthetic "Load Example" (a hardcoded, anonymous set of assumption values
with no company behind it) is removed outright, not left alongside the Costco demo - once a
real, fully-sourced, multi-case demo existed, a fabricated placeholder added no value and
was arguably worse: an analyst could mistake plausible-looking round numbers for a real
company. Real estate's own "Load Example" is a different, unrelated feature (a believable
CRE deal, not a placeholder) and is unaffected.

The two-tier entry point - a subtle "Costco Demo" text toggle plus, separately, a full-sized
"Load Example" button - is consolidated into one full-sized "Costco Demo" disclosure button
in `CompanyHeader.jsx`, occupying "Load Example"'s old position. The first click activates
the demo (loads the frozen snapshot and Base Growth's assumptions, opens the disclosure);
once Costco is already the active company, the same button only opens/closes the
disclosure - it never re-triggers activation and never resets whatever's already loaded or
calculated, whether that click opens or closes it.

**Cases are Low Growth / Base Growth / High Growth (4% / 8% / 12%, unchanged from the
original Downside/Base/Upside), and case *selection* moved from three buttons inside the
disclosure panel to three genuine WAI-ARIA result tabs under Valuation Summary.** The
disclosure panel itself is now purely informational - no case buttons, no per-case
description text. Case ids were renamed to match (`low`/`base`/`high`, not
`downside`/`upside`) so a maintainer never sees a display name and an internal id that
disagree.

**One click of Run Valuation calculates all three cases**, via three parallel calls to the
same `/api/dcf/valuation` (plus best-effort `/api/dcf/sensitivity`) endpoints a single run
already uses - no backend change. `Promise.allSettled`, not `Promise.all`, specifically so
one case's failure is recorded independently and is never silently represented by a sibling
case's result (`reconcileDemoResults` in `demoCaseLogic.js`, unit-tested for exactly this -
a rejected case gets `{results: null, sensitivity: null, error}`, never a neighbor's data).
Switching tabs afterward is a pure view change - zero requests, confirmed via the network
log - and swaps the complete case-specific result set (headline value, implied difference,
warnings, sensitivity, value bridge, forecast schedule) by construction: every result-
rendering, CSV, and print consumer in `DcfValuation.jsx` reads one derived
`activeResults`/`activeSensitivity`/`activeError` (the active tab's own outcome in demo
mode, the ordinary single-run state otherwise), so none of that existing rendering code had
to be duplicated or made demo-aware itself.

**FCF growth rate is the one case-specific assumption; every other field is shared across
all three cases**, exactly as the original three-button design already established - only
now that distinction needs to be stated explicitly, since a tabbed UI invites the assumption
that everything shown is per-tab. A note under the field says so. Editing a shared field
(WACC, terminal growth, forecast period, net debt, shares, base year UFCF) while any tab is
active affects the calculation for all three cases; editing FCF growth rate writes only into
that tab's own stored value (`demoCaseGrowth`), never the others'.

**Any edit to a field the engine actually reads invalidates the retained three-case results
- they stay in state (never wiped) but render a "please rerun" notice, and CSV/Print/
Analysis Outputs are hidden until a fresh run clears it,** so a stale calculation can never
be exported, printed, or mistaken for current. Editing the reference price/date is
deliberately excluded from this - it never reaches the valuation engine, and the implied-
upside comparison it feeds is already recomputed live on every render regardless of
staleness. The stale flag is cleared only after the fresh results are actually installed,
not when the rerun starts - clearing it early would let the previous run's numbers (still
sitting in state) read as current for the whole duration of the new fetch. A "Calculating
all three cases…" notice, and the same CSV/Print/Analysis Outputs hiding, cover that window
too - including a rerun of results that were never stale in the first place, since nothing
stops an analyst from clicking Run Valuation again just to confirm.

**Saving a scenario captures only the active tab's visible assumptions** (verified live:
saving while Low Growth was selected produced a saved `fcfGrowthRate: "4"` alongside the
shared sourced fields) - a natural consequence of `form.fcfGrowthRate` already following the
active tab, not special-cased scenario logic. Loading a saved scenario or a live ticker
exits three-case demo mode entirely and returns to the ordinary single-valuation workflow,
same as it already did before this redesign.

**CSV exports name their case.** The numbers alone don't say whether they're Low, Base, or
High Growth, so a demo export adds `Case`/`FCF Growth Rate (%/yr)` rows and uses a case-aware
filename (`costco-low-growth-dcf.csv`, etc.) - both derived from the same active-tab state
everything else already reads, not a separate lookup. Live-ticker/manual exports are
unaffected; the extra rows and filename only appear in demo mode.

## Cross-company stale-input fix (Base Year UFCF, Net Debt, Diluted Shares, Base Year Revenue)
**Status:** Accepted

`loadCompany` built its sourced-field patch with `baseYearFcf`/`netDebt`/
`dilutedSharesOutstanding` set only inside `if (value != null)` guards, so a company missing
one of those fields (confirmed live with EOSE, whose latest `unlevered_fcf` is `null`) meant
the key was never in the patch object at all - `{...prev, ...sourced}` had nothing to
overwrite the *previously loaded* company's figure with, so it silently survived, unbadged.
`referencePrice` already avoided this by always setting all five of its own keys, to a real
value or `''`.

Fixed with a pure `companyDataToSourcedFields` helper (`frontend/src/features/dcf/
companyDataToForm.js`) that always returns every key - the real value, or `''` - so the merge
always replaces. `fieldBadgeType` (also extracted, as a pure `sourceableFieldBadgeType`) is
corrected alongside it: a blank field shows no badge, and a non-blank analyst-entered value
with no sourced value for this company reads "Analyst Input," never "Sourced" - mirroring
`referencePriceBadgeType`'s existing treatment of an unsourced price. 11 regression tests on
the two pure helpers, chosen deliberately over a component-testing dependency this project
doesn't otherwise have; live-verified (AAPL → EOSE → AAPL) that the fix holds and that
analyst-only assumptions (WACC, etc.) are untouched by any company load.

Driver-Based DCF's own Base Year Revenue field (see below) was built on this corrected
mechanism from the start, not retrofitted afterward.

## Driver-Based DCF (v1)
**Status:** Accepted

A second forecast-entry mode alongside Quick DCF - not a replacement. Reached over three
rounds of design review before implementation began (a Consultant Brief, an external-review
verdict brought back by the user, and a final consolidated design with explicit
implementation guardrails); several of the decisions below reversed or sharpened something
proposed in an earlier round.

**One shared valuation engine, two forecast-entry modes.** `_compute_dcf_core(fcfs, wacc,
terminal_growth_rate, net_debt, diluted_shares_outstanding)` is the only place discounting,
terminal value, enterprise/equity value, and value per share are computed - Quick DCF's
`_compute_dcf` (via `project_fcf`) and Driver-Based's `_compute_driver_dcf` (via
`project_driver_years`) both build an annual UFCF schedule and hand it to this one function,
rather than each valuing its schedule its own way. A pure refactor of the pre-existing
`_compute_dcf`, verified as a no-op against all 153 pre-existing backend tests before any new
code was added.

**Per-year drivers, not one constant applied to every year.** The alternative (type once,
apply to the whole forecast) was rejected during design review: a constant-driver schedule is
close to algebraically equivalent to Quick DCF's own flat FCF growth, and wouldn't justify
Driver mode's added complexity. Entry effort is kept low with a "type once, override any
year" broadcast column instead (a one-time action, not a live-bound default - a later
individual edit is never fought or overwritten by an earlier broadcast).

**Cash tax = `max(EBIT, 0) × tax_rate` - no NOL carryforward.** A loss year owes no cash tax
but earns no future benefit from it either. A real, disclosed limitation (understates value
for a name with a near-term loss followed by a rebound), not a hidden simplification -
disclosed in both the UI methodology text and `MODELING_CONVENTIONS.md`. Deferred: modeling
actual NOL carryforwards.

**No hard economic bounds on any driver value, matching this project's existing Financial
Validation Principle exactly.** An earlier draft schema hard-bounded `tax_rate` to `[0, 1]`
and `da_pct_of_revenue`/`capex_pct_of_revenue` to non-negative - removed during design review
as inconsistent with the project's own standing rule (compute finite results, warn on
economically unusual assumptions, block only genuine computational failure), since none of
those bounds are required for the arithmetic to stay finite. Base Year Revenue's floor was
removed for the same reason, a deliberate divergence from Quick DCF's own `base_year_fcf:
gt=0` this record makes explicit rather than leaving as a silent inconsistency. A new
`driver_warnings` collection (year/id/tier/explanation, always present in `DriverDCFResults`,
rendered visibly in the UI and in CSV export) replaces the removed hard bounds: tax rate
outside 0%-100%, negative D&A/CapEx percentage, non-positive Base Year Revenue, a
forecast year whose revenue comes out zero or negative, and a final forecast year whose UFCF
is zero or negative (see the terminal-year warning below).

**A non-positive final-year UFCF raises an `extreme` warning rather than being blocked or
passed over in silence.** Found in closeout review, and the mirror image of this file's own
standing lesson: there, economic judgment was dressed up as computational necessity; here, a
structurally incoherent but perfectly computable case was getting no scrutiny at all - the
other error the Financial Validation Principle names. Because the Gordon Growth terminal value
is taken from the final explicit year alone, a final year at or below zero yields a zero or
negative terminal value and usually a negative enterprise value, while the sensitivity grid
can read backwards against its low-to-high tinting. The grid's two axes are not equally
affected - the terminal-growth axis always inverts for a negative final-year UFCF, whereas the
WACC axis only inverts once the negative terminal value outweighs the explicit period's own
positive present values (verified: a final-year UFCF of -2 against four positive years leaves
WACC behaving entirely normally). The warning is worded to say direction *may* become
counterintuitive for exactly this reason, and `MODELING_CONVENTIONS.md` carries the per-axis
detail. Reproduced with an entirely ordinary reinvestment-heavy
forecast - 25% revenue growth, 5% EBIT margin, 25% tax, D&A 4% of revenue, CapEx 12%, NWC
investment 15% of Δrevenue - where every individual driver sits in a normal range, so no other
warning fired: -$28.25 per share on a -3,489 terminal value, with `driver_warnings == []`.
Quick DCF cannot reach this state (`base_year_fcf: gt=0`, and sub--100% growth is already
covered by `fcf_growth_warnings`), so the gap was specific to Driver mode. Keyed off the
computed final-year UFCF rather than any individual driver, since no single driver determines
the sign of the net of NOPAT + D&A - CapEx - ΔNWC.

**A blank driver cell is a missing assumption, not a 0% one - completeness is enforced
separately from plausibility.** Also found in closeout review. `Number('')` is `0` in
JavaScript, so a blank cell reached the API as a deliberate 0% assumption; the live run path
was guarded by per-cell `required` attributes, but `ScenarioManager` saves whatever is on
screen (deliberately - a half-built idea is worth keeping), so a partially-filled draft could
be saved and later compared, valued with tax/D&A/CapEx/NWC all at 0% (i.e. UFCF = EBIT) and
presented as a legitimate result that compared *higher* than a complete Base case - in the one
view with no schedule on screen to check it against. Fixed with a pure `driverInputsError`
helper used by both Run Valuation and scenario comparison, which reject incomplete inputs
with a message naming the missing fields and make no valuation request; comparison rejects per
scenario, so the valid scenarios in a selection still compare normally. Deliberately *not*
fixed by restoring a backend bound - the removed bounds were correctly removed, and this is a
different question. A genuinely entered zero ('0', '0.0', '-0') stays valid in every field;
only blank, whitespace-only, and non-numeric entries are rejected, and whether an entered
value is computationally acceptable remains the backend's decision. Drafts remain saveable.

The check covers **every field `buildDriverPayload` converts**, not just the driver table:
Base Year Revenue, all six drivers per forecast year, and the four shared assumptions (WACC,
Terminal Growth Rate, Net Debt, Diluted Shares Outstanding). The shared ones turned out to be
the more dangerous half - a blank driver cell at least yields an odd-looking schedule, whereas
a blank Terminal Growth Rate coerces to 0% and a blank Net Debt to $0, both of which the
backend accepts as perfectly valid inputs, so nothing downstream ever objects and the analyst
gets a confident wrong number instead of an error. Confirmed reachable: with Terminal Growth
left blank, native `required` correctly blocks Run Valuation, but `ScenarioManager` still saved
a scenario carrying `terminalGrowthRate: ''`, which comparison would then have valued at 0%.
`buildDriverPayload` now enforces the invariant itself (throwing on incomplete input) rather
than relying on every caller remembering a separate pre-check; callers still pre-check so they
can surface the message in their own UI before firing anything. Shared fields are listed ahead
of per-year cells in the message so they stay visible under its five-item cap.

`ScenarioComparisonTable` was changed alongside this to show each failing scenario's own
reason rather than a shared "these inputs may no longer be valid" sentence - without it the
rejection was correct but silent about its cause. Shared with Quick DCF, whose comparison
failures now also show their specific reason.

**The tax row is labeled neutrally as "Tax Rate," not "Cash Tax Rate."** Its Last Actual cell
is the *book* effective rate (income tax expense ÷ pre-tax income), while the
forecast rate is applied to positive EBIT as a cash-tax proxy. Applying an effective rate to
EBIT is standard UFCF practice and is internally consistent with this app's own historical
UFCF field, so the methodology is unchanged - but a "Cash" label sitting directly beside a
book figure invited copying one across as the other, which overstates cash taxes whenever net
interest expense is material (EBIT 1,000, interest 300, tax expense 175 → the row shows 25%,
which applied to EBIT is 250 against ~175 actual). Resolved with the neutral label plus
explicit UI copy on how the two relate, not by changing what is computed. The copy states that
the two are different measures that can differ for a given company, and frames Last Actual as
context for the analyst's own judgment - deliberately avoiding any claim about how *close* they
typically are, which this project has no basis to assert.

**Revenue-sign warnings are computed per year from the actual schedule, not inferred from a
growth-rate threshold - and deliberately do not reuse Quick DCF's "alternating sign"
wording.** Caught during the final design pass: Quick DCF's single flat rate, exponentiated,
produces a genuinely predictable alternating-sign pattern below -100% growth. Driver mode has
no such guarantee - each year has its own independent rate, so a later year's sign depends on
that year's own rate applied to whatever the prior year's revenue actually was. Two distinct,
precisely worded cases instead: revenue hitting exactly zero is a permanent lock (flagged
once, at the year it first happens, since 0 × any finite rate is still 0 - every later year
is a mechanical consequence, not a new event); revenue going negative is a one-year event
whose sign in later years genuinely depends on their own rates, stated as such rather than
implying any pattern. Verified with a case that goes positive → negative → more negative
under a perfectly ordinary +20% second-year rate, specifically to prove no alternation is
assumed.

**Base Year Revenue is sourced/adjustable, in the Driver Schedule Builder's header, using the
same corrected replace-or-clear mechanism as the cross-company stale-input fix above** (an
extra return value on `companyDataToSourcedFields`, not a parallel implementation).

**The "Last Actual" reference row is read-only context, never a forecast input, and every
cell is independently guarded against fabrication.** Shows what the two most recent sourced
periods imply for each driver (including the effective tax rate SEC/Alpha Vantage already
compute); a missing required value or a zero/non-finite denominator (e.g. zero prior revenue,
zero Δ Revenue) renders `n/a` for that one cell, never `0/0`, `Infinity`, or a fabricated
number, and never corrupts a sibling cell. The underlying sourced field is `change_in_nwc` - a
dollar *flow* (the period's change in net working capital, already labeled "Δ NWC" in Sourced
Historical Data) - deliberately distinguished in both code comments and UI copy from the
balance-sheet NWC figure the Unlevered FCF formula's own components describe, after an
earlier design draft's wording risked conflating the two.

**Full-width layout, not squeezed into the narrow Assumptions column.** `DriverScheduleBuilder`
renders above the three-column `analytical-row` grid - the same full-width-panel slot
`CostcoDemoPanel` already established - so it stays legible and horizontally scrollable
(verified at the full 15-year forecast length) rather than cramped into a ~320px column.

**Mode switch is an explicit reset, never a stale flag.** Verified live: switching
Quick→Driver→Quick clears Valuation Summary back to "Run a valuation to see results here" at
every switch (never shows a stale number from the other mode, even briefly), while
analyst-only shared assumptions (WACC, terminal growth, etc.) survive both switches untouched
- confirmed by typing a WACC value, switching modes twice, and reading it back unchanged.

**Reverse DCF and Explain This Valuation needed zero Driver-specific code.** Reverse DCF stays
Quick DCF-only (a multi-driver forecast has no single scalar to solve a reference price
against) - Driver mode shows explanatory copy in its place. `explainValuation.js`'s
terminal-value-share and sensitivity-range observations already gated only on generic
`enterprise_value`/`pv_terminal_value`/`value_per_share`/sensitivity-grid fields
`DriverDCFResults` shares with `DCFResults`, and its price-implied-growth observation already
gated only on `showReverseResult` (which Driver mode never sets) - confirmed by a dedicated
test asserting the existing function returns exactly the two applicable diagnostics for a
Driver-shaped input, with no new branch added to make that true.

**Saved scenarios carry a `forecastMode` discriminator; comparison is single-mode in v1.** A
scenario saved before Driver mode existed has no such key and loads as Quick DCF, the same
missing-key-defaults-safely pattern used elsewhere in this app (e.g. reference-price status
recovery). Selecting scenarios that mix Quick and Driver-Based for comparison shows an
explanatory message instead of a table - verified live with one scenario of each mode
selected together.

**Live-ticker Low/Base/High case management is explicitly out of v1 scope; Costco's demo and
tabs are unaffected.** The Driver-Based mode toggle is disabled while viewing the Costco demo
(and the Costco Demo button is disabled while Driver mode is active), with an explanatory
title on each - verified live. A saved driver scenario's `data` shape (forecast mode plus
`driverForm`) is already what a future "copy Base into analyst-edited Low/High cases"
workflow would clone, confirmed as a design property rather than built now.

**Terminal year uses the schedule's own final explicit year as-is - not framed as "D&A
converges with CapEx."** An earlier design draft's roadmap wording named that convergence as
the implied eventual correctness target; corrected before implementation to name the actual
open question instead - sustainable terminal margins and reinvestment economics - without
declaring any particular refinement (D&A/CapEx convergence among them) as "correct."

**Verification.** Backend: the pre-existing 153 tests re-verified unchanged after the
`_compute_dcf_core` refactor, plus 37 new tests - a hand-calculated 3-year fixture (computed
independently before any driver code was written, then locked in as an exact-to-the-cent
assertion), a negative-EBIT year under the no-NOL convention, non-finite-intermediate
handling (mapped to the same clean 422 Quick DCF already uses), and the full `driver_warnings`
matrix, including the terminal-year check across a positive, an exactly-zero, and a negative
final-year UFCF, and an interior-dip case confirming it reads the final year rather than any
earlier one - 190 backend tests total. Frontend: 39 new pure-function tests
(`driverSchedule.js`, extended `companyDataToForm.js`) plus the `explainValuation.js`
shape-compatibility test above - 94 frontend tests total, all green. The completeness tests
cover blank versus genuinely-entered zero in every field - including dedicated cases for a
blank Terminal Growth Rate and a blank Net Debt, the two silent-zero cases the backend would
otherwise accept - `buildDriverPayload`'s own throw, and the comparison guard against the
saved-scenario shapes `handleCompare` actually feeds it; the React wiring around that
predicate is not itself covered, this project having no component-testing dependency.

Live-verified after these corrections: the terminal-year warning renders as `EXTREME` on the
final year while still returning its (negative) valuation rather than blocking; a scenario
saved with a blank Terminal Growth Rate is rejected in comparison with the message naming that
exact field, with the network log confirming no valuation request was made for it while the
complete scenario in the same selection still valued normally. Live dev-server verification covered the full workflow: AAPL
loaded and sourced into Driver mode, forecast length resized from 3 to 15 years (table stayed
scrollable throughout), broadcast-then-override on a real field, a driver warning triggered
and read back correctly (tax rate 150%), CSV export inspected directly (full driver
breakdown, sensitivity grid, warnings), scenario save/load round-tripping `forecastMode` and
`driverForm` correctly, a legacy no-`forecastMode` scenario loading as Quick DCF, mixed-mode
comparison blocked with the exact message, and the Costco demo's Base Growth case
reproducing its known $395.69 value unchanged.
