import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compactCurrency } from '../../lib/format.js'
import {
  COSTCO_COMPANY_DATA,
  COSTCO_MARKET_CAP_DATE,
  COSTCO_MARKET_CAP_SOURCE_LABEL,
  COSTCO_MARKET_CAP_SOURCE_URL,
} from './costcoDemo.js'

test('company name is the clean legal name, not the raw SEC registrant string', () => {
  assert.equal(COSTCO_COMPANY_DATA.profile.company_name, 'Costco Wholesale Corporation')
  assert.doesNotMatch(COSTCO_COMPANY_DATA.profile.company_name, /\/NEW|CORP\b/)
})

test('classification renders as exactly "Membership Warehouses · Nasdaq Global Select Market"', () => {
  const { sector, industry, exchange } = COSTCO_COMPANY_DATA.profile
  // Mirrors CompanyHeader.jsx's own join so this test breaks if that rendering rule ever
  // changes, not just if the profile data does.
  const classification = [sector, industry, exchange].filter(Boolean).join(' · ')
  assert.equal(classification, 'Membership Warehouses · Nasdaq Global Select Market')
})

test('market cap formats to the dated $418.60B figure and discloses a non-live, non-SEC source', () => {
  assert.equal(compactCurrency(COSTCO_COMPANY_DATA.profile.market_capitalization), '$418.60B')
  assert.equal(COSTCO_MARKET_CAP_DATE, '2026-08-31')
  assert.match(COSTCO_MARKET_CAP_SOURCE_URL, /^https:\/\/stockanalysis\.com\//)
  assert.ok(COSTCO_MARKET_CAP_SOURCE_LABEL)
})
