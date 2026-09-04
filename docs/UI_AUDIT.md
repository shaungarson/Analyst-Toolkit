# UI Audit — DCF workflow and shared app presentation

**Status: complete and closed, 2026-09-04. Phases 1–3 shipped and production-verified;
Phase 4 was reassessed against the materiality standard and deliberately closed unbuilt. No
further UI-audit work is scheduled.**

## Scope decisions

**Print is out of scope and is not a tracked finding.** Print behaviour is excluded from every
finding, phase and verification step below, and no print CSS is to be analysed, repaired or
extended. The existing Print controls and the README's "print-friendly output" wording are
deliberately left untouched.

**Real-estate modeling is frozen** and was not examined. Its navigation and shared chrome were,
and it inherits Phase 1 and Phase 4 automatically since both act on shared surfaces.

## Method

Every finding was measured against the deployed production app
(`analyst-toolkit-ecru.vercel.app`, commit `a4430ce`) with the Costco demo loaded, in Quick and
Driver-Based modes, at 1440×900 / 1280×860 / 800×780 / 375×812, in dark and light schemes.
Numbers are measurements, not estimates.

**Two scans were corrected during the audit** — recorded because the raw output looked alarming
and was not:

- *"40 of 40 buttons have no focus indicator."* False. Programmatic `.focus()` does not reliably
  trigger `:focus-visible`; a real Tab press renders the browser default ring. True finding is
  milder — see I-2.
- *"48 elements print near-invisible."* Over-counted (white-on-black cells print correctly; much
  of the form is `display: none` in print). Moot — print is out of scope and untracked.

---

## Fix now

### F-1 — Driver Schedule is unusable on mobile: 1 of 7 inputs reachable

**Evidence** (375px viewport, Driver-Based mode):

| Measurement | Value |
| --- | --- |
| Table width vs. scroll container | 956px in 285px — **3.35×** |
| Off-screen at any moment | **70%** |
| Pinned `Driver` column | **224px of 285px = 79% of the viewport** |
| Usable width beside the pinned column | **61px (21%)** |
| Forecast input width | **88px — wider than the 61px available** |
| Inputs fully visible scrolled fully right | **1 of 7** |

The driver column is **already `position: sticky`** — that is the cause, not the missing fix. It
pins 224px into a 285px viewport, so the behaviour meant to aid orientation consumes the space
the inputs need. Because an input (88px) exceeds the residual width (61px), **no forecast input
can ever be fully visible alongside its driver name**, a state no amount of scrolling resolves.
At the default scroll position the analyst sees driver names, history truncated mid-number
(`-10.`, `6.7`), a note clipped mid-sentence, and **zero input fields**.

**User impact.** Driver-Based DCF — the app's most substantial modeling feature — cannot be
operated on a phone, and presents as broken rather than desktop-oriented.

### F-2 — Dark-mode palette fails WCAG AA on primary actions and financial values

**Evidence.** Contrast sweep of the fully populated workspace: **dark mode 15 failures, light
mode 1**. This is a dark-palette defect, not a general one.

| Ratio | Element |
| --- | --- |
| 3.12:1 | `stockanalysis.com` source links (×2) |
| 3.42:1 | **Load Company** button |
| 3.42:1 | **Costco Demo** button |
| 3.42:1 | `Sources ▼`, `5-yr history ▼` toggles |
| 3.42:1 | Step badges 1 / 2 / 3 |
| 3.42:1 | **`$6.45B`** — a sourced financial value |

Cause is dark-mode `--accent` (`#4a6f92`): 3.42:1 on `--bg`, **3.12:1 on `--panel-bg`**. It is
used as `color` in **15** rules — including `.valuation-hero .hero-value` and
`.reverse-dcf-value`, the app's headline numbers — and as `background` in **10**. The hero value
escapes the sweep only because at 38.4px bold it qualifies as large text (3:1 threshold).
Border/outline uses need only 3:1 (WCAG 1.4.11) and already pass at 3.12.

**User impact.** The two buttons that begin every session are the least legible controls on the
page in the default theme, and a sourced financial value at 3.42:1 is worse in kind — that is
data, not chrome.

**Resolved as Treatment B and implemented in Phase 1** — see "Resolved decision" below.
Measured after the change: **0 contrast failures**, down from 15.

### F-3 — "History & reference" is too compressed to scan, and mislabels its own content

**Evidence.** One 199px cell carries five kinds of information with no separation. The live NWC
row renders as an unbroken run:

```
’22 3.48  ’23 -10.87  ’24 -2.10  ’25 -8.41  agg -3.26%UNSTABLE
```

