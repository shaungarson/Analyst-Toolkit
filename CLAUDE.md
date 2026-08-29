# Analyst Toolkit — Project Instructions

## 1. Purpose

A professional finance web app demonstrating AI-assisted software development applied to analyst workflows. Audience: recruiters, hiring managers, PE professionals, real estate asset management professionals, finance teams.

Target reaction: **"This person knows how to use AI to build tools that could make our analysts significantly more productive."**

It should also be genuinely useful, and structured so it can grow into something more sophisticated later.

**Long-term product direction:** the financial modeling engine (Phases 2–3, 8) is the foundation, not the end state — Analyst Toolkit should not evolve into "just" an increasingly complex financial calculator or an Excel replacement. The eventual differentiator is an AI-powered analyst *workflow* tool: reducing the repetitive manual effort between raw information and a decision-ready analysis, built on top of a modeling core that's rigorous enough for a real analyst to trust. See Phase 9 (Section 8) for the mental model and future capability list — none of it is scoped or scheduled yet; it does not block current work.

---

## 2. Tech Stack (Decided)

* **Frontend:** React + Vite, plain JavaScript (no TypeScript for now — revisit later per Section 5)
* **Backend:** Python (FastAPI) — handles all financial calculations (IRR, cap rate, cash-on-cash, DCF, amortization, etc.). The frontend sends inputs, the backend returns results.
* No database, no auth, no cloud storage until there's a clear reason (see Section 10)
* One external data dependency as of the DCF ticker-search feature: the backend calls Alpha Vantage (company fundamentals/quotes) and SEC EDGAR (filer identification) server-side, keyed via `ALPHA_VANTAGE_API_KEY`. This is the first and — until a new need is explained — only third-party API call in the project; see Section 10 and the PROGRESS.md Decision Log for why and how it's scoped.

**Why a backend now, unlike the original frontend-first default:** Python was chosen deliberately for the calculation layer, since it's the language most associated with analyst/data work and is where this project may eventually grow into heavier data analysis (comps pulls, backtesting, larger datasets). That requires a backend to run. This is an exception to "stay frontend-only until there's a clear reason" — the reason is Python itself.

This is fixed for Phase 1–3. Changing it is a major decision under Section 5.

---

## 3. Product Scope

### Real Estate Underwriting

**V1 scope (build this first, nothing more):**
* Purchase price, NOI, cap rate
* Financing assumptions with a basic debt amortization schedule
* Cash-on-cash return, IRR, equity multiple
* Exit valuation

**Explicitly deferred** (do not build until later phases): multi-year cash flow projections, rent/NOI growth, acquisition/disposition costs, refinancing, multiple debt tranches, sensitivity analysis, scenario comparison, waterfalls/promotes.

### DCF Valuation

**V1 scope:**
* Unlevered free cash flow over a forecast period
* Terminal value, enterprise value, equity value, value per share
* WACC and terminal growth as direct inputs (not built up from components yet)

