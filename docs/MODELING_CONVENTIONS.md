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
- **Explicit forecast:** one flat annual FCF growth rate from a base year, not a
  revenue-driver build-up (revenue → margin → taxes → D&A → CapEx → ΔNWC — not yet built,
  see `ROADMAP.md`).
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
