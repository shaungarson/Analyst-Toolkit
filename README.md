# Analyst Toolkit

A finance web app for real estate underwriting and DCF valuation, with a transparent,
testable financial modeling engine built around explicit analyst conventions — designed to
demonstrate what AI-assisted software development looks like when domain expertise drives
the direction.

**Live app:** [analyst-toolkit-ecru.vercel.app](https://analyst-toolkit-ecru.vercel.app)
**Source:** this repository

---

## What this is

Analyst Toolkit is two connected calculators — real estate underwriting and DCF valuation —
that take an analyst's assumptions and return the numbers a real deal or investment
committee memo would need: IRR, equity multiple, cash-on-cash, enterprise value, value per
share, and the full multi-year schedules behind them. Every material modeling convention and
assumption is explicit; nothing is silently embedded in the calculations.

It's built for recruiters, hiring managers, PE professionals, real estate asset management
professionals, and finance teams evaluating whether AI-assisted development can produce
something genuinely useful — not a toy demo with a spreadsheet's worth of hardcoded numbers
behind it.

## Who built what

I'm the finance-domain owner: an Honours BComm in Financial Services, background in
financial analysis, valuation, and real estate underwriting, limited software engineering
experience. Claude Code wrote essentially all of the code. My role was direction and
judgment — product scope, financial methodology, what's simplified versus what's
configurable, and every genuine modeling-convention decision (debt amortization convention,
discounting convention, exit valuation approach, and more) was explicitly flagged and
decided together rather than silently assumed by the AI.

This is the honest story: **I supplied domain expertise and direction, Claude implemented.**
The full decision history — every methodology choice, why it was made, and what was
considered instead — is in [`docs/decisions.md`](docs/decisions.md), with the complete
chronological development log in [`docs/archive/PROGRESS_HISTORY.md`](docs/archive/PROGRESS_HISTORY.md).

## Current capabilities

### Real Estate Underwriting

- Multi-year cash flow model: NOI grows at a flat annual rate from Year 2 onward (Year 1 is
  the unescalated going-in NOI)
- Financing with a full debt amortization schedule (monthly-pay, monthly-compounding),
  loan maturity modeled separately from the amortization period
- Acquisition and disposition costs (flat percentages)
- Exit valuation based on forward-looking NOI (the income the buyer is purchasing, not the
  flat going-in figure)
- IRR, equity multiple, cash-on-cash return, all computed from the actual year-by-year
  equity cash flow stream
- DSCR (computed per year) and debt yield (a Day-1 metric), the standard lending figures
  behind the return numbers
- **Sensitivity analysis:** IRR across a grid of exit cap rate × hold period
- **Deterministic risk flags:** transparent, rule-based checks (low Year-1 DSCR, exit
  cap-rate compression, capital-loss exposure across the sensitivity grid) — no black-box
  scoring, just explainable thresholds against the numbers already computed above
- Save, load, **duplicate**, and **compare named scenarios** side by side — comparison
  highlights exactly which assumptions differ between the scenarios selected, so it's clear
  *why* the outputs moved, not just that they did
- **Professional Deal Summary:** a compact, decision-ready read of a completed
  underwriting — headline returns, deal/financing snapshot, a compact sensitivity view, and
  any triggered risk flags — separate from (and above) the full detailed breakdown, with a
  dedicated one-page print/print-to-PDF output
- CSV export and print-friendly output

*Currently frozen pending validation of underwriting conventions with a CRE professional —
see [`docs/decisions.md`](docs/decisions.md).*

### DCF Valuation

- **Ticker search:** enter a public company ticker and load it — purchase-relevant
  historical fundamentals (revenue, EBIT, D&A, CapEx, tax rate, working-capital change,
  cash, debt, shares) populate the workspace, clearly separated from the editable
  forecast assumptions below them. Populates the form only; the analyst still reviews every
  assumption and explicitly runs the valuation — nothing is auto-calculated or auto-saved.
- **Per-value provenance:** every sourced historical field discloses how it was obtained —
  reported directly from one SEC filing, combined from several SEC facts, calculated by
  formula from other sourced fields, or a fallback from Alpha Vantage where SEC couldn't
  confidently map it — with filing period, form, accession number, and a source link one
  click away. Compact status indicators by default; full detail behind a "Sources" toggle
  (latest period and, per-cell, the full multi-year history), never a wall of permanent
  badges.
- **Historical trend mini-charts:** compact Revenue and Unlevered FCF bar charts, five years,
  independent scales rather than a misleading dual axis — makes a pattern like a
  working-capital-driven FCF dip visible at a glance instead of requiring a row-by-row read
  of the table. Pure CSS, no chart library; handles negative, zero, and missing values
  correctly (a missing year is a gap, never a fabricated zero).
- **Embedded Costco (COST) demo:** a header button loads a frozen, real, fully-sourced
  five-year snapshot and a dated reference price — no SEC or Alpha Vantage request, so it
  works even when both providers are unavailable. Three ephemeral Low/Base/High Growth
  cases hold WACC and terminal growth fixed and vary only the explicit-period FCF growth
  assumption; one click of Run Valuation calculates all three via the real valuation engine,
  then accessible result tabs switch between them instantly, with no further requests.
  Clearly labeled as a demo snapshot throughout, never presented as live data, and never
  saved to the scenario list.
- Unlevered FCF projected from a base year at a flat growth rate
- Gordon Growth terminal value, with WACC and terminal growth as direct inputs
- Enterprise value → equity value → value per share bridge, shown as a proportional value
  bridge visualization
- **Editable, dated reference price vs. implied value:** an explicit Reference Price (sourced
  from Alpha Vantage when available, or entered manually) shown alongside the model's implied
  value per share, with a deterministic Implied Upside/Downside — arithmetic only, never a
  recommendation. Editing a sourced price marks it Adjusted rather than silently presenting
  it as untouched sourced data.
- **Sensitivity analysis:** value per share across a grid of WACC × terminal growth rate
- Save, load, **duplicate**, and **compare named scenarios** side by side
- CSV export and print-friendly output

The module is laid out as a dense analyst workstation: sourced data, editable assumptions,
and the resulting valuation sit side by side in one row on desktop, so the relationship
between an input and its effect on the valuation is visible without scrolling.

Both modules ship with a one-click worked example. The Real Estate example is
real-world-inspired: purchase price and NOI are sourced from a public industrial/flex
listing (100 Symes Road, Toronto), with everything else clearly labeled illustrative rather
than presented as sourced fact.

## Financial methodology

Every calculation is a pure, tested function, separate from the API and UI layers — see
`backend/app/calculations/`. Full current methodology (all conventions, stated explicitly):
[`docs/MODELING_CONVENTIONS.md`](docs/MODELING_CONVENTIONS.md). Highlights:

- **DCF terminal growth validation:** hard-blocked only for genuine Gordon Growth
  invalidity — WACC must exceed terminal growth, and terminal growth can't sit so far below
  −100% that the underlying perpetuity stops converging (a derived mathematical boundary,
  not an arbitrary cap). Structurally unusual but valid assumptions surface as explanatory
  warnings instead of being blocked.
- **DCF explicit-period FCF growth validation:** no fixed ceiling or floor — the same
  judgment-not-threshold reasoning as terminal growth. Only a genuine computational
  failure (overflow, or a non-finite result) is rejected outright.
- **Unlevered FCF from sourced company data:** `EBIT × (1 − effective tax rate) + D&A −
  CapEx − change in NWC` — the standard enterprise-value-DCF construction. Any missing
  input makes the result undefined rather than silently treating it as zero.
- **Implied Upside/Downside:** deterministic arithmetic against a valid, positive reference
  price (sourced or manually entered), never a buy/sell/attractive framing.
- **Discounting:** end-of-year convention throughout — flagged as a genuine, material
  convention choice and decided deliberately.
- **Deliberately deferred:** refinancing, waterfalls/promotes, driver-based DCF
  forecasting, WACC build-up, comparable-company inputs. Full list: [`docs/ROADMAP.md`](docs/ROADMAP.md).

Every calculation — cap rate, amortization, IRR, equity multiple, DSCR, debt yield, terminal
value, enterprise value, unlevered FCF construction — is backed by automated tests checked
against values computed independently by hand, not just "does the code agree with itself."
136 backend tests total, plus a GitHub Actions CI pipeline that runs the backend suite and
the frontend lint/build checks on every push and pull request.

## Architecture

```
Browser (React SPA, static build on Vercel)
    │  fetch('/api/...')
    ▼
FastAPI backend (Render)
    │  Pydantic validates input bounds
    ▼
Pure calculation functions (backend/app/calculations/)
    │  no framework code, no side effects
    ▼
JSON response → rendered in the browser
```

For the DCF module's ticker search specifically, the backend also acts as a normalization
layer in front of external data:

```
Browser: GET /api/company/{ticker}
    ▼
FastAPI backend (Render)
    │  SEC EDGAR: primary source for historical fundamentals (XBRL company facts, no key
    │             required) plus ticker → CIK lookup and a filings-index link
    │  Alpha Vantage: fills any field SEC EDGAR can't confidently map for a period, and
    │             remains the sole source for the reference price (server-side-only key)
    ▼
app/services/company_data.py — merges both, field by field, into one provider-agnostic
    shape, computes unlevered FCF via app/calculations/company_financials.py (pure, tested)
    ▼
JSON response → populates the DCF form; the analyst still reviews and runs it manually
```

Full technical detail (module-by-module, testing, CI): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

- **Frontend:** React + Vite, plain JavaScript — components organized by feature, shared
  pieces factored out once a second module needs them.
- **Backend:** Python (FastAPI) — chosen over doing the math in the browser, since Python is
  the language most associated with analyst/data work. No database, auth, or persistent
  storage — saved scenarios live in the browser's own storage. The one exception to "no
  external calls" is DCF ticker search (SEC EDGAR + Alpha Vantage, server-side) — this
  project's only third-party dependency, added deliberately; see
  [`docs/decisions.md`](docs/decisions.md).
- **Deployment:** Vercel (frontend) + Render (backend), via GitHub, continuous deployment on
  every push.

## Roadmap

**Shipped:** foundation → real estate + DCF MVPs → scenario saving/export/print →
validation hardening → visual design → deployment → multi-year modeling, sensitivity, and
scenario comparison → real estate risk flags and Deal Summary → DCF ticker search and
workstation redesign → hardened DCF validation → SEC EDGAR as the primary DCF fundamentals
source → SEC-independent DCF data resilience (Alpha Vantage optional, never a hard
dependency) → per-value provenance and an editable, dated reference price → an embedded,
provider-independent Costco DCF demo → compact historical Revenue/Unlevered FCF trend
mini-charts. Detail:
[`PROGRESS.md`](PROGRESS.md), [`docs/decisions.md`](docs/decisions.md).
What's next: [`docs/ROADMAP.md`](docs/ROADMAP.md).

**Long-term direction — not yet built:** the modeling engine above is the foundation, not
the end state. Analyst Toolkit is meant to grow into an AI-powered analyst *workflow* tool,
not just a more elaborate calculator:

> raw deal/company information → structured assumptions → financial model →
> scenarios/sensitivities → risks/insights → decision-ready summary/export

The idea is for AI and automation to progressively reduce the manual effort between those
stages — document extraction from OMs, rent rolls, and T12s; auto-structuring raw inputs;
flagging missing or inconsistent data; generating and comparing scenarios; flagging
underwriting or valuation risk; interpreting sensitivity results in plain language;
generating IC-style investment commentary. None of this is scoped or scheduled — it's
explicitly gated on the modeling engine being solid first, which is the work reflected in
this repository today. Full detail: [`docs/ROADMAP.md`](docs/ROADMAP.md)'s Parked column.

## Running locally

```bash
# Backend
cd backend
python -m venv venv
./venv/Scripts/pip install -r requirements.txt
cp .env.example .env  # ALPHA_VANTAGE_API_KEY is optional (free, see below) - ticker search works without it for SEC-supported tickers
./venv/Scripts/python -m uvicorn app.main:app --reload --port 8001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to the backend
automatically — see `frontend/vite.config.js`.

Run the backend test suite with `./venv/Scripts/python -m pytest` from `backend/`.

A free Alpha Vantage API key (<https://www.alphavantage.co/support/#api-key>, no credit
card) set as `ALPHA_VANTAGE_API_KEY` — locally in `backend/.env`, and as an environment
variable in Render — enriches ticker search with a reference price and a few extra fields.
It's optional: SEC EDGAR is ticker search's independent primary path, so a SEC-supported
ticker loads with no key at all, reference price simply absent (still enterable manually).

## Tech stack

React 19 · Vite 8 · FastAPI · Pydantic · pytest · numpy-financial · httpx · SEC EDGAR
(primary historical fundamentals via XBRL) · Alpha Vantage (fallback fundamentals & reference
price/quotes) · Vercel · Render · GitHub Actions (CI)
