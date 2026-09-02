---
name: milestone-closeout
description: Runs Analyst Toolkit's end-of-milestone review before a milestone is declared done — inspects what actually changed, runs focused checks followed by the relevant complete test/lint/build suites, applies CLAUDE.md's documentation-review and anti-bloat rules, decides whether the financial-model-reviewer subagent is warranted, and reports readiness with a suggested commit message. Invoke explicitly when the user says something like "close out this milestone," "run milestone closeout," "is this ready to commit," "wrap up this milestone," or "/milestone-closeout." Do NOT invoke automatically after a routine commit, a small fix, mid-task, or just because tests were run — this fires only at a genuine milestone boundary, on deliberate request.
disable-model-invocation: true
---

# Milestone Closeout

A milestone in this project ends the same way every time: verify it actually works, check
whether the project's documentation still tells the truth, and decide if it's ready to hand
to the user for commit. This skill runs that sequence so nothing gets skipped under time
pressure and the result is reported the same way every time.

This skill never commits, pushes, or deploys. It never edits CLAUDE.md, AGENTS.md, or
CHATGPT_CONSULTANT.md. Its output is a report — the human (or the invoking session) decides
what to do with it.

## Step 1 — Read CLAUDE.md fresh

Read the repository's `CLAUDE.md` at the start of every run, in full. Don't rely on a
remembered summary of its rules — they're the actual governing rules for this repo and this
skill's own instructions below (documentation checklist, anti-bloat threshold, materiality
principle) are a paraphrase of specific numbered sections there (currently §9 and §5). If
CLAUDE.md has changed since this skill was written, CLAUDE.md wins — follow what it says now,
and note the discrepancy in the report's Findings section as informational.

## Step 2 — Determine the scope of this milestone

Run `git status --short --untracked-files=all` (or `git ls-files --others
--exclude-standard` for just the untracked list) first — read every line, not just the
summary. Plain `git status --short` collapses an entire untracked directory into one `??
directory/` entry, which hides everything inside it; `--untracked-files=all` (or `git
ls-files`) lists each individual file instead. A plain `git diff` says nothing about untracked
files either way — a new file has no tracked baseline to diff against, so it simply won't
appear. A milestone that adds a new file (a new module, a new skill, a new config) is exactly
the case where skipping this would miss the entire change. So:

- For every **modified/tracked** path, use `git diff` (and `git diff --stat` for a quick shape
  of the change) — this covers what changed.
- For every **untracked (`??`) path** from the individual-file listing, read that file's full
  contents directly (it's new — there is no diff to show). Never treat a `??` line ending in
  `/` as one item — if you see a directory rather than a file path, you're looking at plain
  `git status` output, not the individual-file listing this step requires; re-run with
  `--untracked-files=all` or `git ls-files --others --exclude-standard` instead.
- If there are uncommitted changes (tracked or untracked), that's the milestone's scope.
- If the working tree is clean but there are local commits not yet on the remote (`git log
  origin/main..HEAD` or equivalent), treat the unpushed commits as the scope — they haven't
  been through a closeout review yet.
- If neither applies (clean tree, nothing unpushed), stop and ask the user what scope they
  mean rather than guessing — there's nothing to review.

From the full changed-file list — modified and untracked together — classify what stack(s)
moved: `backend/**` (Python/FastAPI), `frontend/**` (React/Vite), docs-only, or
config/tooling-only (`.claude/**`, CI config, etc). This drives steps 3 and 4.

## Step 3 — Run the relevant checks

Only run suites for stacks that actually changed — don't burn time re-running an unaffected
stack's full suite on every closeout. Within an affected stack, run **focused checks first,
then the appropriate complete checks** — focused checks give fast, specific feedback on the
exact thing that changed; the complete suite catches what a narrow check can't (regressions
elsewhere, integration issues, a build break downstream of passing tests).

- **Backend changed:**
  1. *Focused:* if the change maps to a specific test module (e.g. `app/dcf/valuation.py`
     changed and `tests/test_dcf_valuation.py` exists), run just that file first
     (`./venv/Scripts/python -m pytest tests/test_dcf_valuation.py`, or the equivalent
     activation for the current shell). If no test file obviously corresponds to what changed,
     say so explicitly in the report ("no focused test exists for X") — don't invent a
     targeted command that doesn't correspond to anything real.
  2. *Complete:* run the full backend suite (`./venv/Scripts/python -m pytest` from
     `backend/`). Note the pass/fail count.
- **Frontend changed:**
  1. *Focused:* if a specific `*.test.js` file corresponds to the changed module, run it on its
     own first. If nothing corresponds, say so rather than fabricating one.
  2. *Complete:* run `npm test`, then `npm run lint`, then `npm run build`, in that order, from
     `frontend/`.
- **Docs, config, or tooling changed (`.claude/**`, CI config, markdown docs, etc.) — no
  application test suite applies here, but that is not the same as nothing to verify.** Do
  targeted structural or behavioral validation appropriate to what actually changed instead of
  treating the absence of pytest/npm as a pass. Examples, not an exhaustive list — use
  judgment for what the specific change calls for:
  - A JSON/YAML config file (e.g. `.claude/launch.json`, a skill's or agent's frontmatter):
    confirm it actually parses, and confirm required fields are present and correctly typed.
  - A launch/config change that affects how something is started: actually start it (or the
    smallest reproducible piece of it) and confirm it behaves as intended, the way you'd
    verify any behavioral change — don't just eyeball the diff and assume it works.
  - A new or edited skill/agent file: check it's placed where the relevant tool expects it, and
    note plainly if live invocation can't be confirmed from within the current session (that's
    a known harness limitation, not something to paper over as "looks fine").
  - A prose-only doc edit: check that any changed code snippets, commands, or file references
    in it are still accurate against the current repository state.

