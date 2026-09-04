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
2020 and 2025; Caterpillar never adopted the modern revenue tag at all). Three fields required
an explicit methodology decision rather than a mechanical mapping (**D&A** was the third, added
2026-09-04 — see "SEC D&A: component summation for filers with no combined tag" below):
**cash** sums
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
workflow would clone, confirmed as a design property rather than built now. **Superseded in
part:** the mutual Quick/Driver lockout described above was reversed by "Costco demo: a
provider-independent Driver Base Case" below - the demo is no longer Quick DCF-only. The
Low/Base/High tabs themselves, and live-ticker case management generally, are unaffected by
that change and remain exactly as described here.

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

## Driver-Based DCF (v2): evidence-led forecast entry
**Status:** Accepted — extends, and in two places corrects, "Driver-Based DCF (v1)" above.

v1 shipped a correct engine behind a wall: at a ten-year forecast the panel presented sixty
empty required cells above six "Last Actual" cells, and produced nothing at all until every
one was filled. The engine, warnings, completeness rules and shared valuation core are
unchanged by this milestone — every change is input-side. Reached from a written critique and
design proposal reviewed before implementation began; the user's decisions on it are what the
scope below reflects, and three of them narrowed the proposal rather than accepting it.

**The evidence the app already held was withheld at the point of decision.** Five sourced
fiscal years were being rendered in dollars in the history panel, while every driver row asked
for a *ratio* and showed exactly one. The fix is per-driver evidence on the row itself — every
usable observation plus one normalized reference statistic — which is also what makes the
blank grid stop being the first thing the eye lands on. Deliberately no standard deviations or
confidence intervals: at most five observations, those would assert a precision the history
cannot support, and this is the same class of overreach as the historical price-correlation
idea rejected below.

**A finding that shaped the design: flat drivers are geometric.** Holding all six ratios flat
makes every UFCF component proportional to revenue (ΔNWC_t = nwc% × revenue_t × g/(1+g)), so
UFCF_t = revenue_0 × (1+g)^t × K — the same *shape* Quick DCF's single flat rate produces. v1's
own record rejected a constant-driver engine on this reasoning; what it did not anticipate is
that the fastest path through v1's UI (broadcast six values, run) landed the analyst in exactly
the rejected state while charging six inputs for it. This is **not** a claim the two modes
produce the same valuation — Driver mode derives a normalized cash-flow level from revenue and
operating ratios, Quick DCF starts from a sourced base-year UFCF, so they differ by that level
even where the shape coincides. The precision matters: an earlier draft of this record said
"equivalent," which would have been wrong. Two consequences: revenue growth initializes in
**Fade**, not Flat, and the panel's own methodology disclosure states the relationship rather
than leaving the analyst to discover it.

**Seeding is a methodology choice with a material valuation consequence, so it is disclosed
per driver rather than defaulted.** On the Costco snapshot, Year 1 UFCF comes out $6.98B,
$6.14B or $5.73B depending only on whether NWC investment is seeded from the latest
observation, the median of the yearly ratios, or the aggregate ΣΔNWC ÷ ΣΔRevenue — a 22%
spread from one row's convention, against a $6.45B actual. Aggregate was chosen for NWC (a
ratio of two flows, where aggregating weights each year by how much revenue actually moved);
median for the other five (robust to a single acquisition or COVID year in a five-year window).
Full per-driver rules, exclusions and thresholds are in `MODELING_CONVENTIONS.md`.

**The NWC aggregate's denominator is checked before its ratios — a correction to the first
implementation.** The per-year 2% materiality floor screens each year individually and does not
stop two individually material years from nearly cancelling in ΣΔRevenue, which inflates the
aggregate without tripping the spread test, because the spread is compared against that same
inflated figure. Worked case now locked in as a regression test: +1000 revenue with +100 of
working capital (10.00%) then −990 with −80 (8.08%) — two ordinary same-signed ratios 1.9pp
apart, summing to 20 over 10, a **200% aggregate that the original code accepted as seedable**.
AT&T is the live instance: a −$13.3B year and a +$3.3B year leave $10.0B net against $16.6B
gross (60%), and the pre-check aggregate would have been **764%**. Fixed by refusing when the
annual revenue changes reverse direction, and separately when net cumulative change is below
90% of gross annual movements — and by reporting **no reference at all** in those cases, since
an inflated aggregate is not evidence and showing one invites the copy-across the refusal
exists to prevent. The second condition is implied by the first whenever the check runs
(same-signed deltas make |Σ| equal Σ|·|); it is enforced rather than assumed so the guarantee
does not rest on the sign test's implementation, and a test asserts the invariant across the
real and synthetic fixtures. A consistently falling revenue window is deliberately *not*
refused — direction must reverse, not merely be negative.

**Refusal is a first-class outcome.** Fewer than two usable observations never seeds; exactly
two seeds but is flagged thin; NWC investment additionally refuses on a sign change or a spread
exceeding twice its aggregate's magnitude. A refused row is left completely blank with its
reason stated and its observations still shown — never backfilled from the latest year, never
from zero. The existing completeness guard then blocks Run Valuation until the analyst fills
it, so no new blocking logic was introduced. Both real companies checked live refuse working
capital: Costco spans 14.4pp against a −3.26% aggregate, Apple −42.20 / −20.95 / **−312.39** /
+71.79. That −312% figure is what v1's "Last Actual" cell would have invited an analyst to
copy across, and is the clearest evidence that a single observation must never become a
forecast.

**Generated values are never silent and never permanent.** Initialize Forecast is explicit,
shows a plan naming each value and its basis before writing anything, and badges what it wrote
as **Seeded** — historical-derived starting points, not forecasts the application produces or
endorses. The badge clears on the first edit to that row.

**A company load clears the whole driver schedule unless the same company is positively
identified — two corrections to the first implementation.** The first pass cleared only rows still badged as
seeded, which is unsound at cell granularity: a Fade row can hold a historically seeded Year 1
value and an analyst-chosen final-year target at once, and editing either endpoint clears the
row's marker, so the *other* endpoint — still the previous company's median — would survive the
next ticker load unbadged. That is the cross-company stale-input bug recurring one level down.
Per-cell provenance would also close it, and was rejected as materially worse: it doubles the
state the schedule carries and must survive resizes, mode switches, fade regeneration and
scenario round-trips, each a place a marker can desynchronize from the value it describes, with
a stale figure presented as the analyst's own as the failure mode. A whole-schedule reset has
one rule, no per-cell bookkeeping, and fails safe.

The second correction inverted the default. The predicate initially preserved the schedule
whenever no previous ticker was known, reasoning that a schedule with no prior company cannot
be stale from anything. That is wrong: `loadScenario` restores a saved `driverForm` while
setting `companyData` to null, and a failed ticker lookup clears `companyData` while leaving
the schedule in place — so both leave a populated, unidentified schedule that the next
successful load would adopt under whatever company arrived. Preserving is now the exception,
requiring the company on screen to be positively the same normalized ticker; every other
successful load resets. The cost is that driver values entered before any company was loaded
are discarded, accepted knowingly: a figure valued against the wrong company is worse than
re-entering assumptions, and the reset is visible where the stale value was not.