Year labels at 0.62rem/70% opacity are the smallest type in the table yet carry the axis; the
derived statistic sits inline so `-3.26%` reads as a fifth observation rather than the figure
computed from the other four; `med`/`agg` are undefined tokens; `-3.26%UNSTABLE` runs together;
and **"reference" collides with the workspace's separate Reference Share Price**.

**Accepted vocabulary:**

| Concept | Term |
| --- | --- |
| Annual observations | **Historical evidence** |
| The Median / Aggregate statistic | **Historical benchmark** |
| Status | **Reliability**: Reliable · Thin history · Unstable |
| An assumption actually populated from acceptable evidence | **History-informed** |

A benchmark not used to initialize says so explicitly — the model refuses it, so calling it a
"starting point" would assert the opposite of the truth:

```
Historical benchmark   Aggregate −3.26%
Not used to initialize — unstable history
```

**Decision: two regions inside the existing column, not two columns.** At 1440px with the
default five-year horizon the table measures **1335px inside a 1335px container — zero spare**,
so a ninth column forces scrolling in the most common configuration on the widest surface; year
columns are 148px each with up to 15 allowed; and observations plus their derived statistic are
one evidence claim, which sibling columns would present as two independent facts.

**No extra width is required** — both risks were tested by substituting real text into the live
DOM: `FY22` labels cost **nothing** horizontally (the year sits above the value; `-10.87` is
already wider than any four-character year; row height 25px → 26px), and `Aggregate −3.26%` plus
the 58px badge measures **176px in the 199px column**, still one line.

**Typography: no new micro-labels.** Fiscal-year labels rise **0.62rem → 0.78rem (~12.5px)** and
lose the 0.7 opacity. Region labels are **sentence case at ~12px**, not uppercase micro-caps.
**No hairline rule** — separation comes from vertical rhythm and one weight step; a rule is the
fallback if review shows it is needed, not the opening move.

### F-4 — Replace the NWC Unstable popover with an inline disclosure

**Evidence.** The badge is a `<button>` opening a **fixed-position floating popover** positioned
by hand from the trigger's bounding rect (it sits inside a horizontally scrolling table that
would otherwise clip it), carrying a hard-coded `POPOVER_WIDTH`, an `ESTIMATED_POPOVER_HEIGHT`
guess for flip direction, a document-level `mousedown` listener, an Escape handler and manual
focus return. Separately, **"Unstable" renders exactly twice** — verified live — once as the
badge and again heading the note row.

**Accepted treatment.** The badge becomes a **static, non-clickable reliability indicator**,
deleting the popover module and the `.driver-history-col .driver-reliability-btn` specificity
workaround that exists only because a `<button>` inside `.feature-page` otherwise renders as a
filled accent button. The existing full-width note row becomes the trigger:

```
Collapsed:  Why this history is unstable and how to set the assumption  ▾

Expanded adds:
  What happened   Working capital switched between consuming and releasing cash
                  as revenue grew, so one historical ratio is unreliable.
  What to do      Choose a normalized assumption using analyst judgment. Use 0%
                  if no defensible relationship exists. Sensitivity-test both
                  directions.
```

**Disclosure mechanism — re-derived now that print is excluded.** The original recommendation
(`<button aria-expanded>` + `.no-screen`) rested primarily on print behaviour, and that argument
is gone. Re-deciding on the stated criteria: *screen clarity* — equivalent; *accessibility* —
both are standard and keyboard-operable; *simplicity* — `<details>` wins, needing no state or
ARIA wiring; *consistency* — the existing pattern wins, and decisively, because this workspace
already uses `<button aria-expanded>` in four places ("How to read this", "ⓘ Methodology",
"Sources ▼", "5-yr history ▼"). Introducing `<details>` for a fifth disclosure on the same page
would create two idioms with different keyboard semantics and different affordances.
**Recommendation: keep the existing button/region pattern**, on consistency rather than print.
If the project later prefers `<details>`, all five should convert together.

---

## Defer

### D-1 — No type scale: 22 distinct font sizes on one screen

**Evidence.** The populated workspace renders **22 distinct computed font sizes**, eight of them
between 10.24px and 12.48px — steps as small as 0.32px, visually indistinguishable but
individually maintained. **51 text nodes below 12px** across 25 classes. Cause is ad-hoc rem
values (0.64/0.66/0.68/0.70/0.72/0.74/0.76/0.78) chosen per component.

**User impact.** Diffuse rather than acute. Density is the right instinct for a finance tool;
22 sizes is not density, it is drift — and it is why each new component invents its own small
size.

**Outcome: closed unbuilt (2026-09-04).** Re-measured after Phases 1–3 at 23 distinct sizes and
51 nodes under 12px — materially unchanged, and materially harmless: nothing below 12px carries a
number. See "Phase 4 — Closed unbuilt" below.

### D-2 — Costco demo note is a wall of dense text on mobile

