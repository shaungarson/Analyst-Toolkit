# Analyst Toolkit — Project Instructions

## 1. Purpose & Long-Term Direction

A professional finance web app demonstrating AI-assisted software development for analyst
workflows — real estate underwriting and DCF valuation. Audience: recruiters, PE/CRE
professionals, finance teams. Target reaction: "this person knows how to use AI to build
tools that make analysts more productive." Genuinely useful, not a demo.

The modeling engine is the foundation, not the end state. Long-term, Analyst Toolkit should
grow into an AI-powered analyst *workflow* tool — reducing manual effort between raw
information and a decision-ready analysis — built on a modeling core rigorous enough for a
real analyst to trust. Not scoped or scheduled; see `docs/ROADMAP.md`'s Parked column. Does
not block current work.

## 2. Product Boundaries

Two modules: real estate underwriting and DCF valuation, each with a working core engine.
Current capabilities: `README.md`. Accepted financial methodology:
`docs/MODELING_CONVENTIONS.md`. Current technical architecture: `docs/ARCHITECTURE.md`.
Planned and deferred scope: `docs/ROADMAP.md`. Real estate is currently frozen — see
Blockers in `PROGRESS.md`.

Don't build deferred items early just because they seem interesting.

## 3. Roles & Collaboration

I'm the finance-domain owner and decision-maker (Honours BComm in Financial Services, strong
in analysis/valuation/real estate underwriting, limited software experience). Claude does
essentially all implementation.

My learning goal is not to become a software engineer — it's to learn how to use Claude Code
effectively so I can repeat this process on future finance projects.

So: write the code, don't turn routine work into exercises for me; explain concepts in plain
language focused on what I'd need to reproduce this workflow elsewhere; don't narrate
trivial implementation details.

## 4. Autonomy

Proceed without asking: routine edits, new components, bug fixes, small refactors,
straightforward validation, minor usability improvements, file organization.

Stop and ask first: major architectural changes, introducing a backend/database/auth/cloud
storage, changing the framework, adopting TypeScript, a significant new dependency,
restructuring major parts of the app, or changing how a financial calculation is
fundamentally implemented.

For a stop-and-ask decision: explain the decision briefly → present real options → recommend
one → say why → wait for approval.

## 5. Push Back & Materiality

Don't implement an idea just because I suggested it. If something is overcomplicated,
financially questionable, poor UX, premature, or worse than an available alternative — say
so, explain why, propose the better option. I bring financial judgment; you bring technical
and product judgment.

**Materiality and stop rule:** before expanding a task or recommending another review cycle,
weigh the realistic likelihood and material impact. Block a milestone only for issues that
could meaningfully affect normal analyst use, financial correctness, data integrity,
security, or deployment — not implausible inputs already covered by a general safeguard.
Consolidate related feedback into one review pass; don't repeatedly reopen a working
solution for progressively narrower edge cases without new material evidence. Weigh the
time/token/opportunity cost of further review against the value of the next planned
milestone.

## 6. Financial Validation Principle

Treat calculations as core logic, not UI output: explicit assumptions, separated from
presentation, testable, auditable, tested against known expected results. Where finance
conventions genuinely differ (e.g. IRR compounding, actual/360 vs actual/365), flag it and
ask rather than silently picking one.

**Validation philosophy** — separate computational validity from economic reasonableness.
Hard-block an input only when it prevents a mathematically valid result: an undefined
formula, failed convergence, missing required structure, overflow, or a non-finite result.
If the calculation stays well-defined but the assumption is economically unusual or
nonsensical, let the analyst run it and surface a specific, prominent warning instead — never
a universal economic cap, never a silent substitution.

**Standing lesson:** "this looks economically strange" quietly substituting for "this is
computationally undefined" is a recurring failure mode here, caught more than once. Watch for
it explicitly — see `docs/decisions.md` for the specific incidents.

## 7. Architecture

Frontend: React + Vite, plain JavaScript (revisit TypeScript only when the codebase
justifies it). Backend: Python (FastAPI) — handles all calculations; the frontend sends
inputs, the backend returns results. Stateless: no database, auth, persistent storage, or
user accounts — until a clear need is explained (cloud-saved analyses, collaboration,
proprietary server-side logic, a new third-party API call).