Scope stays narrow — shared assumptions and saved scenarios themselves are untouched.
Confirmed live on all three paths. The Fade case: AT&T seeded, revenue growth's fade target
hand-set to 3% (leaving Year 1 at AT&T's 0.66% median, unbadged), then COST loaded — all 30
cells blank, six modes back to Custom, no seed badges, WACC and terminal growth intact. The
scenario case: a saved Driver scenario carrying distinctive values (11.11 / 22.22 / 33.33 /
4.44 / 5.55 / 6.66) loaded with no company identified, then COST loaded — all 18 cells blank
with no scenario value surviving, modes Custom, badges gone, the scenario itself still intact
in `localStorage`, and the scenario's own WACC 9% / terminal growth 2.5% / 3-year period
preserved. And the same-ticker case: a COST reload after seeding preserved the schedule, its
Fade/Flat modes and its seed badges.

**Terminal growth is not bound to revenue growth — a correction to the design proposal.** The
proposal recommended defaulting revenue growth's fade target to the Terminal Growth Rate field.
Rejected on review: terminal growth is perpetual *FCF* growth and is not required to equal a
terminal-year *revenue* growth rate, and a live binding between two independent fields would
make each mutate the other unexpectedly. What shipped instead is a clearly labeled one-time
"Use terminal growth as target" action that copies the value once; afterwards neither field
moves the other. Verified live: with the target copied at 2.5%, changing Terminal Growth Rate
to 1.5% left the schedule at 2.5%.

**Row modes are UI generators over the existing per-year array, not model state.** Flat, Fade
and Custom all write into the same `driverYears` the API has always received, so the payload,
completeness check, warnings, scenario save/load and CSV export are untouched — a seeded
schedule and a hand-typed identical one produce byte-identical payloads, which is asserted by
test. Fade interpolates linearly in the driver value; exponential and S-curve shapes were
rejected as modeling surface without corresponding analyst judgement. Custom is now positioned
as the advanced annual-schedule editor rather than the primary entry path, and is unchanged
behaviour. Forecast-length changes regenerate Flat and Fade rows from their pre-resize
endpoints (so a fade target survives a resize instead of flattening into a plateau) while
Custom rows keep v1's clone-the-last-year behaviour exactly, which is what preserves manual
overrides.

**Fiscal-year labels only where they are unambiguous — narrower than proposed.** The proposal
recommended deriving `FY<year>E` from the fiscal year-end's calendar year and disclosing the
convention. Narrowed on review to emit labels only for year-ends in June through December,
where the calendar year and the filer's own fiscal-year label agree essentially universally,
and to fall back to generic `Year 1…N` for January-through-May year-ends, where two large
retailers with near-identical January year-ends label the same fiscal year differently from one
another. A wrong fiscal-year label is worse than a generic one. Verified live: Costco (August)
labels FY2026E onward, Apple (September) likewise.

**Data quality is surfaced, not merely computed — a correction to the first implementation.**
Notes were gated on `reliability !== 'ok'`, which hid the tax cash-proxy caution precisely when
it matters: that caution is company-specific and fires on histories that are otherwise
perfectly reliable. AT&T is the live case — four usable tax observations, a reliable 19.89%
median, and a 12% pre-tax-versus-EBIT divergence that was being suppressed. Every non-null note
now renders, and each row additionally reports how many periods were excluded from its
statistic and why; AT&T shows one period with an undefined effective rate, five where CapEx is
not reported at all (so CapEx is unseedable for it), and two below the NWC materiality floor
with their actual revenue movements quoted. Silently shrinking a sample makes a thin reference
look better evidenced than it is.

**Observations carry visible fiscal-year labels, not tooltips.** Each value sits under a
two-digit fiscal-year-end label (’21…’25), matching the year strip the trend mini-charts
already use. A hover-only label is unreadable on touch, unreachable by keyboard and absent from
print, and a column of undated percentages is not evidence.

**The Forecast Drivers panel carries no step number.** It was badged "2" while rendering above
the column also badged "2" and above the column badged "1", producing a duplicated step number
and a visible 2 → 1 → 2 → 3 reading order. Fixed by removing the badge rather than renumbering
the workstation: the numbered sequence belongs to the three analytical columns, and this
full-width panel is a workspace for step 2's forecast inputs rather than a step of its own.
The smaller change also avoids making the numbering mode-conditional, since Quick DCF has no
drivers panel.

**Instructional density.** ~110 words of permanent instruction became one orientation line plus
a disclosure control. The full methodology stays in the DOM and prints unconditionally via the
existing `.no-screen` pattern, so nothing is lost from a printed or exported analysis — the
reduction is screen-only. Density falls further on its own: five of six rows now show one input
instead of N.

**Explicitly rejected, and recorded so the questions stay answered:**

- **Historical share-price / revenue-growth correlation, or a "revenue beta."** Four annual
  observations give two degrees of freedom, so any R² would be noise; prices respond to
  surprises against expectations rather than realised reported growth; "beta" already means
  covariance with the market in the cost-of-equity sense, so the label would read as a
  terminology error to this project's own audience; and the app holds exactly one dated price
  with no time series anywhere, so it would require a new provider — failing `CLAUDE.md` §7's
  bar for a statistic that is not credible in the first place. The honest version of this
  question is already shipped: Reverse DCF reports what growth the reference price implies,
  without asserting a statistical relationship.
- **A live forecast preview in the frontend.** The proposal suggested rendering revenue / EBIT
  / UFCF per year as drivers are edited, which would have required reimplementing
  `project_driver_years` in JavaScript. Rejected: the backend stays the sole authority on the
  projection arithmetic, and two implementations of one formula drift. The post-run forecast
  schedule remains where per-year cash flows are read. The one on-screen preview that did ship
  shows the *driver values* a row's mode generated — interpolated assumptions, not cash flows.
- **Driver sensitivity / tornado chart, and a Revenue Growth × EBIT Margin grid.** Genuinely
  valuable and a real gap (the existing grid is WACC × terminal growth only, so Driver mode's
  own drivers get no sensitivity treatment), but deliberately out of this milestone: fix the
  inputs before adding a sensitivity surface over assumptions the analyst did not trust
  entering. Moved to Later in `ROADMAP.md`.
- **AI-generated forecasts, consensus-estimate integration, segment-level forecasting, and
  Excel import** — out of scope, and the last three each require a data source or a modeling
  surface this project has not justified.

**Verification.** Backend: all 190 tests unchanged and passing — no backend file was touched.
Frontend: 169 tests (84 new across `driverHistory.test.js` and `driverForecastModes.test.js`,
plus the existing suite re-verified), lint and production build clean. The new tests cover
historical normalization and every exclusion rule, NWC reliability and refusal, Flat/Fade/Custom
generation, fade endpoints and intermediate years, manual-override preservation, one-time
rather than live binding, fiscal-year labels and fallbacks, forecast-length changes in both
directions, scenario save/load with and without the new keys, and payload identity between a
seeded and a hand-typed schedule. Live verification against the running backend and real SEC
data found one genuine crash that fixtures had not: with a company loaded before a Forecast
Period was set, the initialize plan was computed against a zero-length schedule and read
`driverYears[0]` of an empty array. Fixed in `buildBaseForecast` and covered by a regression
test. After the fix, the full workflow was verified live end-to-end: COST loaded from SEC
EDGAR; the plan listing five seeds with their bases and the working-capital refusal; apply;
the one-time terminal-growth target producing 7.46 → 6.22 → 4.98 → 3.74 → 2.5; a resize from
five to eight years re-interpolating to 7.46 → … → 2.5 with both endpoints intact; a
Driver-Based valuation returning $202.50 per share with its sensitivity grid; AAPL loaded over
that schedule clearing only the still-seeded rows; and Quick DCF's Costco Base Growth case
still returning **$395.69**, unchanged.

Two closeout correction passes then addressed six review findings before commit: the
whole-schedule cross-company reset and its inverted preserve-only-when-identified default,
the NWC denominator checks, unconditional rendering of
material notes, excluded-period disclosure, visible fiscal-year labels on observations, and
removal of the duplicated step badge — each recorded above at the decision it corrects. Live
re-verification after that pass used AT&T as the fixture, since it exercises four of the five
at once (a 12% EBIT/pre-tax divergence, unreported CapEx across all five periods, two
sub-materiality NWC years, and a direction-reversing revenue window), plus the
AT&T → COST → COST sequence and a saved-scenario → COST sequence for the reset rules, and a
final Quick DCF Costco Base Growth check at $395.69. Browser console clean.

## Costco demo: a provider-independent Driver Base Case
**Status:** Accepted — reverses the Quick-only restriction recorded in "Driver-Based DCF (v1)"
above.

v1 and v2 both left the Costco demo Quick DCF-only: the Driver-Based toggle was disabled while
viewing the demo, and the Costco Demo button was disabled while Driver mode was active. That
was a real product gap once Driver-Based DCF itself matured (evidence-led seeding, refusal
rules, Flat/Fade/Custom) - the app's own provider-independent demonstration could not show any
of it. This milestone extends the demo into Driver mode rather than replacing Quick mode's
Low/Base/High experience, which is untouched.

**The demo activates into whichever mode is already selected, and both modes' presets are
populated together on every activation.** `activateCostcoDemo()` no longer forces `forecastMode`
back to `'quick'`; it now also writes `driverForm` unconditionally from a new frozen constant,
`COSTCO_DRIVER_BASE_CASE` (`costcoDemo.js`), the same way it already writes `form` from the
frozen snapshot. Switching Quick ↔ Driver afterward is the ordinary, pre-existing mode switch
(an explicit reset of results only, never of input values - see "Driver-Based DCF (v1)"'s design
delta 5/guardrail 5) - no demo-specific plumbing was needed there, because each mode already
reads from its own already-populated state slice. The `CostcoDemoPanel` disclosure body is the
one thing that had to become mode-aware (a `forecastMode` prop selects which second paragraph
renders); the shared top paragraph - frozen data, no live lookup - is identical in both.

**`COSTCO_DRIVER_BASE_CASE` is computed once, at module load, from the same frozen
`COSTCO_COMPANY_DATA` and the same `driverHistory()`/`buildBaseForecast()` pipeline Initialize
Forecast uses for any live ticker - not a hand-typed schedule that could silently drift from
the accepted v2 methodology.** Five drivers seed exactly as they would for any company: EBIT
margin, tax rate, D&A and CapEx Flat at their historical medians (3.43% / 24.55% / 0.88% /
1.83%), and revenue growth Fade - but with its end target moved from `buildBaseForecast`'s
default (both endpoints at the historical median) to the shared 2.5% terminal growth rate, the
same one-time "Use terminal growth as target" action any analyst already has, giving
7.46 → 6.22 → 4.98 → 3.74 → 2.5. All five stay badged **Seeded**.

NWC Investment is the one deliberate departure. Costco's own working-capital history is
`unstable` (a sign flip - see "Driver-Based DCF (v2)" above) and `buildBaseForecast` correctly
refuses to seed it, exactly as it would for a live ticker - but a refused, blank required cell
would fail "immediately ready to run." Silently seeding a number the evidence does not support
would misrepresent it as historically reliable, which is exactly the "computationally
undefined" vs. "economically strange" conflation `CLAUDE.md`'s Financial Validation Principle
warns against. The row is force-set to an explicit **`-3.0% Flat`** demo assumption instead -
rounded and judgment-based, deliberately close to but not asserting the reliability of the
frozen history's own ~-3.26% aggregate - and is pointedly excluded from `seededFields`, so it
renders exactly like ordinary analyst-entered data (no Seeded chip) directly beneath its own
still-live `driverHistory()`-computed **Unstable** badge (the interactive popover from "Add
guidance for unstable NWC assumptions" - unmodified; nothing about that evidence is
special-cased for the demo). `CostcoDemoPanel`'s driver-mode disclosure names this explicitly.

**Leaving the demo resets the driver schedule even when the ticker matches.**
`shouldResetDriverSchedule`'s same-ticker-preserves rule is right for two live loads of the
same company (the evidence genuinely is unchanged), but wrong across the demo/live boundary: an
analyst who types COST and clicks Load Company while viewing the demo must not keep
`COSTCO_DRIVER_BASE_CASE`'s Seeded badges sitting on screen as if they were derived from the
live response that was actually just fetched. `loadCompany`'s reset condition is now
`isDemoSnapshot || shouldResetDriverSchedule(...)` - `shouldResetDriverSchedule` itself, and
every one of its existing guarantees, is untouched. Loading a *different* company while the
demo is active already resets unconditionally, the same way `activateCostcoDemo` always
overwrites `driverForm` regardless of what was there before.

**Rejected in scope:** a distinct third badge/color for the NWC row ("demo assumption," as
opposed to Seeded or unbadged). The existing vocabulary already says everything needed - no
Seeded chip plus a still-visible Unstable badge on the same row - and the disclosure panel
states the reasoning in prose; a fourth provenance color for one row in one demo was judged to
add chrome without adding information a careful reader doesn't already have.

**Verification.** No backend file touched; no new backend tests needed. Frontend: 20 new tests
(`costcoDemo.test.js` - `COSTCO_DRIVER_BASE_CASE`'s exact values, Flat/Fade shape, NWC excluded
from `seededFields`, completeness via `driverInputsError`/`buildDriverPayload`, and independent
re-derivation from `driverHistory()` matching it exactly; `costcoDriverDemo.test.js` - a
component-level suite mounting the real `DcfValuation.jsx` under a general JSX/CSS Node loader
built for this milestone, `frontend/src/testUtils/{registerJsxLoader,jsxLoaderHooks}.mjs`,
covering provider-independent activation from both modes with an explicit assertion that
`fetch` is never called against `/api/company/`, mode-switch preset isolation, the exact
Seeded/unstable provenance split, a deterministic `/api/dcf/driver-valuation` payload assertion,
and both state-isolation directions - a different company's schedule fully replaced on
activation, and a live same-ticker load resetting the demo's schedule rather than inheriting
its badges), plus the pre-existing suite re-verified - 198 total, lint and production build
clean. Live dev-server verification against the real backend: the demo activated directly from
Driver-Based mode with the network log showing only the two `/api/health` pings, zero
`/api/company` requests; the five-row Driver Base Case rendered with the documented values and
Seeded badges, NWC Investment showing `-3` with no Seeded chip beside its own Unstable badge;
Run Valuation returned **$263.25/share** ($109.08B enterprise value, $117.09B equity value, 79%
of enterprise value from terminal value) with a populated sensitivity grid, and correctly showed
"Not available in Driver-Based mode" for Price-Implied FCF Growth; switching to Quick DCF and
running Base Growth still returned **$395.69**, unchanged; switching back to Driver-Based
correctly cleared results to "Run a valuation to see results here" (the pre-existing v1
mode-switch-is-an-explicit-reset rule, unmodified) while the driver schedule itself - including
the `-3` NWC cell - survived the round trip untouched; and typing COST into the ticker search
and clicking Load Company while the demo was active fetched the live company, cleared every
Seeded badge, and blanked the schedule rather than inheriting it. Browser console clean
throughout.

## Driver-Based DCF: standardized ±1pp driver sensitivity (tornado)
**Status:** Accepted

The first sensitivity treatment of the Driver-Based mode's own drivers — until now the only
sensitivity surface was the WACC × terminal-growth grid, which tests two assumptions that
aren't drivers at all. Deliberately deferred out of the v2 input milestone on the principle of
fixing the inputs before adding a sensitivity surface over assumptions the analyst didn't trust
entering; scoped and built only once that had settled. Full methodology:
`MODELING_CONVENTIONS.md`'s "Driver-Based DCF: standardized ±1pp driver sensitivity (tornado)".

**Scope was bounded deliberately and held.** Sensitivity-cell adoption ("click a cell to load
those assumptions"), scroll-to-driver interaction, the history→forecast continuity chart, the
UFCF build-up waterfall, and the PV-composition stack were all proposed alongside this and all
explicitly excluded. One chart, one endpoint, one milestone.

**No charting library, and no shared charting layer either.** The no-library decision follows
the existing convention (`ValueBridge`, `HistoricalTrendCharts`, the sensitivity heatmap). The
second half is a correction to the original proposal, which had wanted a shared
`chartScale.js` primitive layer up front: that would have designed an abstraction from a single
instance, before knowing whether a tornado and a waterfall share any geometry — they largely
don't (a tornado is one band scale centred on zero; a waterfall is cumulative step arithmetic).
Geometry helpers live in `driverTornado.js`, chart-specific and unit-tested, and a common layer
gets extracted when a second chart proves what is actually reusable.

**Drawn as a real table with a bar column, not as a standalone graphic** — the same structure
the sensitivity heatmap uses. This is what makes "exact values without hover" and "a complete
accessible equivalent" the same artifact rather than two copies of the same numbers kept in
sync: every endpoint value, delta and newly-triggered warning is text in a cell, only the bars
are `aria-hidden`, and the whole thing survives print with its data intact.

An earlier draft additionally gave each row a visually-hidden summary sentence. That was
removed: the native table already exposes the row header, the tested-path summary, the column
headers and the cell values, so the extra sentence made assistive technology announce the same
figures twice. Semantic table structure *is* the accessible presentation here — a parallel text
equivalent is what you add when the visual is a graphic, and this one deliberately is not.

**Two half-height lanes per driver rather than one bar spanning endpoint to endpoint.** A
single spanning bar cannot represent two endpoints that fall on the same side of base — it
would either hide that or draw the two on top of each other. Each lane's direction comes from
the sign of its own delta, never from which endpoint it is.

**Ranked on the range across base and both endpoints, not the endpoint-to-endpoint distance.**
The same-side case that motivated two lanes also breaks an endpoint-only ranking metric: when
both endpoints land on the same side of base — and, at the `max(EBIT, 0)` kink, land on
*exactly the same value* — the endpoint distance collapses to zero and ranks a driver that
genuinely moved the valuation in both directions dead last. Including the base value in the
range (`max(base, -1pp, +1pp) - min(...)`) fixes that while being provably identical in the
ordinary straddling case, so it is not a silent re-ranking of normal companies; a test asserts
that equivalence explicitly. The API field is named `tested_range` rather than `span` so the
name describes what is actually measured.

**Lane labels sit in their own gutter, not over the plot.** Caught in live verification, not in
review: with the labels absolutely positioned at the track's left edge, any bar reaching the
far left of the scale covered the label naming it — which on the Costco demo meant the top
three rows. The lane is now a flex row (fixed label column + plot), and the track's zero line
is offset by the same gutter width to stay on the plot's true centre.

**The ranking's own distortion is disclosed rather than engineered away.** Live verification
against the Costco demo put D&A and CapEx at the top, ahead of five compounding years of
revenue growth, purely because 1pp is a ~113% relative move on a 0.88%-of-revenue driver. The
response was to show each row's tested path (`Flat 0.88% · tested -0.12% and 1.88%`) and state
the caveat under the chart — not to rescale the shift per driver, which would have replaced a
legible convention with an opaque one.

**A tested endpoint can be an assumption the engine itself warns about, and is marked rather
than clamped.** That same D&A row's −1pp endpoint is −0.12%, which `driver_warnings` flags as
`negative_da_percent` when typed in directly. Clamping it to zero would be a silent economic
substitution for a computationally well-defined input — the exact failure mode `CLAUDE.md` §6
names as recurring here — and would also falsify the "standardized ±1pp" claim.

The first draft treated the row's tested-path text (`Flat 0.88% · tested -0.12% and 1.88%`) as
sufficient disclosure and deferred anything more prominent to the roadmap. That was the wrong
call on this project's own §5 materiality test: this is not a contrived input but the ordinary
case for any company with D&A under 1% of revenue, it occurs on the flagship Costco demo, and
the flagged endpoint drives the chart's **top-ranked row** — so the headline result of the
visualization was being produced by an assumption the model itself would warn about, with
nothing but a parenthetical to say so. Each endpoint now returns its own driver warnings,
diffed against the base case's by `(year, id)` and grouped by id, and any newly introduced
warning is marked on that endpoint with tier, short name and affected years as visible text.
Diffing against the base matters in both directions: a warning the analyst's own inputs already
raise is never attributed to the shift, and one that newly *extends* to further years is still
caught.

**Rejected in scope:**

- **WACC and terminal growth as two more bars.** Mixing valuation assumptions with operating
  drivers in one ranked chart conflates two different questions, and ±1pp is a much larger
  economic move on WACC than on a driver. They keep their own grid; the chart carries a neutral
  pointer to it ("This ranking covers operating drivers only. WACC and terminal growth are
  tested separately in the grid below") that deliberately makes **no claim** about which moves
  value more.
- **Extending the tornado to Quick DCF.** Not because Quick's assumptions are covered elsewhere
  — they are not; the existing grid covers only WACC and terminal growth, so Quick DCF's flat
  FCF growth rate still has no sensitivity treatment of its own. The reason is narrower: this
  chart measures the six operating drivers, which exist only in Driver mode.

## Driver-Based DCF: two-way Revenue Growth × EBIT Margin sensitivity
**Status:** Accepted

The second sensitivity treatment of Driver-Based mode's own drivers, and the first that shows
two of them **interacting**. The tornado moves one driver at a time and structurally cannot
answer whether growth creates or destroys value, because that depends on the margin and
reinvestment the same schedule carries. Full methodology: `MODELING_CONVENTIONS.md`'s
"Driver-Based DCF: two-way Revenue Growth × EBIT Margin sensitivity".

**Sequencing was contested and settled on the roadmap's side.** An alternative order was
proposed — a history→forecast continuity chart and a PV-composition chart first, on the
argument that a further sensitivity surface had diminishing marginal value. That argument was
withdrawn: it counted the real-estate IRR grid as a competing DCF sensitivity surface, which a
DCF user never sees (the real DCF count was two, not four), and it reopened a decision the
roadmap had already settled without new material evidence, which is what `CLAUDE.md` §5
explicitly warns against. The two charts remain the agreed next milestone, reframed around the
user outcome — history → forecast → present value → enterprise value — rather than around the
bar geometry they happen to share.

**Uniform ±1pp steps on both axes, −2pp…+2pp, 5 × 5.** A per-axis step scaled to each driver's
own dispersion was rejected for the same reason the tornado rejected it: it blends *how
uncertain* an assumption is with *how much it matters*, and it would leave two shift
conventions to explain instead of one. The cost is real and disclosed rather than corrected
for — 1pp is a much larger proportional move on a 3.43% margin than on revenue growth — so each
axis reports the schedule it actually shifted.

**The grid asserts no direction for either axis.** This is the load-bearing design decision,
not defensive phrasing. The WACC × terminal-growth grid's legend can say a lower WACC generally
raises value; this one cannot say the equivalent about revenue growth. On an ordinary
reinvestment-heavy schedule the direction reverses **inside a single grid**: at −2pp margin,
moving revenue growth from −2pp to +2pp takes value per share from $2.32 to $1.40, while at
+2pp margin the same shifts take it from $13.16 to $13.99. Surfacing that is the feature.

**A per-year cash-flow relationship is explanatory, not a valuation threshold.** For a year
with positive EBIT, that year's UFCF is `R × (m(1−t) + d − c − n) + n × R_prior`, so the sign
of `m(1−t) + d − c − n` governs whether more revenue raises or lowers *that year's* cash flow.
An earlier draft of this design overstated it as the condition under which growth adds value.
It is not: the total valuation response also runs through compounding into later years,
discounting, each year's own driver path, and a terminal value built off the final year alone.
The grid is computed from twenty-five full valuations, and the tests assert the observed cells
rather than the algebra. Verified concretely — on the Costco demo's own Driver Base Case that
per-year coefficient is +0.046 and the grid reads normally, while a near-threshold schedule
whose coefficient is slightly *negative* still has value rising with growth.

**The two axes are not symmetric.** UFCF is increasing in EBIT margin only where a year's
revenue is **positive** and its tax rate is **at or below 100%** — EBIT is revenue × margin, so
a negative-revenue year reverses it, and `max(EBIT, 0) × rate` above 100% takes more than the
year's entire EBIT. The revenue-growth axis is genuinely non-monotone under ordinary
assumptions. Neither condition is assumed, and the test suite deliberately contains **no**
monotonicity assertion on the growth axis: encoding "more growth is worth more" would assert a
belief the engine correctly refuses to hold.

**A negative EBIT margin is not itself warned about, and the design does not pretend it is.**
An earlier draft implied the engine flags it. It does not — `driver_warnings` covers tax rate
outside 0–100%, negative D&A/CapEx percentages, zero or negative revenue, and a non-positive
final-year UFCF. Only a resulting condition raises a warning, and cells are marked on exactly
that basis.

**Overlap with the tornado is precisely four cells, and is tested.** (±1pp growth, base margin)
and (base growth, ±1pp margin) test what the tornado's two corresponding rows test and must
agree with them; the ±2pp cells and every off-axis combination have no tornado equivalent.
Claiming the grid's *edges* cross-check against the tornado would have been wrong — the edges
are the ±2pp cells, which are exactly the ones that do not.

**Reuse over abstraction, again.** The two-driver shift composes the tornado's existing
`_shift_driver` rather than reimplementing it; per-cell warnings reuse `new_endpoint_warnings`;
tinting reuses the WACC grid's `sens-tier-*` and `sensitivity-base-case` classes. The only new
shared frontend export is `formatDriverRate`, a one-line formatter — the tornado's standing
note said a common charting layer gets extracted when a second chart proves what is actually
reusable, and with the second chart built, that turned out to be one formatter, not a layer.

**Two defects caught in design review, before any live verification.** Both are recorded
because each is a category this project has hit before.

The first was a **count that did not match its own stated design**: the implementation ran
twenty-six valuations, computing the base case and then re-computing the identical unperturbed
schedule again as the centre cell. Beyond the wasted work, it left the centre cell with two
possible origins — precisely the drift the "base is computed inside the endpoint, never
supplied" rule exists to prevent. The centre cell now reuses the base run, and a test asserts
both the call count and that the unshifted schedule is valued exactly once.

The second was a **fabricated detail in an aggregate**. The frontend summary stored the first
cell's engine `explanation` for a warning id and then incremented its count as further cells
raised the same id — but those explanations name particular years and computed figures ("Year
3's revenue growth rate of 27.00% applied to a prior-year revenue of 1,464.10..."), so the entry
described cells it was counting incorrectly. The aggregate now carries warning-level copy true
of every cell raising that id, with no explanation travelling from any single cell; the engine's
exact sentence stays attached to the cell it belongs to. This is the same failure mode as
inventing a representative value for a Fade row — asserting a specific figure where only a
general statement is warranted — and it is worse than showing no detail at all.

The same review also tightened the marker itself: distinct warnings are now **numbered**, a
marked cell shows the numbers rather than a bare `!` (so a grid raising two different warnings
says which cell raised which), and the cell's accessible text names the affected forecast years
alongside each warning.

**Three supplementary surfaces stay sequential, on a production measurement rather than a
guess.** Driver mode now fires four requests: the valuation, then the WACC grid, the tornado and
this grid. Measured on the deployed app: `driver-valuation` **155 ms** — the headline result —
then 76 ms, 74 ms and 95 ms, for **247 ms after the number the analyst is waiting for is already
on screen**. Parallelizing would save roughly 150 ms nobody is blocked on, in exchange for three
concurrent requests against a free-tier instance and the loss of a property worth keeping: a
slow or failed supplementary surface can never delay or invalidate the headline valuation, which
is why each is a separate best-effort request in the first place. Revisit only if a future
surface changes the shape of that measurement.

**Rejected in scope:**

- **Configurable step size or grid dimensions.** Both existing grids fix their deltas
  deliberately — "a single *just show me the risk* view, not more inputs to fill in."
- **Absolute-level axis labels.** They work only for a Flat row; a Fade or Custom row has no
  single level, and inventing a representative one is the substitution this project rejects.
  The axes are shifts, and the real schedules are printed beneath the grid.
- **"Apply this cell to my schedule."** Sensitivity-cell adoption was already excluded from the
  tornado milestone; nothing here changes that.
- **Computing ROIC.** The grid shows the growth-versus-margin relationship without claiming the
  ratio, which would need invested capital the driver model does not carry.
- **Extending it to Quick DCF.** EBIT margin does not exist there. Quick's flat FCF growth rate
  still has no sensitivity treatment of its own, and remains parked in `ROADMAP.md`'s Later.

## DCF traceability: history-to-forecast continuity and PV composition
**Status:** Accepted

One milestone framed around a single user outcome — history → forecast → present value →
enterprise value — rather than around the bar geometry the two charts happen to share. That
framing was a correction: the first proposal led with the shared implementation, which is the
weakest possible justification for a milestone's shape and inconsistent with this project's own
stance against abstraction-driven design. Full methodology: `MODELING_CONVENTIONS.md`.

**Both charts are frontend-only.** Every figure already comes back in the valuation response —
`forecast[].present_value`, `pv_terminal_value`, `enterprise_value`, and the sourced `periods`
already on `companyData`. No engine change, no new endpoint, no payload change.

**Terminal value's contribution is now one rule across the app.** Explain This Valuation
previously suppressed any share outside `[0, 1]`, with a code comment calling it "arithmetically
real but confusing." That hid exactly the case the composition chart exists to surface, and one
number cannot have two rules in one app. The rule now lives in `valueComposition.js` and both
consumers read it: report a contribution whenever enterprise value is finite and positive,
including above 100% or below 0%; claim no percentage at all where enterprise value is zero,
negative or non-finite. Wording moved to *contributes*, because "the remaining X%" is false as
soon as a contribution goes negative. This changed shipped behaviour and was approved
explicitly rather than folded in silently.

**The aggregate uses `enterprise_value − pv_terminal_value`, not the sum of the rows.** The
backend rounds each forecast row's `present_value` and `enterprise_value` independently, so
summing rows can miss enterprise value by cents and the two contributions would not reconcile
to 100%. Subtraction makes it exact by construction. Caught in design review, before
implementation.

**Two readings on two scales, and deliberately not a clamped 100% stack.** Terminal value is
routinely 70–90% of enterprise value, so a shared scale flattens the annual bars into slivers
and destroys the only thing this adds over the existing observation. A conventional stack is
worse still: it can only draw two same-signed parts summing to the whole, so a −18% / 118% case
would have to be clipped or rescaled — a picture that is not the number. The axis spans the
signed range actually present. Verified live on a forced case: at −17% / 117% the zero line
renders at 12.66% of a −17…117 axis, the negative segment left of it and the positive segment
right, nothing clamped.

**The continuity gate is one reported observation, not two.** An earlier draft borrowed the
historical trend charts' two-period minimum. That threshold belongs to a *trend*, which needs
two points to have one; a handoff needs only a point to hand off from. Corrected before
implementation, and the two metrics gate independently — a company can report revenue for a
period whose unlevered FCF could not be constructed.

**Values are visible text, not only an accessible label.** A first draft put exact figures in
`aria-label` and `title` only. That satisfies assistive technology and fails sighted users, who
would have to hover. Each chart now carries a value strip: the label and the amount as real
text under each bar.

That requirement then produced the milestone's one genuine defect, caught by measurement rather
than by eye. At 320px a ten-point continuity series collided on **19 of 20 labels with four
pushed out of bounds** — the without-hover channel was unreadable on a phone. Fixed by scrolling
the plot and its strip together inside a container with a minimum width per point below 720px,
the same treatment every wide table here already uses. Re-measured: **zero collisions per
metric**, 9–14px minimum gaps, and the worst case (five reported years against a fifteen-year
forecast, twenty points) gives a 960px track that pans inside a 320px viewport with no page
overflow. Print forces the container back to `overflow: visible` so nothing is ever clipped on
paper — a truncated chart is worse than a cramped one, because a reader cannot tell truncated
data from absent data, and the Forecast & Discounting table below prints every figure anyway.

**Nominal on both sides of the continuity chart**, deliberately. The question is whether the
forecast continues the history, and history is nominal; discounting is the composition chart's
question. Charting discounted forecast values against nominal actuals would make a flat forecast
appear to decay.

**Geometry extraction stayed narrow.** `slotPercents`, `signedDomain`, `baselinePercent` and
`barStyle` moved out of `HistoricalTrendCharts.jsx` into `barGeometry.js` once a third consumer
existed — four pure functions about positioning a bar against a zero line. Scales, labels, tone
classes and what a bar means stay with each chart. Still no charting layer and still no library,
consistent with the standing note in `driverTornado.js`.

**Rejected in scope:**

- **A UFCF build-up waterfall** (NOPAT → D&A → CapEx → ΔNWC) — a third chart answering a
  different question, not part of this outcome.
- **Any charting library**, and any interaction that adopts a charted value back into the
  inputs — the latter already excluded from the tornado milestone.

## SEC period discovery: silent staleness, and a verified CapEx fallback
**Status:** Accepted

Found by a bounded data-layer readiness review that was meant to choose the next *modelling*
milestone and instead found a data-integrity defect. Recorded because the defect class matters
more than the fix.

**The defect: a company's entire history could silently rewind by a decade.** Period discovery
anchored on a single tag, `OperatingIncomeLoss` (`sec_fundamentals.py`), whose docstring justified
the choice as "confirmed present for every company in the validation sample." That sample was
Apple, Caterpillar and Walmart. **Johnson & Johnson stopped tagging `OperatingIncomeLoss` after
FY2014** — its income statement runs gross profit straight to pre-tax earnings with no
operating-income subtotal — so discovery walked back eleven years and the app served **FY2014
financials as J&J's latest period**, with `status: "reported"` provenance, no warning, and every
downstream figure (trend charts, driver seeding, continuity chart, valuation) derived from
eleven-year-old data.

This inverts the project's own rule. Missing data already refused honestly; this *substituted*
silently, which is the failure mode `CLAUDE.md` §6 names as the recurring one. A user could not
have detected it except by recognising the fiscal-year labels as implausibly old.

**Two guards, with different jobs.**

1. **Union anchor.** Discovery now anchors on the union of the revenue and EBIT tag sets, so no
   single tag's absence decides a company's period set. Revenue leads because it is the most
   universally reported annual concept; EBIT is retained because PepsiCo, for one, resolves
   through EBIT with no mapped revenue tag.
2. **Contiguity, plus a wholesale-staleness check.** Ordinary history is a run of consecutive
   fiscal years about twelve months apart; a decade-wide step between adjacent candidates means
   the older side belongs to a tag that stopped being reported, so the run is cut there.
   Separately, if the newest period the anchors can find is itself far behind the newest annual
   period the filer reports at all, discovery has failed and **no** periods are returned rather
   than a confident-looking set of old figures.

Dropping rather than warning is deliberate. A stale period is not an unusual assumption an
analyst can weigh — it is the wrong year's data, and every derived figure would be wrong in a way
no downstream warning could repair.

**A design error in the first attempt, caught by a control fixture.** The staleness guard
initially filtered *every* period against the newest, which would have discarded the legitimate
multi-year history every chart and statistic in the app is built from — Costco collapsed from
five periods to two. The Costco control fixture existed precisely to catch "a fix that breaks an
ordinary filer," and did. The rule is contiguity between adjacent periods, not distance from the
newest.

**CapEx: one verified equivalent fallback tag.** `PaymentsToAcquireProductiveAssets` added to
`_CAPEX_TAGS`. Six of a seventeen-ticker basket (PepsiCo, Home Depot, NVIDIA, Amazon, Ford, AT&T)
report **no** `PaymentsToAcquirePropertyPlantAndEquipment` fact at all and report the productive-
assets tag for every annual period. Verified against the real company facts before adding, not
inferred from a name.

Deliberately **not** added, despite matching a `PaymentsToAcquire*` pattern at full coverage on
the same filers: `PaymentsForRepurchaseOfCommonStock`, `PaymentsToAcquireBusinesses*`,
`PaymentsToAcquireMarketableSecurities`. None is capital expenditure. A pattern-based chain would
have absorbed all three silently.

**Ford verified and deliberately left unfixed.** Ford reports no undifferentiated current-debt
line annually — its debt sits in segment-dimensioned facts (Automotive vs Ford Credit) that this
module does not read — and `net_working_capital` requires `current_debt`. This is a structural
reporting difference, not a mapping defect; adding a tag would not fix it and defaulting the
absence to zero would misstate NWC. Pinned by a test so the limitation is a checked fact rather
than only prose.

**Coverage is reported separately from methodology limits, and the projection was wrong.** A
pre-implementation estimate of "4/17 → 10/17" counted *dependency presence*, not usable unlevered
FCF. Measured with every real guard applied, SEC-only coverage is:

- **Complete (5/5): 6** — COST, KO, WMT, PEP, HD, NVDA
- **Partial: 4** — AMZN, T, MU (4/5 each) and BA (1/5), every gap a loss-year tax rate
- **None: 7** — F, TSLA, GOOGL, MSFT, INTC, PG, JNJ

The valid-current baseline was **3**, not 4: J&J's apparent "5/5" was five years of FY2010–FY2014
data. So complete coverage went 3 → 6, and every remaining blocker is an out-of-scope methodology
question — D&A component summation (TSLA, GOOGL, MSFT, INTC), restricted-cash treatment (PG),
derived EBIT (JNJ), segment-dimensioned debt (F), loss-year tax treatment (AMZN, T, MU, BA).

J&J's coverage did not improve and that is the correct outcome: it now refuses honestly on
current periods instead of answering confidently with 2014 data.

**Fixtures are focused slices of real filings, and CI stays offline.** Four fixtures
(`backend/tests/fixtures/sec/`), 40 KB total: annual 10-K facts only, capped per tag, only the
tags each behaviour needs. The full company-facts files are 3–5 MB each; committing the basket
would have put ~65 MB of third-party data in the repo to test four behaviours. Real values, so a
passing test is a statement about the actual filings. **No network-dependent CI tests** — live
verification against the providers stays a separate, bounded, manual step.

**Rejected in scope:** D&A component summation, derived EBIT for J&J, loss-year tax treatment,
and the restricted-cash question. Each is a methodology decision needing its own record, not a
tag addition.

## Dark-only interface, and a split accent token
**Status:** Accepted

UI audit Phase 1. Two presentation decisions taken together because they touch the same tokens;
full evidence in [`UI_AUDIT.md`](UI_AUDIT.md).

**The app is dark-only.** The former dark values are promoted to `:root`, both
`prefers-color-scheme` blocks are gone (one in `index.css` for the base palette, one in
`workspace.css` for sensitivity tiers, gain/loss, provenance dots and chart colours), and
`color-scheme` is `dark`. This preserves the appearance the app already had in dark mode rather
than introducing a new theme - no toggle, no light palette to maintain, and no second set of
contrast results to keep passing. The measured trigger: a contrast sweep of the populated
workspace found **15 AA failures in dark mode against 1 in light**, so the dark palette was the
one carrying real defects and the light palette was mostly cost.

**`--accent` was split into a surface token and a text token.** The single accent was used as
`color` in 15 rules and as `background` in 10, and those two roles have opposite contrast
requirements: at `#4a6f92` it reaches only 3.12-3.42:1 as foreground (failing AA) while white
text *on* it is 5.28:1 (passing). Lightening the one token to `#6b89a6` fixes all 15 foreground
uses and breaks all 10 surfaces - white text on the lightened surface drops to 3.65:1 - unless
every filled control also flips to dark text, which is a visual redesign arriving as a side
effect of an accessibility fix.

So: **`--accent` (`#4a6f92`) is the surface accent** - filled buttons, active states, bars,
borders, outlines, anywhere text sits *on* it. **`--accent-text` (`#6b89a6`) is the foreground
accent** - accent-coloured text on `--bg`/`--panel-bg`. Borders and outlines stay on `--accent`
and already satisfy the 3:1 non-text requirement. Result: **0 contrast failures, down from 15,
with every accent surface pixel-identical to before.**

**Also in this milestone, semantic only:** a `<main>` landmark; a visually-hidden `<h1>` for the
DCF module (the workspace deliberately has no visible page title - the compact company bar takes
that space - and adding one would have been a layout change, so the heading exists for assistive
technology only); `aria-current="page"` on the active module button, which previously conveyed
its state through a visual class alone; accessible names for all six tables via `aria-labelledby`
to headings that already exist, or `aria-label` for the two that have no heading, with **no
visible captions added**; and `aria-hidden` on the decorative step numerals, which otherwise
announced a bare "1" before each section name.

**Print was explicitly excluded** from this milestone and is not tracked as a finding. The
existing Print controls and README wording are deliberately untouched.

## Driver Schedule evidence hierarchy and inline NWC guidance
**Status:** Accepted

UI audit Phase 2. Presentation only - no calculation, payload, completeness rule or internal
state model changed. Measured evidence and the phase plan: [`UI_AUDIT.md`](UI_AUDIT.md).

**The evidence cell became two labelled regions.** It previously rendered as one
undifferentiated run - `’22 3.48 ’23 -10.87 ’24 -2.10 ’25 -8.41 agg -3.26%UNSTABLE` - in which
the derived statistic read as a fifth observation and the status collided with the figure. Now:
**Historical evidence** (full `FY22` labels at 12.5px, up from 10px at 70% opacity) and
**Historical benchmark** (`Median 7.46%` / `Aggregate -3.26%`, retiring the `med`/`agg` tokens),
with **Reliability** right-aligned on the benchmark line so it can never abut the number.

**Two regions, not two columns, and no extra width was needed.** At 1440px on the default
five-year horizon the schedule table already fills its container exactly, so a ninth column
would force horizontal scrolling in the most common configuration; and the observations and the
statistic derived from them are one evidence claim, which sibling columns would present as two
independent facts. Both width risks were tested by substituting the real strings into the live
DOM first: `FY22` labels cost nothing horizontally (the year sits above its own value, and
`-10.87` is already wider than any four-character year), and `Aggregate -3.26%` plus the status
measures 176px in the 199px column.

**Separation is vertical rhythm and one weight step - no hairline, no uppercase micro-caps.**
The cell was already too dense; the fix could not be more decoration.

**Reliability is now stated on every row, including the healthy case.** A blank previously meant
"assessed and fine" and "not assessed" identically, which is the one thing a reliability status
must not do. `Reliable` renders as quiet muted text at normal weight so the exceptions keep the
visual weight.

**One status word, said once.** The column header is now `History` (the cell labels its own
first region, and "reference" collided with the workspace's separate Reference Share Price).
`Unstable` appears once, on the benchmark line; the consequence is a separate caption, **`Not
used as starting point`**, keyed off `driver.seedable` - the same flag `buildBaseForecast`
branches on, so the caption can never claim something Initialize Forecast would contradict. The
refusal notes in `driverHistory.js` say only why the evidence is unreliable and what to do,
because the plan panel's `Not used as a starting point` heading and the row caption already
carry the consequence; repeating it inside the note made one fact appear three times on a
screen.

**The floating popover is gone.** The reliability badge is static text - a status is not also a
control - and the note row beneath the driver became the disclosure trigger: *"Why this
benchmark was not used and how to set the assumption"*, expanding inline to **What happened** /
**What to do**. This deleted the hand-computed fixed positioning, the `ESTIMATED_POPOVER_HEIGHT`
flip guess, the document-level `mousedown` listener, the manual focus return, and the
`.driver-history-col .driver-reliability-btn` specificity workaround that existed only because
the trigger was a `<button>` inside `.feature-page`.

**`<button aria-expanded>` rather than `<details>`/`<summary>`.** Print was excluded from this
audit, which removed the original justification, so the choice was re-derived: clarity and
accessibility are a tie and `<details>` is simpler, but this workspace already uses the
button/region pattern in four places ("How to read this", "Methodology", "Sources", "5-yr
history"), and a fifth disclosure with different keyboard semantics on the same page is worse
than the small amount of state kept here.

**Visible terminology: "Seeded" -> "History-informed",** completing one vocabulary with the two
region labels. Internal names (`seededFields`, `clearSeed`, `seedFormatter`, `.driver-seed-badge`)
are deliberately unchanged - renaming them would enlarge the diff with no user benefit.

**Three defects were found during implementation, all from the same class of cause:** the
disclosure trigger rendered as a filled accent pill (`.feature-page button` outranking a bare
class - the exact trap the retired popover CSS had documented); the region labels inherited the
numeric column's `text-align: right` and floated away from the left-starting observation grid;
and `Reliable` inherited bold 700 from an ancestor, which is not the quiet acknowledgement it is
meant to be. Each was caught by rendering the real component rather than trusting the CSS.

## Stacked Driver Schedule below 720px
**Status:** Accepted

UI audit Phase 3. Presentation only - no calculation, payload, completeness rule or internal
state model changed. Measured evidence: [`UI_AUDIT.md`](UI_AUDIT.md).

**The problem was measured, not assumed.** At 375px the schedule table was 956px inside a 285px
container (3.35x, 70% off-screen at any moment), with the Driver column pinned `sticky` at 224px
of the 285px viewport. That left 61px of usable width for inputs 88px wide, so **no forecast
input could ever be fully visible beside its driver name** - 1 of 7 reachable, and none at the
default scroll position, where the analyst saw driver names, history truncated mid-number, and
zero input fields. The sticky column was the cause rather than the missing fix, which is why the
table layout is dropped below the breakpoint instead of tuned.

**One source of state, and no second layout component.** The stack is a CSS presentation switch
over the same table markup, the same React tree, the same handlers and the same `driverYears`
state. There is no mobile render path and no `matchMedia` branch in the schedule, so there is no
second implementation of anything to drift. Two small structural changes made that possible:

- **One `<tbody>` per driver** instead of one for the whole table. The driver row and its note
  row are siblings, so without a shared parent the guidance would become a detached second card.
  Multiple tbodies are valid HTML; nothing about state or calculation changes.
- **`data-year` on each forecast cell**, rendered as the visible label through `::before` below
  the breakpoint. The year stays attached to its input without duplicating the input or its
  handler, and the input's existing `aria-label` already carries the same year, so the
  association is programmatic as well as visual.

**Fields are 16px below the breakpoint, and that is a functional floor rather than a style
choice.** iOS Safari zooms the whole page when a field smaller than 16px takes focus, which on a
form this dense throws the analyst out of context on every tap. Only the editable fields were
raised - the surrounding labels keep their smaller sizes. Forecast inputs and the Flat/Fade/
Custom control are 44px tall; the mode control uses `inline-flex` plus `min-height` rather than
padding alone, so its height is guaranteed independently of the horizontal padding that has to
keep three segments fitting at 320px.

**Verified at 320px, 375px, 719px and 720px, with 1-, 5- and 15-year Custom forecasts.** At
320px with 15 years: 90 inputs, all 90 fully visible and focusable, 16px/44px, no horizontal
overflow, and the three-segment mode control 154px inside a 204px row. At 720px the query stops
matching and every desktop property returns - `table-header-group`, `table-row`, the sticky
column, suppressed `::before` labels, and 13.33px inputs.

**Eight mobile touch targets**, six at 44px or above. The two `stockanalysis.com` links sit
mid-sentence at 32px: above the 24px floor, and forcing 44px there would break the paragraph
they are part of, which is a worse outcome than a slightly small link.

**The Costco demo disclosure collapses below the breakpoint only.** Its ~120 words of provenance
prose filled most of the first phone screen before any data or control was reachable; the
content is the disclosure that makes the demo honest, so it is collapsed behind a "Demo data and
assumptions" trigger rather than cut. There is deliberately **no unscoped collapse rule**: the
trigger only exists below the breakpoint, so a rule applying at every width could strand the
content - a panel mounted narrow and then widened would hide its body with no control left to
reopen it. That exact defect was caught in review before shipping.

**Four further defects were found by rendering rather than by reading the CSS**, three of them
the same class of cause the retired popover had already documented: `.driver-base-revenue`
overflowed the page by 9px at 375px and `.scenario-save-row` by 5px at 320px (both nowrap flex
rows, both pre-existing); the demo trigger rendered as a filled accent pill because
`.feature-page button` outranks a bare class; and the guidance trigger wrapped into a half-width
strip because the card's grid rule also matched the note row, fixed with
`:not(.driver-note-row)`.

## UI audit closed: Phase 4 (type scale and focus styling) deliberately not built
**Status:** Accepted

Concludes the UI-audit milestone. Phases 1–3 shipped and were production-verified; Phase 4 was
reassessed against the audit's own materiality standard and **closed unbuilt**. Full measurements:
[`UI_AUDIT.md`](UI_AUDIT.md).

**The reassessment re-measured the deployed build rather than trusting the original audit.** The
type-scale finding is unchanged in size — 23 distinct font sizes and 51 text nodes under 12px,
because Phases 1–3 were scoped not to touch it. Reporting it as improved would have been false.

**It is nevertheless immaterial.** Every figure an analyst reads a decision from sits well above
12px; nothing below 12px carries a number, only chrome. Contrast failures are at zero after
Phase 1, and every editable mobile field is 16px after Phase 3. The genuine cost of 23 sizes is
maintenance — future components re-inventing their own small size — which falls on development
rather than on the analyst, and does not meet the bar for scheduling work.

**Keyboard focus is functional, visible and sufficiently contrasted.** Measured on the deployed
build, a real Tab press produces the browser's `outline: auto 1px` amber ring at **7.53:1**
against the dark background, above the 3:1 non-text requirement, with `:focus-visible` matching
correctly. The finding was only that its appearance varies between nine custom-styled components
and the default elsewhere — a stylistic seam, not a defect.

**A broad refactor is not justified by the expected user benefit.** It would touch nearly every
component and carry regression risk in a theme with zero contrast failures, to fix something with
no user-facing symptom. This is the materiality rule applied to our own backlog rather than to a
user's request.

**Permitted but not scheduled:** a small set of typography tokens may be adopted
**opportunistically** when a component is already being changed for a higher-value reason. A
dedicated token migration is **not** to be implemented or scheduled — that is precisely the
cleanup-for-its-own-sake this decision declines.

**What this milestone did fix, for the record:** 15 dark-mode WCAG AA failures including the two
buttons that begin every session and a sourced financial value; a dark-only palette with the
accent token split by role; `<main>`, a DCF `<h1>`, `aria-current`, accessible table names and
hidden decorative step numerals; the Driver Schedule evidence hierarchy and its terminology; a
floating popover replaced by inline keyboard-operable guidance; and a flagship feature that could
not be operated on a phone (1 of 7 forecast inputs reachable, now all of them at 320px with a
15-year forecast).

## Analysis Outputs: progressive disclosure and where warnings live
**Status:** Accepted

Each output in the DCF Analysis Outputs card owns a **concise always-visible caption** — what
shifts, what is held constant, the base case, units — and deeper methodology sits behind a
**per-chart "How to read this" disclosure**, on the two charts that need one (Driver
Sensitivity, Revenue Growth × EBIT Margin). The WACC × terminal growth grid, the PV
composition chart and the Value Bridge carry a one-line caption and **no control**: a
disclosure per output would trade prose clutter for control clutter.

The former tab-level "How to read this" legend was **deleted rather than redistributed**. It
explained three different outputs in one paragraph, opened by describing the WACC grid's
highlighted cell (the *third* chart on the page in Driver mode), and located the Value Bridge
and its warnings "below" when both render in the right-hand column. Almost every sentence
already existed as a caption somewhere. The tab now opens with one orienting line: sensitivity
views show how value changes as assumptions move, composition and bridge views show how the
base-case value is built — the distinction the deleted copy blurred, since neither the
composition chart nor the bridge re-runs anything.

**Warnings are never disclosed.** A warning *this run produced* — a tornado endpoint chip, a
grid cell's superscript and its numbered entry, the bridge's warning list — stays visible
whatever the disclosure state. Only the standing explanation of how flagged results are
treated (valued and shown as tested, never clamped) moves behind the control. A collapsed
disclosure must never be the reason an analyst misses a caution on the number they are reading.

Mechanically this reuses the workspace's existing idiom rather than introducing a second one:
`<button aria-expanded>` pointing at a region that stays mounted and carries `.no-screen` while
collapsed, so `aria-controls` always has a target and print.css restores the full methodology
on paper with no print-specific markup. Because three controls now read "How to read this",
each names its own chart in its accessible name. Presentation only — no engine, endpoint,
payload, warning, geometry or computed value changed.


## SEC D&A: component summation for filers with no combined tag
**Status:** Accepted

A data-coverage milestone scoped to D&A normalization alone. Four of the seventeen-ticker basket
— Microsoft, Alphabet, Tesla and Intel — report **no** combined cash-flow D&A tag at any period,
so `_DA_TAGS` resolved nothing, D&A was `None`, and unlevered FCF was `None` for all five years.

**Combined is preferred as a correctness rule, not an ordering preference.** Where a filer
reports both a combined tag and components, the components do **not** reproduce it: Ford 0.49×,
Amazon 0.65×, Home Depot 1.16× (components *exceeding* the combined line). Consulting components
only for a period with no combined fact also makes double-counting structurally impossible.

**Component summation is an allowlist, not a heuristic.** `_DA_COMPONENT_VERIFIED_FILERS` keys
on SEC CIK — the filer's stable identifier, which does not move with a ticker change or a
re-listing — and a filer is added only after its component sum has been reconciled by hand
against its own filed cash flow statements in every year the app displays. Currently **Microsoft
(789019) and Intel (50863)**. Both components are required for every displayed year; either
missing, and that year has no D&A.

**An unknown filer that happens to tag both components is refused.** An intermediate version of
this milestone admitted any filer reporting both components throughout the period set, while its
own documentation conceded that this was necessary but not sufficient evidence of complete D&A —
which amounts to serving a figure on the promise of a reconciliation that could only happen after
the app had already used it. A live ticker cannot be reconciled later. Structural evidence now
gates nothing on its own; a new filer stays unmapped until someone checks it and adds it
deliberately.

**Resolution is per period, and the extra period is not the displayed set.** The caller requests
`MAX_PERIODS + 1` periods, the last purely to supply a prior-year balance sheet for the
working-capital delta; D&A is never read from it. A filer-level rule evaluated over the requested
window would have let a gap in that never-displayed year withhold D&A from all five displayed
years. A test pins that.

### The correction that produced that rule

A first version of this milestone made amortization **optional**, on the strength of Alphabet's
depreciation-only figure matching its filed cash-flow line exactly, and attributed Tesla's
residual to impairment. Both were wrong, and the review that caught it was right on both counts.

- **"Optional" is arithmetically identical to assuming zero** for any filer that simply does not
  tag the concept. That is the silent substitution this project's validation principle exists to
  prevent — recorded again here because it is the same failure mode as the J&J staleness defect,
  reached by a different route.
- **Tesla's residual is not impairment.** Its line is "Depreciation, amortization and impairment"
  ($6,148M FY2025) against `us-gaap:Depreciation` of $5,030M, but the filing reports no material
  long-lived-asset or goodwill impairments. The residual is amortization and other depreciation.
  It is also *systematic*, which impairment would not be: **−18.2%, −23.2%, −28.6%, −35.4%,
  −32.6%** across FY2025–FY2021.
- **Alphabet's exact match was against one line, not against its D&A.** Alphabet reports
  `AmortizationOfIntangibleAssets` only on **10-Qs**, never annually, while its 10-Ks carry
  `FiniteLivedIntangibleAssetsAccumulatedAmortization` and forward amortization schedules. It has
  intangible amortization; that amortization sits inside "Other" on the cash flow statement. So
  the exact match supported Alphabet's *depreciation line* and nothing more.
- **Validating only the latest year is what allowed it.** Checking every relevant year is now the
  standard, and is what exposed both Tesla's systematic gap and Microsoft's two-sided deviation.

### Measured against the filings, every relevant year

| Filer | Components vs. its own filed aggregate | Outcome |
| --- | --- | --- |
| INTC | **exact in all five years** — the components *are* the two D&A lines on its cash flow statement (impairment is a separate line) | **admitted** |
| MSFT | +1.2%, −4.9%, −4.6%, −2.6%, +1.0% across FY2026–FY2022 | **admitted** |
| GOOGL | matches its depreciation line exactly; that line is not its D&A | **refused** |
| TSLA | −18.2% to −35.4% every year, including the one year it tags both components (−32.6%) | **refused** |

**Microsoft's deviation is two-sided and must not be called conservative** — an earlier version
of this record did call it that, and it is wrong: the latest year's component sum *exceeds* the
filed aggregate. Its own line is `msft:DepreciationAmortizationAndOther`, which carries a
non-D&A "other" bucket that can fall either way, and Microsoft **restated that line between
filings** (FY2025 34,153 → 29,433), so the aggregate is not a fixed target either. A test pins
the deviation as two-sided so the claim cannot be reintroduced.

**Why no structural rule was sufficient.** Tesla tags intangible amortization in FY2021 only, so
a per-period "both present" test would admit that single year — and FY2021 is still 32.6% low,
because `us-gaap:Depreciation` is not even Tesla's whole depreciation. Requiring both components
across the whole window excludes Tesla but would still have admitted any unexamined filer, and
would additionally have made a gap in the never-displayed prior-balance year withhold the
displayed ones. Only the allowlist answers both.

**Approval is per filer and evidence-based, because structural completeness cannot be proved from
the facts alone.** Microsoft is on the list and still sits a few percent from its own aggregate —
which is exactly why membership rests on a hand reconciliation rather than on any property the
module could compute. No approximation status was introduced: a filer is verified or it is not,
and an unverified one is simply unmapped. Extension-tag ingestion — the only route to Microsoft's
and Tesla's own D&A lines — stays out of scope.

**Explicit reviewed slots, never a name pattern.** `/depreciat|amorti/` matches, in these filers'
real facts: `FinanceLeaseRightOfUseAssetAmortization` (the decisive one — adding Microsoft's
5,403 overshoots its filed line by 15%), `AmortizationOfFinancingCosts` (Tesla),
`AvailableForSaleSecurities*AmortizedCost*`, the forward-looking
`FiniteLivedIntangibleAssetsAmortizationExpenseYear{Two..Five}` family, and
`OtherComprehensiveIncomeDefinedBenefitPlansNetUnamortizedGainLossArisingDuringPeriodNetOfTax` —
an Intel OCI **pension** movement matching only on the word "unamortized", on a filer the gate
admits. `DepreciationNonproduction` is excluded too: explicitly the non-production portion only,
so for a manufacturer it would omit the depreciation sitting in cost of sales.

**Measured coverage, re-run after the correction.** SEC-only, every real unlevered-FCF guard
applied:

- **Complete (5/5): 6 → 7** — COST, KO, WMT, PEP, HD, NVDA, **+ MSFT**
- **Partial: 4 → 5** — AMZN, T, MU (4/5), BA (1/5), **+ INTC (1/5)**
- **None: 7 → 5** — F, PG, JNJ, **GOOGL, TSLA**

Alphabet and Tesla are unchanged at 0/5, now by explicit refusal rather than an unmapped tag.
Intel gained D&A but not coverage: its remaining blockers are a `cash` mapping gap in FY2021–23
and a FY2024 loss-year tax rate. The first version of this milestone claimed **9**; the corrected
figure is **7**, and the earlier claim rested on the two reconstructions since withdrawn.

**Five fixtures, 51 KB, cut from real filings, each carrying its filer's real CIK** (`backend/tests/fixtures/sec/`): a direct-tag
control reporting a combined tag *and* both components (AMZN), the two admitted filers (MSFT,
INTC) checked against filed aggregates in every year, and the two refused ones — Alphabet
carrying its real 10-Q amortization facts and 10-K accumulated-amortization disclosure so the
"unavailable, not zero" distinction is testable rather than asserted, and Tesla carrying the
sporadic pattern that showed no structural rule would do. Completeness behaviour is synthetic
and labelled as such. No network-dependent CI tests.

**Deliberately out of scope**, each still needing its own decision: extension-tag ingestion;
**historical loss-year effective tax rate** (AMZN, T, MU, BA, INTC FY2024) — a sourced-data
question, since `effective_tax_rate` is undefined when pretax income is not positive, so those
years yield no unlevered FCF; derived EBIT (JNJ); restricted-cash and short-term-investment
mapping (PG, INTC FY2021–23); and segment-dimensioned debt (F).

The historical loss-year question is **related to but distinct from forecast NOL carryforwards**
(see `ROADMAP.md`'s Later list). The first is about deriving a tax rate for a *reported* loss
year; the second is about Driver mode's forward `max(EBIT, 0) x rate` convention giving a
forecast loss year no benefit against a later profitable one. Different inputs, different
surfaces, and each needs its own decision — they are not one milestone.