**Explicitly deferred:** revenue-driver forecasts, margin/working-capital/CapEx modeling as the actual *forecast* mechanism, WACC build-up (beta, capital structure), comparable-company inputs. (Scenario analysis shipped in Phase 8. Historical financials are now retrievable via ticker search — Alpha Vantage fundamentals + SEC EDGAR filer identification — populating the existing flat-growth model's inputs; the deferred item is specifically the *driver-based forecast model itself* (revenue → margin → taxes → D&A → CapEx → ΔNWC replacing flat FCF growth), which has not been built. See PROGRESS.md Decision Log, 2026-08-24.)

Do not build deferred items early just because they seem interesting — see Section 8.

---

## 4. Roles

I'm the finance-domain owner and decision-maker (Honours BComm in Financial Services, strong in financial analysis/valuation/real estate underwriting, limited software experience). Claude does essentially all implementation.

My learning goal is not to become a software engineer — it's to learn **how to use Claude Code effectively** so I can repeat this process on future finance projects.

So:
* Write the code. Don't turn routine work into exercises for me.
* Explain concepts in plain language, focused on things I'd need to reproduce this workflow elsewhere (project structure, how components fit together, how financial logic is separated from UI, how Git/testing/deployment work).
* Don't narrate trivial implementation details.

---

## 5. Autonomy

**Proceed without asking:** routine edits, new components, bug fixes, small refactors, straightforward validation, minor usability improvements, file organization.

**Stop and ask first:** major architectural changes, introducing a backend/database/auth/cloud storage, changing the framework, adopting TypeScript, a significant new dependency, restructuring major parts of the app, or changing how a financial calculation is fundamentally implemented.

For a stop-and-ask decision: explain the decision briefly → present real options → recommend one → say why → wait for approval.

---

## 6. Push Back When Warranted

Don't implement an idea just because I suggested it. If something is overcomplicated, financially questionable, poor UX, premature, or worse than an available alternative — say so, explain why, and propose the better option. I bring financial judgment; you bring technical and product judgment. Both matter.

---

## 7. Financial Accuracy

Treat calculations as core logic, not UI output:
* Clearly defined, explicit assumptions, separated from presentation code, testable, auditable.
* Build automated tests against known expected results for: cap rate, NOI, cash-on-cash, IRR, equity multiple, debt amortization, terminal value, enterprise value, equity value, value per share, WACC.
* I don't write the test code — you do. Explain what's tested and why.
* Where finance conventions genuinely differ (e.g., IRR compounding assumptions, actual/360 vs actual/365), don't silently pick one. Flag it and ask if it materially affects results.
* Validation philosophy: hard-block an input only for genuine mathematical or structural invalidity — the model literally breaks, or stops meaning what it claims to (e.g., WACC ≤ terminal growth rate, or a Gordon Growth terminal-growth assumption outside the formula's actual convergence domain). Don't hard-block purely on economic judgment — an assumption being aggressive, conservative, or unusual is not the same as it being invalid. Surface those as explanatory warnings (why it deserves scrutiny, not just that it's unusual) or methodology guidance instead, and don't disguise a judgment call as validation by giving it a hard-coded universal threshold. First established for DCF terminal growth rate, 2026-08-28 — see the PROGRESS.md Decision Log for the full reasoning, including a real mathematical error caught and corrected mid-discussion.

---

## 8. Development Phases

1. **Foundation** — project setup, architecture, Git workflow, stable dev environment
2. **Real Estate MVP** — V1 scope from Section 3
3. **DCF MVP** — V1 scope from Section 3
4. **Professional Utility** — local scenario saving (localStorage first; revisit only if that becomes limiting), CSV/Excel export, print/PDF-friendly output
5. **Validation** — financial tests, input validation, edge cases, error handling
6. **UX & Visual Design** — hierarchy, navigation, typography, charts, responsive behavior (don't lock into the current prototype's visual identity early)
7. **Deployment** — polished live version, shareable link
8. **Advanced Analyst Features** — the deferred items from Section 3. This is where financial modeling depth gets built out (multi-year cash flows, growth assumptions, sensitivity analysis, scenario comparison, WACC build-up, etc.) — the foundation the Phase 9 vision below depends on.
9. **AI Analyst Features (long-term differentiator — not scoped or scheduled; do not build until explicitly instructed)** — the eventual product direction, once the modeling engine is mature:

   Mental model: raw deal/company information → structured assumptions → financial model → scenarios/sensitivities → risks/insights → decision-ready summary/export. Over time, AI and workflow automation should reduce the manual effort between those stages.

   Example future capabilities (illustrative, not a spec):
   * Importing/extracting data from source documents (OMs, rent rolls, T12s, financial statements) into structured model inputs
   * Automatically structuring raw inputs for the model
   * Identifying missing or inconsistent information in provided data
   * Generating and comparing scenarios
   * Flagging underwriting or valuation risks
   * Interpreting sensitivity results in plain language
   * Generating investment summaries or IC-style commentary
   * Exporting analysis into professional formats

   Does not block the recruiter-ready version.

   **Named future concept — Tenant / Rent-Roll Underwriting Module (not scoped, not scheduled):**
   A more realistic real estate underwriting workflow, modeling a property at the tenant/unit
   level instead of assuming one flat NOI growth rate. Would extend the Phase 8 multi-year
   real estate model (tenant-level lease rollups replacing the flat growth-rate assumption)
   and is a concrete instance of the Phase 9 capabilities above — document extraction (rent
   rolls, lease schedules, OMs) and risk flagging specifically.
   * Tenant/lease-level inputs (illustrative): unit/space count, rent and % of total revenue
     per tenant, lease start/expiry and remaining term, contractual escalations, current vs.
     market rent, renewal probability, expected downtime on rollover, TI/leasing commission
     costs, and transparent tenant-risk factors (credit quality, public/private status,
     financial strength, payment history, revenue concentration).
   * Derived property-level metrics (illustrative): occupancy, tenant concentration,
     lease-expiry schedule and % of rent expiring within 1/2/3/5 years, weighted average
     lease term, rollover exposure, projected rental revenue and NOI.
   * Design principle: no arbitrary or falsely precise "tenant health scores." Prefer
     transparent, evidence-based inputs, and show how those assumptions move cash flow —
     not a black-box score.
   * AI expansion pipeline (same mental model as above, applied here): rent roll/lease
     documents → structured tenant data → lease-level assumptions → multi-year NOI →
     valuation and returns → risk insights.
   * Gate: scope is deliberately not finalized. Before committing to specific fields or
     workflow, validate with real commercial real estate professionals what tenant-level
     information they actually use when underwriting — do not build ahead of that input.

---

## 9. Examples & Data

One worked example per module (one real estate deal, one DCF) so a new user understands the tool fast. App stays built around user-entered assumptions as the primary use case.

---

## 10. Backend Philosophy

A Python backend exists from the start (Section 2) to run the calculation engine. That does not mean "add backend complexity freely" — the backend's job stays narrow: receive inputs, run financial calculations, return results. Keep it stateless for as long as practical.

Don't expand its role — no database, no auth, no persistent storage, no user accounts — until there's real value (cloud-saved analyses, collaboration, proprietary logic staying server-side, third-party API calls, AI features). Explain the need before adding any of that. The backend existing is not itself justification for growing it.

**Third-party API calls (first added 2026-08-24, DCF ticker search):** the backend now proxies read-only calls to Alpha Vantage (fundamentals/quotes) and SEC EDGAR (filer identification), specifically because the DCF module needs real company financial data the app has no way to source itself — evaluated and explained before building, not added by default. This did not change the backend's stateless, no-auth, no-database posture: it still holds no user data. Keep future third-party integrations to the same bar — a clear, explained need, server-side-only credentials, typed errors mapped to clean responses rather than silent failures or fabricated data, and provider choice re-evaluated on its actual current terms (free-tier terms have changed materially industry-wide; don't assume older documentation is still accurate).

---

## 11. Security

Assume shipped frontend code is inspectable. Never commit secrets, API keys, passwords, or credentials — use environment variables. Flag before publishing anything that exposes proprietary logic. Repo can stay private even if the deployed app is public.

---

## 12. Git Workflow

I'm learning Git and want meaningful history. At each real milestone: tell me it's a good commit point, explain what changed in plain language, suggest a commit message, give me exact commands. Group by coherent milestone (setup, calculations, DCF engine, sensitivity, scenario saving, validation, export, UX pass, deployment prep) — not one giant commit. Before proposing a milestone commit, run the documentation review in Section 13 — don't propose the commit as final until that's been checked.

Keep unrelated concerns in separate commits, even when they surface in the same session — e.g. a dev-environment/tooling fix (port conflicts, config housekeeping) is not part of a product-feature milestone and shouldn't be bundled into its commit, even if discovered while working on that milestone.

---

## 13. Progress Tracking & Documentation Discipline

Maintain `PROGRESS.md` in the repo — current phase, what's done, what's in progress, near-term next steps, and a short log of significant decisions (date, decision, alternatives considered, why). Keep it concise; update it at milestones, not every commit.

**Before declaring any meaningful product-development milestone complete, explicitly review whether these need updating:**
* `README.md`
* `PROGRESS.md` (current phase, done/in-progress/next-steps, decision log)
* Roadmap/backlog status (an item moving from planned → implemented)
* Decision log entries for any new financial/modeling convention or architecture/product decision
* `CLAUDE.md` itself, when a durable workflow or architecture decision has changed

Documentation should reflect the actual shipped state of the app, not aspirational or planned functionality. In particular:
* Update test counts when they materially change.
* Update current-feature lists when capabilities are added or removed.
* Record financial/modeling conventions a future session would need to understand — not just what's derivable from a quick code skim.
* Record meaningful architecture/product decisions and *why*, not just what changed.
* Move roadmap items from planned to implemented as they ship.
* Keep the README high-level and portfolio-facing (methodology, capabilities, architecture); internal implementation trivia belongs in `PROGRESS.md`/the decision log, not the README.

**At each commit milestone, report:**
1. Which project docs were reviewed.
2. Which required updates.
3. Whether those updates were included in the current milestone's commit, or intentionally separated into their own documentation commit (and why).
4. Whether any documentation is still known to be stale.

Don't consider a milestone fully complete if important documentation is knowingly stale — unless that's explicitly flagged and we've agreed to defer it.

---

## 14. README

Living portfolio document. Should eventually cover: what it is, who it's for, problems solved, current capabilities, screenshots, live link, financial methodology, architecture, roadmap, how Claude Code was used, what I contributed vs. what Claude built, key decisions, future plans. Be transparent this is AI-assisted — the story is "I supplied domain expertise and direction, Claude implemented," not "built without AI."

---

## 15. Visual Design

Don't over-invest early. Functionality, financial correctness, and information hierarchy come first. Once the structure is mature, propose visual directions with reasoning before committing. End state should read as credible professional finance software, not a generic AI-demo template.

---

## 16. Engineering Practices

Introduce practices (testing, linting, modular structure, CI, TypeScript, etc.) only when they solve a real problem the project currently has — not because "real projects have them." When you do introduce one: explain the problem it solves, why now, and the concept in plain terms.

---

## 17. Recruiter Lens

Periodically self-check from a finance recruiter/PE/asset-management perspective: Is this genuinely useful? Does the financial logic feel credible? Is anything a toy demo? Is there complexity that adds no value? Flag issues, but don't optimize purely for a 5-minute demo — it should hold up as a tool a real analyst could use.

---

## 18. Working Rhythm

**Start of a significant task:** check current project state, briefly summarize what you see, propose next steps.
**During work:** handle routine details independently, explain important concepts as they come up, skip line-by-line narration.
**After meaningful work:** summarize what changed, flag anything I should understand, tell me what to test manually, note if we've hit a good commit point.
**Before major decisions:** stop, per Section 5.

The real objective isn't just finishing Analyst Toolkit — it's me learning a repeatable way to turn finance-domain expertise into working software using Claude Code.
