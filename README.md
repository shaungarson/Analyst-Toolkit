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
considered instead — is in [`PROGRESS.md`](PROGRESS.md).

## Current capabilities

### Real Estate Underwriting

- Multi-year cash flow model: NOI grows at a flat annual rate from Year 2 onward (Year 1 is
  the unescalated going-in NOI)
- Financing with a full debt amortization schedule (monthly-pay, monthly-compounding,
  rolled up annually), with loan maturity modeled separately from the amortization period
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

### DCF Valuation

- Unlevered FCF projected from a base year at a flat growth rate
- Gordon Growth terminal value, with WACC and terminal growth as direct inputs
- Enterprise value → equity value → value per share bridge
- **Sensitivity analysis:** value per share across a grid of WACC × terminal growth rate
- Save, load, **duplicate**, and **compare named scenarios** side by side
- CSV export and print-friendly output

Both modules ship with a one-click worked example, so the tool is understandable in under a
minute without needing to source your own deal data.

## Financial methodology

Every calculation is a pure, tested function, separate from the API and UI layers — see
`backend/app/calculations/`. The modeling conventions are stated explicitly in code and in
the UI's own assumptions text, never silently assumed:

- **Real estate debt:** monthly-pay, monthly-compounding amortization — the standard
  commercial mortgage convention — rolled up into annual schedule rows.
- **Real estate loan maturity:** modeled separately from the amortization period (e.g. a
  5-year loan term on a 30-year amortization schedule), and constrained to be at least as
  long as the hold period — refinancing, extensions, and balloon payoffs beyond the
  original loan term aren't modeled, so the engine never computes cash flows using
  financing that would have contractually expired.
- **Real estate DSCR and debt yield:** DSCR (NOI ÷ debt service) is computed per year and
  becomes undefined once the loan is paid off; debt yield (going-in NOI ÷ loan amount) is a
  Day-1-only figure, matching standard lender convention.
- **Real estate exit value:** capitalizes NOI one year past the end of the hold period (what
  the buyer is actually purchasing), not the flat going-in NOI.
- **Real estate risk flags:** deterministic, explainable rules only (e.g. DSCR below a
  named reference level, exit cap-rate compression, sensitivity cells with equity multiple
  below 1.0x) — never an arbitrary composite "risk score."
- **DCF terminal value:** Gordon Growth (perpetuity growth) method, since WACC and terminal
  growth are given as direct inputs rather than an exit multiple.
- **Discounting:** end-of-year convention throughout (not mid-year) — flagged as a genuine,
  material convention choice and decided deliberately, not defaulted into.
- **Deliberately deferred for now** (see `PROGRESS.md` for the full list): refinancing,
  multiple debt tranches, waterfalls/promotes, revenue-driver DCF forecasting, WACC
  build-up from capital structure, comparable-company inputs.

Every calculation — cap rate, amortization, IRR, equity multiple, DSCR, debt yield, terminal
value, enterprise value — is backed by automated tests checked against values computed
independently by hand, not just "does the code agree with itself." 46 backend tests total.

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

- **Frontend:** React + Vite, plain JavaScript. The frontend stays lightweight and avoids
  unnecessary framework lock-in; components are organized by feature
  (`src/features/real-estate/`, `src/features/dcf/`),
  with genuinely shared pieces (scenario saving, CSV export, formatting) factored out once —
  and only once — a second module needed them.
- **Backend:** Python (FastAPI) — deliberately chosen over doing the math in the browser,
  since Python is the language most associated with analyst/data work and keeps the door
  open for heavier data analysis later without a rewrite. The backend's job stays narrow:
  validate input, run the calculation, return the result. No database, no auth, no
  persistent storage — saved scenarios live in the browser's own storage.
- **Deployment:** Vercel (static frontend) + Render (Python API), connected via GitHub for
  continuous deployment on every push.

## Roadmap

**Done:** Foundation → Real Estate MVP → DCF MVP → scenario saving/export/print → input
validation hardening → visual design pass → deployment → multi-year modeling, sensitivity
analysis, and scenario comparison for both modules.

**Long-term direction — not yet built:** the modeling engine above is the foundation, not
the end state. Analyst Toolkit is meant to grow into an AI-powered analyst *workflow* tool,
not just a more elaborate calculator:

> raw deal/company information → structured assumptions → financial model →
> scenarios/sensitivities → risks/insights → decision-ready summary/export

The idea is for AI and automation to progressively reduce the manual effort between those
stages — document extraction from OMs, rent rolls, and T12s; auto-structuring raw inputs;
flagging missing or inconsistent data; generating and comparing scenarios; flagging
underwriting or valuation risk; interpreting sensitivity results in plain language;
generating IC-style investment commentary. None of this is scoped or scheduled yet — it's
explicitly gated on the modeling engine being solid first, which is the work reflected in
this repository today.

## Running locally

```bash
# Backend
cd backend
python -m venv venv
./venv/Scripts/pip install -r requirements.txt
./venv/Scripts/python -m uvicorn app.main:app --reload --port 8001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to the backend
automatically — see `frontend/vite.config.js`.

Run the backend test suite with `./venv/Scripts/python -m pytest` from `backend/`.

## Tech stack

React 19 · Vite 8 · FastAPI · Pydantic · pytest · numpy-financial · Vercel · Render