If something fails, that's a **fix now** finding by construction — don't proceed to write a
"ready" verdict around a red suite or a config that doesn't parse.

This skill only decides pass/fail readiness. It does not hunt for code-quality,
simplification, or reuse issues — that's `/code-review`'s job, and it's a separate,
complementary step the report should mention, not something this skill tries to replicate.

## Step 4 — Decide whether the financial-model-reviewer is warranted

Invoke the `financial-model-reviewer` subagent (via the Agent tool, `subagent_type:
"financial-model-reviewer"`) **only if** the changed-file list from Step 2 touches any of:

- calculation logic in the backend DCF or real-estate underwriting engine
- derived financial metrics (anything computed from inputs, not just displayed)
- validation boundaries — input validation, or the hard-block-vs-warning distinction CLAUDE.md
  §6 governs
- sourced-data provenance — SEC EDGAR / Alpha Vantage field mapping, status labeling,
  disclosure
- financial methodology — anything in `docs/MODELING_CONVENTIONS.md`'s territory

If the change is purely UI/copy/styling/docs/tooling with no calculation-surface contact,
**skip the subagent** and say so explicitly in the report ("financial-model-reviewer not
invoked — this milestone touched no calculation surface") rather than invoking it as a matter
of routine. It's expensive and its whole value is being reserved for changes where financial
correctness is actually at stake.

When invoking it, hand it the diff or changed-file list from Step 2 directly — it has no
access to this conversation's history and needs the concrete change to review, not a summary
of intent.

## Step 5 — Documentation review (CLAUDE.md §9, paraphrased — verify against the copy you
read in Step 1)

Check whether each of these needs updating for what actually shipped in this milestone. Not
every milestone touches every file — most won't. Only edit a file if there's a real,
milestone-specific update to make; don't pad an entry just to show activity.

- **`README.md`** — capability or architecture summary changed for a portfolio reader.
- **`PROGRESS.md`** — current milestone, blockers, recently shipped, next actions. This one
  almost always needs a "Recently Shipped" line for a real milestone.
- **`docs/ROADMAP.md`** — an item moved from planned to implemented.
- **`docs/decisions.md`** — a new durable financial or architecture decision was made.
- **`docs/ARCHITECTURE.md`** / **`docs/MODELING_CONVENTIONS.md`** — a current-state fact
  changed (a new data path, a new calculation rule, a changed convention).
- **`CLAUDE.md` itself** — a durable operating rule changed. **Do not edit this file.** If you
  believe it needs a change, describe the exact change as a recommendation in the report
  instead — this is a deliberate boundary, not an oversight.

You may edit `README.md`, `PROGRESS.md`, `docs/ROADMAP.md`, `docs/decisions.md`,
`docs/ARCHITECTURE.md`, and `docs/MODELING_CONVENTIONS.md` directly as part of this step —
that's the point of the review, and matches how this project already handles documentation at
milestone close. Never edit `CLAUDE.md`, `AGENTS.md`, or `CHATGPT_CONSULTANT.md` — flag a
needed change there instead of making it.

**Anti-bloat rule:** `PROGRESS.md` holds current state only. A completed milestone's detailed
narrative belongs in `docs/decisions.md` (if it's a durable decision worth a permanent record)
or `docs/archive/` (if it's historical detail worth keeping but not decision-worthy) — moved
there as part of *this* review, not deferred to a later cleanup. Check `PROGRESS.md`'s current
line count: past roughly 150-200 lines is itself a signal something should have been moved out
already, even if this particular milestone didn't cause it.

## Step 6 — Classify remaining findings

Anything left unresolved after steps 3-5 gets one of three labels, using CLAUDE.md §5's
materiality principle (verify against what you read in Step 1) to decide which:

- **Fix now** — would meaningfully affect normal analyst use, financial correctness, data
  integrity, security, or deployment. A failing test or build always lands here.
- **Defer** — real but not milestone-blocking; worth a `docs/ROADMAP.md` or `PROGRESS.md`
  "Next Actions" note rather than holding up this milestone.
- **Informational** — worth knowing, not actionable or not worth acting on (a documentation
  discrepancy noticed in Step 1, a suite that couldn't run for an environmental reason, etc).

Don't manufacture findings to fill out the report — an empty Findings section on a clean
milestone is the expected, good outcome.

## Step 7 — Report

Always use this exact structure:

```markdown
## Milestone Closeout Report

### Readiness
[Ready to commit / Ready with caveats / Not ready — one line naming the blocker]

### Checks Run
[Which suites ran and their result — e.g. "Backend: 153/153 pytest passing. Frontend: not
run — no frontend files in this diff."]

### Financial Reviewer
[Invoked — summary of its findings / Not invoked — no calculation-surface change in this diff]

### Documentation Reviewed
[Each file checked; for each, either "no change needed" or a one-line description of what was
edited]

### Intentional Deferrals
[What was consciously left alone and why — omit this section entirely if there are none]

### Findings
[Fix now / Defer / Informational, each with a one-line reason — omit this section entirely if
there are none]

### Suggested Commit Message
[A subject line and body matching this repo's existing style — check `git log` for recent
examples: short imperative subject, then a body explaining what changed and why]
```

Do not commit, push, or deploy anything — even when readiness is "Ready to commit." That
decision and action stay with whoever asked for this review.
