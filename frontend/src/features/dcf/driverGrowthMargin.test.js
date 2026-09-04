import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  GRID_WARNING_DESCRIPTIONS,
  cellTierClass,
  describeCellWarnings,
  formatShift,
  summarizeGridWarnings,
  summarizeShiftedPath,
  warningFootnotes,
} from './driverGrowthMargin.js'

const STEP = 0.01
const MAX_SHIFT = 0.02

const cell = (value, warnings = []) => ({
  value_per_share: value,
  delta: value === null ? null : value,
  new_warnings: warnings,
})

const gridRows = (values) =>
  values.map((row, i) => ({
    revenue_growth_delta: (i - 2) * STEP,
    cells: row.map((v) => cell(v)),
  }))

// --- formatShift --------------------------------------------------------------------------

test('the centre of each axis is named, not written as a zero shift', () => {
  assert.equal(formatShift(0), 'Base')
  assert.equal(formatShift(0.0), 'Base')
})

test('a shift reads as a signed movement in percentage points', () => {
  assert.equal(formatShift(0.01), '+1pp')
  assert.equal(formatShift(0.02), '+2pp')
  // A real minus sign, matching the currency and delta formatting elsewhere in the app.
  assert.equal(formatShift(-0.01), '−1pp')
  assert.equal(formatShift(-0.02), '−2pp')
})

// --- summarizeShiftedPath -----------------------------------------------------------------

test('a flat row reports its single level and the range of shifts applied to it', () => {
  const text = summarizeShiftedPath([0.18, 0.18, 0.18], MAX_SHIFT, STEP)
  assert.equal(text, 'Flat 18.00% · shifted ±2pp in 1pp steps')
})

test('a fading row reports its real path rather than one representative value', () => {
  const text = summarizeShiftedPath([0.0746, 0.0622, 0.0498, 0.0374, 0.025], MAX_SHIFT, STEP)
  assert.equal(text, '7.46% → 2.50% over 5 years · shifted ±2pp in 1pp steps')
  // No single level is claimed for a row that does not have one.
  assert.ok(!text.startsWith('Flat'))
})

test('a row that moves both directions reports its range, not a false trend', () => {
  const text = summarizeShiftedPath([0.05, 0.09, 0.04, 0.07], MAX_SHIFT, STEP)
  assert.ok(text.startsWith('Varies 4.00%–9.00% over 4 years'))
  assert.ok(!text.includes('→'))
})

test('an empty path summarizes to nothing rather than to a fabricated level', () => {
  assert.equal(summarizeShiftedPath([], MAX_SHIFT, STEP), '')
  assert.equal(summarizeShiftedPath(undefined, MAX_SHIFT, STEP), '')
})

// --- cellTierClass ------------------------------------------------------------------------

test('tiers span the computable cells from lowest to highest', () => {
  const tier = cellTierClass(gridRows([[10, 20, 30, 40, 50]]))
  assert.equal(tier(10), 'sens-tier-0')
  assert.equal(tier(50), 'sens-tier-4')
  assert.equal(tier(30), 'sens-tier-2')
})

test('tinting encodes value, never a direction the grid is supposed to reveal', () => {
  // The same five values, arranged so that value FALLS as revenue growth rises. The tints
  // are identical either way: the scale describes the numbers, not whether the schedule is
  // one where growth helps.
  const rising = cellTierClass(gridRows([[10], [20], [30], [40], [50]]))
  const falling = cellTierClass(gridRows([[50], [40], [30], [20], [10]]))
  assert.equal(rising(50), falling(50))
  assert.equal(rising(10), falling(10))
})

test('a flat grid gets one neutral tier rather than a divide by zero', () => {
  const tier = cellTierClass(gridRows([[25, 25, 25]]))
  assert.equal(tier(25), 'sens-tier-2')
})

test('uncomputable cells are excluded from the scale rather than treated as zero', () => {
  const tier = cellTierClass(gridRows([[null, 10, 50, null]]))
  assert.equal(tier(10), 'sens-tier-0')
  assert.equal(tier(50), 'sens-tier-4')
})

test('a grid with nothing computable yields no tint at all', () => {
  const tier = cellTierClass(gridRows([[null, null]]))
  assert.equal(tier(0), undefined)
})

// --- summarizeGridWarnings ----------------------------------------------------------------

const warning = (id, tier, explanation = 'why', years = [1]) => ({ id, tier, years, explanation })

test('distinct warnings are counted across every cell that introduces them', () => {
  const rows = [
    {
      revenue_growth_delta: -0.02,
      cells: [
        cell(1, [warning('negative_revenue', 'extreme')]),
        cell(2, []),
        cell(3, [warning('negative_revenue', 'extreme')]),
      ],
    },
    {
      revenue_growth_delta: -0.01,
      cells: [cell(4, [warning('negative_da_percent', 'caution')]), cell(5, []), cell(6, [])],
    },
  ]
  const summary = summarizeGridWarnings(rows)

  assert.equal(summary.length, 2)
  // Most severe first, so the reader meets the worst case before the milder one.
  assert.equal(summary[0].id, 'negative_revenue')
  assert.equal(summary[0].cellCount, 2)
  assert.equal(summary[1].id, 'negative_da_percent')
  assert.equal(summary[1].cellCount, 1)
})

