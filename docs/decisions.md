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
meaningful would be out-of-scope expansion beyond the current roadmap, not a small addition. A Downside/Base/Upside spread
on one company also reuses the naming convention and scenario-comparison pattern already
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
never touch `localStorage` — they render in a compact "Costco Demo" toggle beside "Load
Example" (collapsed by default, the same visual weight as that link, not a permanent
section), never as persistent saved scenarios. Every case's results are calculated live
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
imply a value 50-58% below the $943.88 reference price ($335.59-$464.96 vs. Costco's real
market price). This is a genuine, expected consequence of a 5-year flat-growth DCF at
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