**Evidence.** At 375px the demo disclosure fills most of the first screen after the company bar:
a ~120-word paragraph at ~11.5px before any data or control is reachable.

**User impact.** The demo is the primary entry point, and the first phone screen is explanatory
prose rather than analysis. The content is the provenance disclosure that makes the demo honest
and must not be cut — only collapsed.

**Scheduled into Phase 3**, reusing the Phase 2 disclosure component.

---

## Informational

**I-2 — Focus styling is inconsistent, not absent. Closed unbuilt (2026-09-04).**
`index.css`, `App.css` and `feature-form.css` contain **zero** `:focus-visible` rules;
`workspace.css` has 9, all narrowly scoped to later-added components. Everything else inherits
the browser default ring — measured on the deployed build at **7.53:1** against the dark
background, above the 3:1 non-text requirement, with `:focus-visible` matching correctly.
Keyboard navigation is functional and visible; only its appearance varies.

**I-3 — The tornado is the internal reference pattern.** The driver sensitivity chart already
does what F-3 and F-4 ask for elsewhere: values as real text in real cells, status conveyed by
tier word plus short name plus affected years, nothing hover-only.

**I-4 — Light mode no longer exists.** The audit originally noted light mode as healthy (one
contrast failure against dark mode's fifteen). Phase 1 made the app dark-only, so the light
palette and the `prefers-color-scheme` switch are gone and this finding is closed.

---

## Implementation phases

Approval workflow for every meaningful UI phase: **present the design → wait for approval →
implement only the approved direction → show the working result → wait again before committing,
deploying, or starting the next phase.** Routine spacing, wrapping, regression fixes, and
accessibility corrections that preserve an already-approved design do not need their own
approval round.

Print behaviour is excluded from all phases and all verification.

### Phase 1 — Contrast and shared accessibility semantics

- Fix dark-mode contrast failures across primary actions, links, toggles and financial values
  (**F-2**).
- Add a `<main>` landmark and a DCF `<h1>` (the module currently starts at `h2`; Real Estate
  already has one).
- Expose the active module to assistive technology (`aria-current` on the active nav button;
  today the active state is conveyed by a visual class alone).
- Improve table labeling using existing headings — `aria-labelledby` referencing the headings
  already on the page. **No redundant visible captions.**
- Hide decorative step numbers (1 / 2 / 3) from assistive technology.
- General focus-style standardization is **not** in this phase — held for Phase 4.

**Also decided in Phase 1: the app is dark-only.** The former dark values were promoted to
`:root`, both `prefers-color-scheme` blocks were removed, and `color-scheme` is now `dark`. This
preserves the existing dark appearance rather than introducing a new theme — there is no toggle
and no light palette to maintain.

**Status: implemented, awaiting review.** Verified with the OS preference forced to *light* (the
app still renders dark), 0 remaining contrast failures, accent surfaces unchanged, `<main>` and
a visually-hidden DCF `<h1>` present, `aria-current="page"` on the active module only, all
tables named via `aria-labelledby` to existing headings (or `aria-label` where no heading
exists) with **no visible captions added**, and step numerals hidden from assistive technology.
223 frontend tests, lint and build clean; console clean in both forecast modes.

### Phase 2 — Driver Schedule clarity

**F-3** and **F-4** together, plus the visible **"Seeded" → "History-informed"** rename. They
edit the same component and the same vocabulary; splitting them would touch `DriverEvidence`
twice and ship half a vocabulary.

**Rename the visible label only.** `seededFields`, `clearSeed` and related internal state keep
their names — no technical reason requires changing them, and doing so would enlarge the diff
for no user benefit.

**Status: shipped.** Column header is `History`; the cell carries Historical evidence /
Historical benchmark / Reliability; `Reliable` is stated quietly on healthy rows; `Unstable` is
said once with `Not used as starting point` as its consequence; the popover is replaced by an
inline `<button aria-expanded>` disclosure. See "Driver Schedule evidence hierarchy and inline
NWC guidance" in [`decisions.md`](decisions.md).

### Phase 3 — Mobile usability

- Replace the mobile Driver Schedule table with a **stacked per-driver layout** below an
  evidence-based breakpoint (**F-1**). Preserve every historical observation and every forecast
  input — no truncation, no "+2 more".
- Improve the mobile Costco disclosure using the Phase 2 disclosure pattern (**D-2**).
- **Fix undersized touch targets in this phase**, not deferred to typography: `Sources ▼` and
  `5-yr history ▼` (**14px tall**), `How to read this` and `ⓘ Methodology` (14px), `SEC filings
  ↗` (23px), and the two `stockanalysis.com` links (16px) — seven controls under 24px.

**Status: shipped.** Stacked per-driver panels below 720px, driven by a CSS presentation switch
over the same markup and state — no second layout component. Fields are 16px (the iOS
focus-zoom floor) and 44px tall; eight mobile touch targets, six at 44px or above. See "Stacked
Driver Schedule below 720px" in [`decisions.md`](decisions.md).

**Success criterion met:** at 320px and 375px with a 15-year Custom forecast, all 90 forecast
inputs are fully visible and focusable, with no horizontal page overflow.

### Phase 4 — Closed unbuilt (2026-09-04)

Reassessed against the materiality standard after Phases 1–3 shipped, by **re-measuring the
deployed build** rather than reasoning from the original audit. Both findings survive as
observations; neither justifies the work.

**D-1 (type scale) is unchanged in size and immaterial in effect.** The shipped build still
renders **23 distinct font sizes** (was 22) and **51 text nodes below 12px** (was 51) — Phases
1–3 were scoped not to touch it, and did not. But magnitude is not materiality:

- *Usability:* every figure an analyst reads a decision from is well above 12px — the hero value
  at 38.4px, price-implied growth at 20.8px, sourced values and sensitivity cells at 14.4px, and
  the driver evidence cell at 12.5px after Phase 2. **Nothing below 12px carries a number**; what
  is small is chrome — step badges, chart axis labels, provenance captions, print-hidden toggles.
- *Accessibility:* zero contrast failures after Phase 1, and every editable field is 16px on
  mobile after Phase 3, so the iOS focus-zoom trap is gone. Small text with passing contrast that
  carries no decision data is not an accessibility defect.
- *Credibility:* dense secondary type is the idiom of professional finance tooling. The surfaces
  a reviewer actually judges — the headline valuation, the tornado, the evidence cell — were the
  ones Phases 1–3 corrected.

The real cost of 23 sizes is **maintenance**: each new component re-invents its own small size.
That cost falls on future development, not on the analyst, and does not clear the bar this audit
set for blocking or scheduling work.

**I-2 (focus styling) is functional and sufficiently contrasted.** Measured on the deployed
build: a real Tab press produces the browser's `outline: auto 1px` ring in amber, at **7.53:1**
against the dark background — well above the 3:1 non-text requirement, and `:focus-visible`
matches correctly. Keyboard navigation works and is clearly visible throughout. The finding was
only ever that its *appearance* varies (nine components define custom rings, the rest inherit the
default), which is a stylistic seam with no reported or observable impact.

**A broad refactor is not justified by the expected user benefit.** It would touch nearly every
component and carry regression risk in a theme that currently has zero contrast failures, to
resolve a maintenance concern with no user-facing symptom.

**Permitted follow-on, not scheduled:** a small set of typography tokens may be adopted
**opportunistically** when a component is being changed for a higher-value reason. **Do not
implement or schedule a token migration.** A sweeping adoption pass is exactly the cleanup this
decision declines.

---

## Resolved decision — dark accent palette (Treatment B, implemented in Phase 1)

Measured against the two dark backgrounds (`--bg #0f1720`, `--panel-bg #16202b`), with
`--accent` used as `color` in 15 rules and as `background` in 10:

| | Foreground vs `--bg` | Foreground vs `--panel-bg` | White text on accent **surface** |
| --- | --- | --- | --- |
| Current `#4a6f92` | 3.42 ✗ | 3.12 ✗ | **5.28 ✓** |
| Lightened `#6b89a6` | 4.94 ✓ | 4.51 ✓ | **3.65 ✗** |

**Treatment A — lighten the shared token.** One-line change, fixes all 15 foreground uses. But
the same token is 10 background surfaces (Run Valuation, the active nav tab, the Value Bridge
result band, the sensitivity base-case cell, mode toggles), and white text on the lightened
surface falls to **3.65:1 — a new AA failure**. Avoiding that means flipping surface text to
dark (4.94 ✓), which restyles every filled control in the app.

**Treatment B — split foreground from surfaces.** Keep `--accent: #4a6f92` for the 10 surfaces
(white text stays at 5.28 ✓) and introduce `--accent-text: #6b89a6` for the 15 foreground uses.
Borders and outlines stay on `--accent` and already meet the 3:1 non-text requirement at 3.12.

**Chosen: Treatment B.** It fixes exactly what fails and changes nothing that passes. Treatment
A would have traded 15 foreground failures for 10 surface failures unless it also restyled every
filled control — a visual redesign arriving as a side effect of an accessibility fix.

**Implemented in Phase 1:** `--accent-text: #6b89a6` added for the 15 `color` declarations;
`--accent: #4a6f92` retained for all 10 surfaces plus every border and outline. Measured after
the change: **0 contrast failures** (from 15), with the Run Valuation surface still
`rgb(74, 111, 146)` carrying white text at **5.28:1** — unchanged.