test('a repeated warning is reported at its most severe tier', () => {
  const rows = [
    {
      revenue_growth_delta: 0,
      cells: [
        cell(1, [warning('negative_revenue', 'caution', 'mild')]),
        cell(2, [warning('negative_revenue', 'extreme', 'severe')]),
      ],
    },
  ]
  const [entry] = summarizeGridWarnings(rows)

  assert.equal(entry.tier, 'extreme')
  assert.equal(entry.cellCount, 2)
})

test("the aggregate never carries one cell's engine explanation across the cells it counts", () => {
  // The engine writes explanations per cell, naming that cell's own years and computed
  // figures. Counting several cells under one of those sentences would describe the others
  // wrongly, so the aggregate carries warning-level copy instead and no explanation at all.
  const rows = [
    {
      revenue_growth_delta: 0,
      cells: [
        cell(1, [warning('negative_revenue', 'extreme', "Year 1's rate produces -12.34")]),
        cell(2, [warning('negative_revenue', 'extreme', "Year 3's rate produces -98.76", [3])]),
      ],
    },
  ]
  const [entry] = summarizeGridWarnings(rows)

  assert.equal(entry.explanation, undefined)
  assert.ok(!JSON.stringify(entry).includes('-12.34'))
  assert.ok(!JSON.stringify(entry).includes('-98.76'))
  // What it carries instead is true of every cell that raises the id.
  assert.equal(entry.description, GRID_WARNING_DESCRIPTIONS.negative_revenue)
  assert.equal(entry.cellCount, 2)
})

test('the aggregate description does not depend on which cell was seen first', () => {
  const one = summarizeGridWarnings([
    { revenue_growth_delta: 0, cells: [cell(1, [warning('negative_revenue', 'extreme', 'A', [1])])] },
  ])
  const other = summarizeGridWarnings([
    { revenue_growth_delta: 0, cells: [cell(1, [warning('negative_revenue', 'extreme', 'B', [4])])] },
  ])
  assert.deepEqual(one, other)
})

test('warnings are numbered from one, in the order they are listed', () => {
  const summary = summarizeGridWarnings([
    {
      revenue_growth_delta: 0,
      cells: [
        cell(1, [warning('negative_da_percent', 'caution')]),
        cell(2, [warning('negative_revenue', 'extreme')]),
      ],
    },
  ])
  assert.deepEqual(
    summary.map((entry) => [entry.note, entry.id]),
    [
      [1, 'negative_revenue'],
      [2, 'negative_da_percent'],
    ],
  )
})

test('an id with no warning-level copy still lists, rather than vanishing', () => {
  const [entry] = summarizeGridWarnings([
    { revenue_growth_delta: 0, cells: [cell(1, [warning('brand_new_warning', 'caution')])] },
  ])
  assert.equal(entry.description, '')
  assert.equal(entry.note, 1)
})

test('a grid that introduces nothing summarizes to an empty list', () => {
  assert.deepEqual(summarizeGridWarnings(gridRows([[1, 2, 3]])), [])
})

test('warnings carry the short label the tornado already uses for the same id', () => {
  const [entry] = summarizeGridWarnings([
    { revenue_growth_delta: 0, cells: [cell(1, [warning('non_positive_terminal_year_fcf', 'extreme')])] },
  ])
  assert.equal(entry.label, 'Non-positive final-year FCF')
})

test('an unrecognized warning id falls back to the id rather than disappearing', () => {
  const [entry] = summarizeGridWarnings([
    { revenue_growth_delta: 0, cells: [cell(1, [warning('brand_new_warning', 'caution')])] },
  ])
  assert.equal(entry.label, 'brand_new_warning')
})

// --- describeCellWarnings -----------------------------------------------------------------

test('a marked cell names its warnings and their years, never only as a visual marker', () => {
  const text = describeCellWarnings([
    warning('negative_revenue', 'extreme', 'why', [1, 2, 3]),
    warning('negative_da_percent', 'caution', 'why', [3]),
  ])
  assert.equal(text, 'Negative revenue (yrs 1-3); Negative D&A % (yr 3)')
})

test("the years a cell reports are its own, not another cell's", () => {
  assert.equal(
    describeCellWarnings([warning('negative_revenue', 'extreme', 'why', [4, 5])]),
    'Negative revenue (yrs 4-5)',
  )
})

// --- warningFootnotes ---------------------------------------------------------------------

test('a cell points at the numbered entries for the warnings it introduced', () => {
  const summary = summarizeGridWarnings([
    {
      revenue_growth_delta: 0,
      cells: [
        cell(1, [warning('negative_da_percent', 'caution')]),
        cell(2, [warning('negative_revenue', 'extreme')]),
      ],
    },
  ])
  // negative_revenue is note 1 (most severe first), negative_da_percent is note 2.
  assert.deepEqual(warningFootnotes([warning('negative_da_percent', 'caution')], summary), [2])
  assert.deepEqual(warningFootnotes([warning('negative_revenue', 'extreme')], summary), [1])
})

test('a cell introducing two warnings lists both numbers, ascending', () => {
  const summary = summarizeGridWarnings([
    {
      revenue_growth_delta: 0,
      cells: [
        cell(1, [warning('negative_da_percent', 'caution'), warning('negative_revenue', 'extreme')]),
      ],
    },
  ])
  const notes = warningFootnotes(
    [warning('negative_da_percent', 'caution'), warning('negative_revenue', 'extreme')],
    summary,
  )
  assert.deepEqual(notes, [1, 2])
})

test('an unmarked cell has no footnotes at all', () => {
  assert.deepEqual(warningFootnotes([], summarizeGridWarnings(gridRows([[1, 2]]))), [])
})
