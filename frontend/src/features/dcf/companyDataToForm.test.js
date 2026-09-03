import { test } from 'node:test'
import assert from 'node:assert/strict'
import { companyDataToSourcedFields, sourceableFieldBadgeType } from './companyDataToForm.js'

function makeCompanyData(overrides = {}) {
  return {
    profile: {
      ticker: 'AAPL',
      shares_outstanding: 15000000000,
      reference_price: 200.5,
      reference_price_as_of: '2026-08-01',
      ...overrides.profile,
    },
    periods: overrides.periods ?? [
      { unlevered_fcf: 90000000000, net_debt: -50000000000, revenue: 400000000000 },
    ],
  }
}

test('companyDataToSourcedFields: complete data maps every field as a string', () => {
  const sourced = companyDataToSourcedFields(makeCompanyData())
  assert.equal(sourced.baseYearFcf, '90000000000')
  assert.equal(sourced.baseYearRevenue, '400000000000')
  assert.equal(sourced.netDebt, '-50000000000')
  assert.equal(sourced.dilutedSharesOutstanding, '15000000000')
  assert.equal(sourced.referencePrice, '200.5')
  assert.equal(sourced.referencePriceDate, '2026-08-01')
  assert.equal(sourced.referencePriceSourcedValue, '200.5')
  assert.equal(sourced.referencePriceSourcedDate, '2026-08-01')
  assert.equal(sourced.referencePriceSourceTicker, 'AAPL')
})

test('companyDataToSourcedFields: null unlevered_fcf (the EOSE case) blanks baseYearFcf, not omits it', () => {
  const data = makeCompanyData({ periods: [{ unlevered_fcf: null, net_debt: -50000000000 }] })
  const sourced = companyDataToSourcedFields(data)
  assert.equal(sourced.baseYearFcf, '')
  assert.ok('baseYearFcf' in sourced, 'key must be present so a merge overwrites, not skips, it')
})

test('companyDataToSourcedFields: null net_debt blanks netDebt', () => {
  const data = makeCompanyData({ periods: [{ unlevered_fcf: 90000000000, net_debt: null }] })
  assert.equal(companyDataToSourcedFields(data).netDebt, '')
})

test('companyDataToSourcedFields: null revenue blanks baseYearRevenue, not omits it', () => {
  const data = makeCompanyData({ periods: [{ unlevered_fcf: 90000000000, revenue: null }] })
  const sourced = companyDataToSourcedFields(data)
  assert.equal(sourced.baseYearRevenue, '')
  assert.ok('baseYearRevenue' in sourced)
})

test('companyDataToSourcedFields: null shares_outstanding blanks dilutedSharesOutstanding', () => {
  const data = makeCompanyData({ profile: { shares_outstanding: null } })
  assert.equal(companyDataToSourcedFields(data).dilutedSharesOutstanding, '')
})

test('companyDataToSourcedFields: no periods at all blanks both period-derived fields', () => {
  const data = makeCompanyData({ periods: [] })
  const sourced = companyDataToSourcedFields(data)
  assert.equal(sourced.baseYearFcf, '')
  assert.equal(sourced.netDebt, '')
})

test('companyDataToSourcedFields: null reference_price blanks the price and its sourced-baseline record, including ticker', () => {
  const data = makeCompanyData({ profile: { reference_price: null, reference_price_as_of: null } })
  const sourced = companyDataToSourcedFields(data)
  assert.equal(sourced.referencePrice, '')
  assert.equal(sourced.referencePriceDate, '')
  assert.equal(sourced.referencePriceSourcedValue, '')
  assert.equal(sourced.referencePriceSourcedDate, '')
  assert.equal(sourced.referencePriceSourceTicker, '', 'no price sourced this load - no ticker to attribute it to')
})

test('companyDataToSourcedFields: consecutive loads never leak a prior company value through the merge', () => {
  const companyA = makeCompanyData()
  const companyB = makeCompanyData({
    periods: [{ unlevered_fcf: null, net_debt: null }],
    profile: { shares_outstanding: null, reference_price: null, reference_price_as_of: null },
  })

  let form = {
    baseYearFcf: '',
    baseYearRevenue: '',
    netDebt: '',
    dilutedSharesOutstanding: '',
    referencePrice: '',
  }
  form = { ...form, ...companyDataToSourcedFields(companyA) }
  assert.equal(form.baseYearFcf, '90000000000')
  assert.equal(form.baseYearRevenue, '400000000000')

  // Same merge loadCompany performs on the second load - every EOSE-like field must land
  // as '' in the patch, overwriting company A's figures rather than leaving them in place.
  form = { ...form, ...companyDataToSourcedFields(companyB) }
  assert.equal(form.baseYearFcf, '')
  assert.equal(form.baseYearRevenue, '')
  assert.equal(form.netDebt, '')
  assert.equal(form.dilutedSharesOutstanding, '')
  assert.equal(form.referencePrice, '')
})

test('sourceableFieldBadgeType: blank form field is never badged', () => {
  assert.equal(sourceableFieldBadgeType('', ''), null)
  assert.equal(sourceableFieldBadgeType('', '12345'), null)
})

test('sourceableFieldBadgeType: unchanged, non-blank value matching the sourced value reads Sourced', () => {
  assert.equal(sourceableFieldBadgeType('12345', '12345'), 'sourced')
})

test('sourceableFieldBadgeType: edited value differing from the sourced value reads Adjusted', () => {
  assert.equal(sourceableFieldBadgeType('99999', '12345'), 'adjusted')
})

test('sourceableFieldBadgeType: non-blank value with no sourced value for this company reads Analyst Input, never Sourced', () => {
  assert.equal(sourceableFieldBadgeType('12345', ''), 'analyst')
})
