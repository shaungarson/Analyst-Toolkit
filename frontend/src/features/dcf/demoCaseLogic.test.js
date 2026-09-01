import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextDemoTabIndex, reconcileDemoResults } from './demoCaseLogic.js'

const CASE_IDS = ['low', 'base', 'high']

test('reconcileDemoResults: all three succeed independently', () => {
  const settled = [
    { status: 'fulfilled', value: { results: { value_per_share: 335.59 }, sensitivity: { rows: [] } } },
    { status: 'fulfilled', value: { results: { value_per_share: 395.69 }, sensitivity: null } },
    { status: 'fulfilled', value: { results: { value_per_share: 464.96 }, sensitivity: { rows: [] } } },
  ]
  const result = reconcileDemoResults(CASE_IDS, settled)
  assert.equal(result.low.results.value_per_share, 335.59)
  assert.equal(result.low.error, null)
  assert.equal(result.base.sensitivity, null)
  assert.equal(result.high.results.value_per_share, 464.96)
})

test('reconcileDemoResults: one failure never inherits a sibling case\'s result', () => {
  const settled = [
    { status: 'fulfilled', value: { results: { value_per_share: 335.59 }, sensitivity: null } },
    { status: 'rejected', reason: new Error('Calculation failed. Check your inputs.') },
    { status: 'fulfilled', value: { results: { value_per_share: 464.96 }, sensitivity: null } },
  ]
  const result = reconcileDemoResults(CASE_IDS, settled)
  // The failed case is genuinely empty, not backfilled from either neighbor.
  assert.equal(result.base.results, null)
  assert.equal(result.base.sensitivity, null)
  assert.equal(result.base.error, 'Calculation failed. Check your inputs.')
  // The other two are completely unaffected by base's failure.
  assert.equal(result.low.results.value_per_share, 335.59)
  assert.equal(result.low.error, null)
  assert.equal(result.high.results.value_per_share, 464.96)
  assert.equal(result.high.error, null)
})

test('reconcileDemoResults: all three can fail independently with their own messages', () => {
  const settled = [
    { status: 'rejected', reason: new Error('low failed') },
    { status: 'rejected', reason: new Error('base failed') },
    { status: 'rejected', reason: new Error('high failed') },
  ]
  const result = reconcileDemoResults(CASE_IDS, settled)
  assert.equal(result.low.error, 'low failed')
  assert.equal(result.base.error, 'base failed')
  assert.equal(result.high.error, 'high failed')
})

test('nextDemoTabIndex: ArrowRight advances and wraps past the last tab', () => {
  assert.equal(nextDemoTabIndex('ArrowRight', 0, 3), 1)
  assert.equal(nextDemoTabIndex('ArrowRight', 1, 3), 2)
  assert.equal(nextDemoTabIndex('ArrowRight', 2, 3), 0)
})

test('nextDemoTabIndex: ArrowLeft retreats and wraps past the first tab', () => {
  assert.equal(nextDemoTabIndex('ArrowLeft', 2, 3), 1)
  assert.equal(nextDemoTabIndex('ArrowLeft', 1, 3), 0)
  assert.equal(nextDemoTabIndex('ArrowLeft', 0, 3), 2)
})

test('nextDemoTabIndex: Home and End jump to the first and last tab from any position', () => {
  assert.equal(nextDemoTabIndex('Home', 2, 3), 0)
  assert.equal(nextDemoTabIndex('End', 0, 3), 2)
})

test('nextDemoTabIndex: an unrelated key is left to default browser behavior', () => {
  assert.equal(nextDemoTabIndex('Tab', 0, 3), null)
  assert.equal(nextDemoTabIndex('a', 1, 3), null)
})