**Current data providers (DCF ticker search, this project's only third-party dependency):**
SEC EDGAR is the primary source for historical fundamentals (XBRL company facts); Alpha
Vantage fills any field SEC can't confidently map, and is the sole source for the reference
price (an editable, dated input — not a live quote). Every sourced field discloses its own
provenance (reported/combined/calculated/fallback). Full technical detail:
`docs/ARCHITECTURE.md`.

**Bar for any new third-party integration:** a clear, explained need, stated before
building, not added by default. Server-side-only credentials. Typed errors mapped to clean
responses, never silent failures or fabricated data. Re-evaluate provider terms against
their actual current state, not older documentation.

## 8. Security

Assume shipped frontend code is inspectable. Never commit secrets, API keys, passwords, or
credentials — use environment variables. Flag before publishing anything that exposes
proprietary logic. Repo can stay private even if the deployed app is public.

**Standing lesson:** an upstream provider's own error response can leak a secret (confirmed
live: Alpha Vantage's rate-limit message echoed this app's shared API key back in plain
text). Never relay an upstream error message to the client verbatim without checking whether
it can carry something sensitive — raise a generic message instead, and log the real one
server-side only.

## 9. Git & Documentation Discipline

Meaningful Git history: at each real milestone, explain what changed in plain language,
suggest a commit message, give exact commands, group by coherent milestone — keep
dev-environment/tooling fixes in separate commits from product-feature milestones.

Before declaring a milestone complete, review whether these need updating: `README.md`;
`PROGRESS.md` (current milestone, blockers, recently shipped, next actions);
`docs/ROADMAP.md` (an item moving from planned to implemented); `docs/decisions.md` (a new
durable financial/architecture decision); `docs/ARCHITECTURE.md`/`docs/MODELING_CONVENTIONS.md`
(current-state facts that changed); `CLAUDE.md` itself (a durable operating rule changed).
Report what was reviewed, what was updated, and any known-stale documentation intentionally
deferred.

**Anti-bloat rule:** `PROGRESS.md` holds current state only. A completed milestone's
detailed narrative does not stay there — it moves to `docs/decisions.md` (if durable) or
`docs/archive/` (if historical detail) as part of that milestone's own documentation review,
not as a later cleanup pass. As a backstop, if `PROGRESS.md` exceeds roughly 150-200 lines,
that alone is a signal something wasn't moved out.

## 10. Engineering Practices & Verification

Introduce practices (testing, linting, CI, TypeScript, etc.) only when they solve a real
problem the project currently has — not because "real projects have them."

**Standing lesson:** every external-data integration in this project has shipped with a
bounded live-verification step against real data, in addition to fixture-based tests — and
every time, it has found at least one real bug fixtures alone did not surface (a provider's
inconsistent field coverage; a fiscal-date normalization mismatch between two providers).
Fixtures alone are not sufficient for a new data integration — budget for live verification
as part of that milestone, not as optional polish.

Periodically self-check from a finance recruiter/PE perspective: is this genuinely useful,
does the financial logic feel credible, is anything a toy demo, is there complexity that
adds no value? Don't over-invest in visual design early — functionality and financial
correctness come first; propose visual directions with reasoning once the structure is
mature.

## 11. Document Map

- **`CLAUDE.md`** (this file) — durable operating instructions, always loaded.
- **`PROGRESS.md`** — current state only: milestone, blockers, recently shipped, next
  actions.
- **`README.md`** — portfolio-facing: capabilities, methodology summary, architecture
  summary.
- **`docs/ARCHITECTURE.md`** — current technical truth.
- **`docs/MODELING_CONVENTIONS.md`** — current accepted financial methodology.
- **`docs/ROADMAP.md`** — Now / Next / Later / Parked.
- **`docs/decisions.md`** — durable decision history (Accepted / Superseded / Deferred).
- **`docs/archive/PROGRESS_HISTORY.md`** — full historical implementation log, frozen.
- **`AGENTS.md`** — automatically loaded by Codex; defines its consultant-only operating
  boundary (no file edits, builds, or state-changing Git operations).
- **`CHATGPT_CONSULTANT.md`** — the complete consultant-role specification Codex reads via
  `AGENTS.md`; the user's own prompt for that separate tool, not maintained by Claude Code
  except when explicitly asked.
