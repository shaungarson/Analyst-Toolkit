import { useEffect, useRef, useState } from 'react'
import { compactCurrency, compactShares, currency, percent } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import { friendlyErrorMessage, parseErrorResponse } from '../../lib/apiError'
import { API_BASE } from '../../lib/apiBase'
import ScenarioManager from '../../components/ScenarioManager'
import ScenarioComparisonTable from '../../components/ScenarioComparisonTable'
import WorkflowCard from '../../components/WorkflowCard'
import SourceBadge from '../../components/SourceBadge'
import FormattedNumberInput from '../../components/FormattedNumberInput'
import CompanySourcedData from './CompanySourcedData'
import SourcedHistoryPanel from './SourcedHistoryPanel'
import CompanyHeader from './CompanyHeader'
import CostcoDemoPanel from './CostcoDemoPanel'
import ValueBridge from './ValueBridge'
import { nextDemoTabIndex, reconcileDemoResults } from './demoCaseLogic'
import { historicalCagr } from './historicalGrowth'
import { explainValuation } from './explainValuation'
import {
  COSTCO_CASES,
  COSTCO_COMPANY_DATA,
  COSTCO_REFERENCE_PRICE,
  COSTCO_REFERENCE_PRICE_DATE,
  COSTCO_SHARED_ASSUMPTIONS,
} from './costcoDemo'
import '../../styles/feature-form.css'
import '../../styles/workspace.css'

// The one Costco-demo result tabpanel every tab's aria-controls points at - see the comment
// above the tab strip for why this is one shared panel rather than three.
const DEMO_TABPANEL_ID = 'demo-tabpanel'

const EMPTY = {
  baseYearFcf: '',
  fcfGrowthRate: '',
  forecastYears: '',
  wacc: '',
  terminalGrowthRate: '',
  netDebt: '',
  dilutedSharesOutstanding: '',
  referencePrice: '',
  referencePriceDate: '',
  // The reference price's own persisted "what it was sourced from" record - separate from
  // sourcedSnapshot (which is ephemeral, reset on every load/reload and never saved) because
  // this needs to survive a scenario save/reload so the Sourced/Adjusted/Analyst Input badge
  // can be reconstructed correctly later, without ever being sent to the valuation engine
  // (buildPayload never reads these three keys). Empty for a never-sourced or reloaded-old
  // scenario, which is exactly what makes referencePriceBadgeType fall back to "analyst".
  referencePriceSourcedValue: '',
  referencePriceSourcedDate: '',
  referencePriceSourceTicker: '',
}

// Fields that ticker search can populate. Used both to build the sourced-value snapshot
// and to decide which form fields are ever eligible for a "Sourced"/"Adjusted" badge -
// fcfGrowthRate, forecastYears, wacc, and terminalGrowthRate are never sourced from data,
// so they always read as plain analyst judgment. referencePrice is handled by its own
// referencePriceBadgeType below, not this generic list - unlike the other three, it's
// genuinely optional and has its own "Analyst Input because Alpha Vantage was unavailable"
// case the generic logic doesn't need to represent for anything else.
const SOURCEABLE_FIELDS = ['baseYearFcf', 'netDebt', 'dilutedSharesOutstanding']

// The forward/reverse invalidation matrix, by form field name. The two lists deliberately
// overlap rather than share one list with per-calculation exceptions carved out of it - the
// six shared-assumption fields invalidate both because both calculations actually read them;
// fcfGrowthRate invalidates forward only (the reverse solver never reads it - it *produces*
// a growth rate, it doesn't take one); referencePrice invalidates reverse only (forward never
// reads it). referencePriceDate is in neither: it controls whether a usable reference price
// exists and what "as of" date displays next to it, but changing it alone doesn't change any
// number either calculation produces.
const FORWARD_STALE_FIELDS = [
  'baseYearFcf',
  'fcfGrowthRate',
  'forecastYears',
  'wacc',
  'terminalGrowthRate',
  'netDebt',
  'dilutedSharesOutstanding',
]
const REVERSE_STALE_FIELDS = [
  'baseYearFcf',
  'forecastYears',
  'wacc',
  'terminalGrowthRate',
  'netDebt',
  'dilutedSharesOutstanding',
  'referencePrice',
]

// Only the fields the calculation engine actually needs - referencePrice/referencePriceDate
// live in the same form object (so they save/reload with a scenario, see loadScenario) but
// are deliberately never picked here, so they never reach the valuation engine.
const buildPayload = (form) => ({
  base_year_fcf: Number(form.baseYearFcf),
  fcf_growth_rate: Number(form.fcfGrowthRate) / 100,
  forecast_years: Number(form.forecastYears),
  wacc: Number(form.wacc) / 100,
  terminal_growth_rate: Number(form.terminalGrowthRate) / 100,
  net_debt: Number(form.netDebt),
  diluted_shares_outstanding: Number(form.dilutedSharesOutstanding),
})

const dollarsPerShare = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const COMPARISON_METRICS = [
  { key: 'ev', label: 'Enterprise Value', get: (r) => r.enterprise_value, format: compactCurrency },
  { key: 'eq', label: 'Equity Value', get: (r) => r.equity_value, format: compactCurrency },
  { key: 'vps', label: 'Value per Share', get: (r) => r.value_per_share, format: dollarsPerShare },
  { key: 'tv', label: 'Terminal Value', get: (r) => r.terminal_value, format: compactCurrency },
]

function DcfValuation() {
  const [form, setForm] = useState(EMPTY)
  const [results, setResults] = useState(null)
  const [sensitivity, setSensitivity] = useState(null)
  // True once a forward-relevant field changes after `results` was last set, in plain
  // single-ticker/manual mode - the demo-mode equivalent is demoResultsStale below. Showing
  // an old valuation beside assumptions that no longer match it is a correctness problem,
  // not cosmetic, so this applies here exactly the same way it already does in demo mode.
  const [resultsStale, setResultsStale] = useState(false)
  const [comparison, setComparison] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [analysisTab, setAnalysisTab] = useState('sensitivity')
  const [showMethodology, setShowMethodology] = useState(false)
  const [showSensitivityLegend, setShowSensitivityLegend] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  const [ticker, setTicker] = useState('')
  const [companyData, setCompanyData] = useState(null)
  const [companyError, setCompanyError] = useState(null)
  const [companyLoading, setCompanyLoading] = useState(false)
  // Snapshot of exactly which form values came from the last successful ticker load, so a
  // field's badge can tell "still sourced" apart from "started sourced, analyst changed it."
  const [sourcedSnapshot, setSourcedSnapshot] = useState(null)

  // Embedded Costco demo (roadmap step 4). isDemoSnapshot distinguishes "this companyData
  // came from the frozen local snapshot" from a real ticker-search load, purely for the
  // header's disclosure label - the sourced-data panels themselves need no special-casing,
  // since COSTCO_COMPANY_DATA is shaped exactly like a live CompanyData response.
  const [isDemoSnapshot, setIsDemoSnapshot] = useState(false)
  const [showCostcoDemo, setShowCostcoDemo] = useState(false)
  // Which of the three result tabs is active - doubles as "which case's FCF growth rate is
  // currently shown/editable in the Assumptions column" both before and after calculation.
  const [activeDemoCaseId, setActiveDemoCaseId] = useState(null)
  // Each case's own FCF growth rate, independent of which tab is active - the one assumption
  // this demo treats as case-specific rather than shared. { low, base, high } once active.
  const [demoCaseGrowth, setDemoCaseGrowth] = useState(null)
  // { low: {results, sensitivity, error}, base: {...}, high: {...} } once Run Valuation has
  // been clicked in demo mode; null beforehand. Every key is always present after a run, even
  // for a case whose call failed - a failed case is `{results: null, sensitivity: null, error}`,
  // never silently backfilled from a sibling case's result.
  const [demoResults, setDemoResults] = useState(null)
  // True once any buildPayload-relevant field changes after demoResults was last set - the
  // three retained results stay in state (never wiped by an edit, so they're ready to
  // reappear the instant a rerun completes) but are intentionally hidden, not rendered,
  // until the next Run Valuation click refreshes all three and clears this flag.
  const [demoResultsStale, setDemoResultsStale] = useState(false)
  const demoTabRefs = useRef({})

  // Reverse DCF (price-implied FCF growth) - one shared result regardless of mode, since it
  // never depends on which case/tab is active. null until a run with a usable reference
  // price completes; {status, ...} afterward, where status is one of the backend's three
  // ("solved" | "target_below_floor" | "not_bracketed") or the frontend-only
  // "request_failed" for a network/API failure - all handled the same way by the display
  // logic below (see the reverse-DCF block), so a failure never leaves a stale success
  // sitting on screen.
  const [reverseResult, setReverseResult] = useState(null)
  const [reverseResultStale, setReverseResultStale] = useState(false)

  // Opportunistic backend warm-up: pings the health endpoint on mount so a cold Render
  // instance starts spinning up before the analyst finishes filling in the form. Never gates
  // Run Valuation - a failed or slow ping just leaves backendAwake false and this component
  // says nothing further; if the backend really is unreachable, the Run Valuation request
  // itself will fail through the normal error path.
  const [backendAwake, setBackendAwake] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/health?_=${Date.now()}`, { cache: 'no-store' })
      .then((res) => {
        if (!cancelled && res.ok) setBackendAwake(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Any edit to a field a calculation actually reads invalidates that calculation's
  // retained result - never silently keep showing a stale number beside assumptions that no
  // longer produced it. Forward and reverse are invalidated independently per
  // FORWARD_STALE_FIELDS/REVERSE_STALE_FIELDS (see their own comment for the full matrix);
  // this only sets a flag when there's actually a result to flag, in whichever mode is
  // currently active.
  const markStaleIfNeeded = (field) => {
    if (FORWARD_STALE_FIELDS.includes(field)) {
      if (isDemoSnapshot) {
        if (demoResults) setDemoResultsStale(true)
      } else if (results) {
        setResultsStale(true)
      }
    }
    if (REVERSE_STALE_FIELDS.includes(field) && reverseResult) {
      setReverseResultStale(true)
    }
  }

  const handleChange = (field) => (e) => {
    const value = e.target.value
    setForm({ ...form, [field]: value })
    // FCF growth rate is the one case-specific assumption - capture the edit against
    // whichever case's tab is currently active, not as a shared value.
    if (isDemoSnapshot && field === 'fcfGrowthRate' && activeDemoCaseId) {
      setDemoCaseGrowth((prev) => ({ ...prev, [activeDemoCaseId]: value }))
    }
    markStaleIfNeeded(field)
  }

  const setFieldValue = (field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    markStaleIfNeeded(field)
  }

  // Populates the existing assumption fields from sourced company data - it does not run
  // a valuation and does not save a scenario. The analyst still reviews every field
  // (including the ones just populated) and explicitly clicks Run Valuation.
  const loadCompany = async (e) => {
    e.preventDefault()
    const symbol = ticker.trim()
    if (!symbol) return
    setCompanyError(null)
    setCompanyLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/company/${encodeURIComponent(symbol)}`)
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res))
      }
      const data = await res.json()
      setCompanyData(data)
      setIsDemoSnapshot(false)
      setActiveDemoCaseId(null)
      setShowCostcoDemo(false)
      setDemoCaseGrowth(null)
      setDemoResults(null)
      setDemoResultsStale(false)
      setResults(null)
      setResultsStale(false)
      setSensitivity(null)
      setComparison(null)
      setReverseResult(null)
      setReverseResultStale(false)
      setShowHistory(false)

      const latest = data.periods[0]
      const sourced = {}
      if (latest?.unlevered_fcf != null) sourced.baseYearFcf = String(Math.round(latest.unlevered_fcf))
      if (latest?.net_debt != null) sourced.netDebt = String(Math.round(latest.net_debt))
      if (data.profile.shares_outstanding != null) {
        sourced.dilutedSharesOutstanding = String(Math.round(data.profile.shares_outstanding))
      }
      // Alpha Vantage's quote is independent of fundamentals (see the data-resilience
      // milestone). Every one of these five keys is set explicitly on every load - to the
      // new company's real value, or to '' - rather than only when present, so a price (or
      // its sourced-baseline record) from a previously loaded company can never survive
      // into a load whose own quote came back empty. referencePriceSourced* is what
      // referencePriceBadgeType compares the live fields against; persisting it as part of
      // `form` (not just the ephemeral sourcedSnapshot below) is what lets a saved scenario
      // restore the correct Sourced/Adjusted status after a reload - see loadScenario.
      const referencePrice = data.profile.reference_price != null ? String(data.profile.reference_price) : ''
      const referencePriceDate = data.profile.reference_price_as_of ?? ''
      sourced.referencePrice = referencePrice
      sourced.referencePriceDate = referencePriceDate
      sourced.referencePriceSourcedValue = referencePrice
      sourced.referencePriceSourcedDate = referencePriceDate
      sourced.referencePriceSourceTicker = referencePrice ? data.profile.ticker : ''
      setSourcedSnapshot(sourced)
      setForm((prev) => ({ ...prev, ...sourced }))
    } catch (err) {
      setCompanyError(friendlyErrorMessage(err))
      setCompanyData(null)
    } finally {
      setCompanyLoading(false)
    }
  }

  const loadScenario = (data) => {
    // Backfill so scenarios saved before referencePrice/referencePriceDate existed don't
    // leave those inputs undefined (React would warn about an uncontrolled->controlled
    // input switch the moment the analyst typed into one).
    setForm({ ...EMPTY, ...data })
    setResults(null)
    setResultsStale(false)
    setSensitivity(null)
    setComparison(null)
    setError(null)
    setReverseResult(null)
    setReverseResultStale(false)
    setTicker('')
    setCompanyData(null)
    setCompanyError(null)
    setSourcedSnapshot(null)
    setIsDemoSnapshot(false)
    setActiveDemoCaseId(null)
    setShowCostcoDemo(false)
    setDemoCaseGrowth(null)
    setDemoResults(null)
    setDemoResultsStale(false)
    setShowHistory(false)
  }

  // First activation only: populates the exact same form fields a live ticker load would
  // (base year UFCF, net debt, diluted shares, reference price/date, and its sourced-
  // baseline record), but from the frozen local snapshot - no fetch, so this works with SEC
  // EDGAR and Alpha Vantage both unavailable. Loads Base Growth's assumptions and opens the
  // disclosure; never auto-runs the valuation and never saves a scenario, same as every
  // other data-loading path here. WACC, terminal growth, forecast period, and the entire
  // sourced snapshot are shared across all three cases - only each case's own FCF growth
  // rate (demoCaseGrowth) differs, seeded here from COSTCO_CASES' initial values.
  const activateCostcoDemo = () => {
    setCompanyData(COSTCO_COMPANY_DATA)
    setIsDemoSnapshot(true)
    setActiveDemoCaseId('base')
    setDemoCaseGrowth(Object.fromEntries(COSTCO_CASES.map((c) => [c.id, c.fcfGrowthRate])))
    setDemoResults(null)
    setDemoResultsStale(false)
    setResults(null)
    setResultsStale(false)
    setSensitivity(null)
    setComparison(null)
    setError(null)
    setReverseResult(null)
    setReverseResultStale(false)
    setCompanyError(null)
    setTicker('COST')
    setShowHistory(false)
    setShowCostcoDemo(true)

    const latest = COSTCO_COMPANY_DATA.periods[0]
    const baseCase = COSTCO_CASES.find((c) => c.id === 'base')
    const sourced = {
      baseYearFcf: String(Math.round(latest.unlevered_fcf)),
      netDebt: String(Math.round(latest.net_debt)),
      dilutedSharesOutstanding: String(Math.round(COSTCO_COMPANY_DATA.profile.shares_outstanding)),
      referencePrice: COSTCO_REFERENCE_PRICE,
      referencePriceDate: COSTCO_REFERENCE_PRICE_DATE,
      referencePriceSourcedValue: COSTCO_REFERENCE_PRICE,
      referencePriceSourcedDate: COSTCO_REFERENCE_PRICE_DATE,
      referencePriceSourceTicker: 'COST',
    }
    setSourcedSnapshot(sourced)
    setForm((prev) => ({
      ...prev,
      ...sourced,
      ...COSTCO_SHARED_ASSUMPTIONS,
      fcfGrowthRate: baseCase.fcfGrowthRate,
    }))
  }

  // The header's "Costco Demo" button: activates fresh (loading Base Growth) the first time,
  // or while switched away to a live ticker/scenario. Once Costco is already the active
  // company, it only opens/closes the disclosure - never re-triggered by, or resetting,
  // whatever's already loaded or calculated.
  const handleToggleCostcoDemo = () => {
    if (!isDemoSnapshot) {
      activateCostcoDemo()
    } else {
      setShowCostcoDemo((v) => !v)
    }
  }

  // Switching tabs is a pure view change - zero requests, and never touches demoResults or
  // demoResultsStale. Only the visible FCF growth rate follows the newly active case; every
  // shared field stays exactly as it was.
  const selectDemoTab = (caseId) => {
    setActiveDemoCaseId(caseId)
    setForm((prev) => ({ ...prev, fcfGrowthRate: demoCaseGrowth[caseId] }))
  }

  // Standard WAI-ARIA tabs roving-tabindex pattern: arrow keys move both focus and selection
  // between tabs, Home/End jump to the ends. Enter/Space activation is native <button>
  // behavior and needs no handling here.
  const DEMO_TAB_ORDER = COSTCO_CASES.map((c) => c.id)
  const handleDemoTabKeyDown = (e) => {
    const currentIndex = DEMO_TAB_ORDER.indexOf(activeDemoCaseId)
    const nextIndex = nextDemoTabIndex(e.key, currentIndex, DEMO_TAB_ORDER.length)
    if (nextIndex === null) return
    e.preventDefault()
    const nextId = DEMO_TAB_ORDER[nextIndex]
    selectDemoTab(nextId)
    demoTabRefs.current[nextId]?.focus()
  }

  // Only fields ticker search can populate are ever eligible for a badge, and only once a
  // company has actually been loaded - otherwise the plain manual-entry workflow is
  // unchanged and stays free of provenance chrome it doesn't need.
  const fieldBadgeType = (field) => {
    if (!companyData || !sourcedSnapshot) return null
    if (SOURCEABLE_FIELDS.includes(field)) {
      if (!(field in sourcedSnapshot)) return null
      return form[field] === sourcedSnapshot[field] ? 'sourced' : 'adjusted'
    }
    return 'analyst'
  }

  // Reference price has its own status logic rather than joining SOURCEABLE_FIELDS, and
  // deliberately reads persisted form fields (referencePriceSourced*) rather than the
  // ephemeral sourcedSnapshot the other three sourceable fields use: sourcedSnapshot is
  // reset to null on every reload and never saved, which would make a scenario's price
  // always read as unsourced after a reload. Reading from `form` instead means the exact
  // same comparison naturally works right after a live company load (loadCompany sets the
  // Sourced* fields there) and after a scenario reload (loadScenario restores them from
  // what was saved) - one status function, no separate reload-specific path. An empty
  // field is never badged (nothing to describe); a non-empty field with no recorded sourced
  // value is "Analyst Input" (covers never-loaded-a-company, loaded-but-no-quote, and an
  // old scenario saved before this field existed, identically); a non-empty field is
  // "Sourced" only while both the price and its as-of date still match the recorded source.
  const referencePriceBadgeType = () => {
    if (!form.referencePrice) return null
    if (!form.referencePriceSourcedValue) return 'analyst'
    const unchanged =
      form.referencePrice === form.referencePriceSourcedValue &&
      form.referencePriceDate === form.referencePriceSourcedDate
    return unchanged ? 'sourced' : 'adjusted'
  }

  const handleCompare = async (selectedScenarios) => {
    setError(null)
    const settled = await Promise.allSettled(
      selectedScenarios.map(async (s) => {
        const res = await fetch(`${API_BASE}/api/dcf/valuation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(s.data)),
        })
        if (!res.ok) {
          throw new Error(await parseErrorResponse(res))
        }
        return res.json()
      }),
    )
    setComparison(
      selectedScenarios.map((s, i) => {
        const outcome = settled[i]
        return outcome.status === 'fulfilled'
          ? { name: s.name, results: outcome.value }
          : { name: s.name, error: outcome.reason.message }
      }),
    )
  }

  // Reads activeResults/activeSensitivity (the active demo tab's results in demo mode, the
  // single-run results otherwise) - never the raw results/sensitivity state directly, so a
  // demo export always matches whichever case's tab is currently on screen. In demo mode,
  // also names which case this is (both in the file's own content and its filename) - the
  // numbers alone don't say whether they're Low, Base, or High Growth, and a CSV or its
  // filename is exactly the kind of thing that outlives the screen it was exported from.
  const exportCsv = () => {
    const activeCase = isDemoSnapshot ? COSTCO_CASES.find((c) => c.id === activeDemoCaseId) : null
    const rows = [
      ['DCF Valuation Results'],
      ...(activeCase ? [['Case', activeCase.label], ['FCF Growth Rate (%/yr)', form.fcfGrowthRate]] : []),
      [],
      ['Metric', 'Value'],
      ['Enterprise Value', activeResults.enterprise_value],
      ['Equity Value', activeResults.equity_value],
      ['Value per Share', activeResults.value_per_share],
      ['Terminal Value', activeResults.terminal_value],
      ['PV of Terminal Value', activeResults.pv_terminal_value],
      [],
      ['Forecast & Discounting'],
      ['Year', 'Unlevered FCF', 'Discount Factor', 'Present Value'],
      ...activeResults.forecast.map((row) => [
        row.year,
        row.fcf,
        row.discount_factor,
        row.present_value,
      ]),
    ]

    if (activeSensitivity) {
      rows.push(
        [],
        ['Sensitivity: Value per Share by WACC & Terminal Growth'],
        ['WACC', ...activeSensitivity.terminal_growth_rates.map((g) => percent(g))],
        ...activeSensitivity.rows.map((row) => [
          percent(row.wacc),
          ...row.value_per_share_by_growth.map((v) => (v === null ? 'n/a' : v)),
        ]),
      )
    }

    // Only ever exported while showReverseResult is true (solved, not stale, not loading) -
    // a stale, in-flight, unavailable, or failed reverse result is never written to CSV, and
    // its held-constant assumptions are exported alongside it so the figure isn't presented
    // without the conditions it depends on.
    if (showReverseResult && reverseResult.status === 'solved') {
      rows.push(
        [],
        ['Price-Implied FCF Growth'],
        ['Reference Price', form.referencePrice],
        ['Reference Price As Of', form.referencePriceDate],
        ['Implied FCF Growth Rate (%/yr)', (reverseResult.implied_fcf_growth_rate * 100).toFixed(4)],
        ['Held Constant - WACC (%)', form.wacc],
        ['Held Constant - Terminal Growth Rate (%)', form.terminalGrowthRate],
        ['Held Constant - Forecast Period (yrs)', form.forecastYears],
        ['Held Constant - Base Year UFCF', form.baseYearFcf],
        ['Held Constant - Net Debt', form.netDebt],
        ['Held Constant - Diluted Shares Outstanding', form.dilutedSharesOutstanding],
      )
    }

    downloadCsv(activeCase ? `costco-${activeCase.id}-growth-dcf.csv` : 'dcf-valuation.csv', rows)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isDemoSnapshot) {
      await runDemoValuation()
    } else {
      await runSingleValuation()
    }
  }

  // Fires the shared price-implied-growth solve alongside Run Valuation, in both modes -
  // one request regardless of which mode or how many cases are being calculated. Skipped
  // (resolves null) when there's no usable reference price to solve against, matching
  // hasUsableReferencePrice's own definition below exactly, so "skipped" and "no usable
  // price" can never disagree. Never throws: a network/API failure resolves to
  // {status: "request_failed"} instead - the frontend's own fourth outcome alongside the
  // backend's solved/target_below_floor/not_bracketed, all handled identically by the
  // reverse-DCF display below. This is what makes it safe to await alongside the forward
  // valuation without one's failure silently discarding the other's real outcome.
  const fetchReverseDcf = async () => {
    if (!hasUsableReferencePrice) return null
    try {
      const res = await fetch(`${API_BASE}/api/dcf/implied-growth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_price: Number(form.referencePrice),
          base_year_fcf: Number(form.baseYearFcf),
          forecast_years: Number(form.forecastYears),
          wacc: Number(form.wacc) / 100,
          terminal_growth_rate: Number(form.terminalGrowthRate) / 100,
          net_debt: Number(form.netDebt),
          diluted_shares_outstanding: Number(form.dilutedSharesOutstanding),
        }),
      })
      return res.ok ? await res.json() : { status: 'request_failed' }
    } catch {
      return { status: 'request_failed' }
    }
  }

  const runSingleValuation = async () => {
    setError(null)
    setLoading(true)
    setSensitivity(null)
    setComparison(null)
    // Deliberately NOT setResultsStale(false)/setReverseResultStale(false) here - the
    // previous results are still sitting in state until their replacements are installed
    // below, and clearing either stale flag this early would let showActiveResults (or the
    // reverse-DCF display) treat old numbers as current for the whole duration of the
    // fetch. Each is cleared only once its own fresh outcome actually replaces it.
    try {
      const payload = buildPayload(form)

      // Wrapped so a forward failure can never discard (or be discarded by) the reverse
      // attempt's own independent outcome - see fetchReverseDcf's docstring. Promise.all
      // rejects as soon as either promise rejects, which would otherwise mean a failed
      // forward valuation silently drops a reverse result that resolved just fine, or
      // vice versa.
      const [forwardOutcome, reverseOutcome] = await Promise.all([
        (async () => {
          const res = await fetch(`${API_BASE}/api/dcf/valuation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            throw new Error(await parseErrorResponse(res))
          }
          return res.json()
        })().then(
          (value) => ({ ok: true, value }),
          (err) => ({ ok: false, err }),
        ),
        fetchReverseDcf(),
      ])

      setReverseResult(reverseOutcome)
      setReverseResultStale(false)

      if (!forwardOutcome.ok) {
        setError(friendlyErrorMessage(forwardOutcome.err))
        setResults(null)
        // A failed rerun is a fresh, current outcome in its own right - not a stale one.
        // Leaving resultsStale=true here would make activeResultsStale's "assumptions
        // changed" notice take precedence over the real error below, in the ternary that
        // renders it, hiding the actual failure message behind a misleading "click Run
        // Valuation to refresh" - even though that's exactly what was just clicked.
        setResultsStale(false)
        return
      }
      setResults(forwardOutcome.value)
      setResultsStale(false)

      // Best-effort: the sensitivity grid is a supplementary view, so a failure here
      // shouldn't block or overwrite the main valuation result the user asked for.
      try {
        const sensRes = await fetch(`${API_BASE}/api/dcf/sensitivity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (sensRes.ok) {
          setSensitivity(await sensRes.json())
        }
      } catch {
        // Sensitivity grid is supplementary; leave it blank on failure.
      }
    } finally {
      setLoading(false)
    }
  }

  // One click calculates all three cases via parallel calls to the same endpoints a single
  // run already uses - no backend change. Each case gets its own valuation + sensitivity
  // fetch pair, using demoCaseGrowth's per-case FCF growth rate with every other field
  // shared from `form`. Each case's outcome is recorded independently - Promise.allSettled,
  // not Promise.all, specifically so one case's failure can't blank out (or, worse, get
  // silently paired with) a sibling case's real result.
  const runDemoValuation = async () => {
    setLoading(true)
    // Deliberately NOT setDemoResultsStale(false)/setReverseResultStale(false) here - see
    // runSingleValuation's identical comment; both stay stale (hiding old numbers) for the
    // whole fetch, cleared only once their own fresh outcome replaces what's there.
    try {
      const caseIds = COSTCO_CASES.map((c) => c.id)
      // Promise.allSettled already never rejects, and neither does fetchReverseDcf - so
      // pairing them with Promise.all is safe without the extra ok/err wrapping
      // runSingleValuation needs for its plain (rejectable) forward fetch.
      const [settled, reverseOutcome] = await Promise.all([
        Promise.allSettled(
          caseIds.map(async (caseId) => {
            const payload = buildPayload({ ...form, fcfGrowthRate: demoCaseGrowth[caseId] })
            const res = await fetch(`${API_BASE}/api/dcf/valuation`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            if (!res.ok) {
              throw new Error(await parseErrorResponse(res))
            }
            const caseResults = await res.json()

            // Same best-effort treatment as the single-case path: a missing sensitivity
            // grid for one case doesn't fail that case's headline result.
            let caseSensitivity = null
            try {
              const sensRes = await fetch(`${API_BASE}/api/dcf/sensitivity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
              if (sensRes.ok) {
                caseSensitivity = await sensRes.json()
              }
            } catch {
              // Sensitivity grid is supplementary; leave it blank on failure.
            }

            return { results: caseResults, sensitivity: caseSensitivity }
          }),
        ),
        fetchReverseDcf(),
      ])
      setDemoResults(reconcileDemoResults(caseIds, settled, friendlyErrorMessage))
      setDemoResultsStale(false)
      setReverseResult(reverseOutcome)
      setReverseResultStale(false)
    } finally {
      setLoading(false)
    }
  }

  // The single source every result-rendering, CSV, and print consumer below reads instead
  // of the raw results/sensitivity/error state - in demo mode, "the active tab's own
  // outcome" (which may be a result, an error, or neither pre-run); otherwise, exactly the
  // single-run state, unchanged. This is what makes every consumer already written against
  // results/sensitivity/error automatically become tab-correct without being rewritten.
  const activeDemoCase = isDemoSnapshot ? demoResults?.[activeDemoCaseId] : null
  const activeResults = isDemoSnapshot ? (activeDemoCase?.results ?? null) : results
  const activeSensitivity = isDemoSnapshot ? (activeDemoCase?.sensitivity ?? null) : sensitivity
  const activeError = isDemoSnapshot ? (activeDemoCase?.error ?? null) : error

  // Sensitivity cells are tinted in five discrete tiers (low->high implied value) rather
  // than a computed gradient, so light/dark colors can be declared explicitly in CSS. The
  // base-case cell keeps its existing solid highlight regardless of tier.
  const sensitivityValues = activeSensitivity
    ? activeSensitivity.rows.flatMap((row) => row.value_per_share_by_growth.filter((v) => v !== null))
    : []
  const sensMin = sensitivityValues.length ? Math.min(...sensitivityValues) : 0
  const sensMax = sensitivityValues.length ? Math.max(...sensitivityValues) : 0
  const sensTierClass = (value) => {
    if (sensMax === sensMin) return 'sens-tier-2'
    const t = (value - sensMin) / (sensMax - sensMin)
    return `sens-tier-${Math.min(4, Math.floor(t * 5))}`
  }

  const netDebtNum = Number(form.netDebt)

  // Deterministic arithmetic only - never a recommendation. Requires both a valid positive
  // reference price AND a nonblank "as of" date - a price with no date is exactly the
  // ambiguous, undated situation this milestone replaced ("current price"), so it must not
  // produce a comparison either. An unusable value (blank, zero, negative, non-numeric
  // mid-edit, or a price with no date) hides the comparison entirely rather than showing a
  // misleading figure. Both fields stay editable regardless. fetchReverseDcf's own "skip"
  // check is exactly this same condition, so "skipped" and "unusable" can never disagree.
  const referencePriceNum = Number(form.referencePrice)
  const hasUsableReferencePrice =
    form.referencePrice !== '' &&
    Number.isFinite(referencePriceNum) &&
    referencePriceNum > 0 &&
    form.referencePriceDate !== ''
  const impliedUpside =
    activeResults && hasUsableReferencePrice ? activeResults.value_per_share / referencePriceNum - 1 : null

  // One flag covering "the currently-visible forward result is stale," in whichever mode is
  // active - demoResultsStale in demo mode, resultsStale otherwise. Everything below reads
  // this instead of either raw flag, the same way activeResults/activeSensitivity/activeError
  // already read one shared name regardless of mode.
  const activeResultsStale = isDemoSnapshot ? demoResultsStale : resultsStale

  // Gates CSV/Print and the Analysis Outputs card - not just activeResults, since a stale
  // result must not be exportable or printable either, even though it's still sitting in
  // state (never wiped, only flagged) so it can reappear the instant a rerun completes. The
  // `loading` check is a second, independent guard, not a redundant one: it also covers
  // clicking Run Valuation again on results that were never stale (nothing forces staleness
  // before a rerun) - without it, the previous run's numbers would stay exportable/printable
  // for the whole duration of a fetch that might return something different, or fail
  // outright. Applies identically in both modes now - showing a stale forward result beside
  // edited assumptions is a correctness problem in plain single-ticker mode too, not just demo.
  const showActiveResults = activeResults && !activeResultsStale && !loading

  // Historical context for the reverse-DCF card - pure client-side computation from data
  // already on companyData.periods, no extra request. See historicalGrowth.js for why this
  // is endpoint CAGR over the real fiscal-date span, not a periods.length - 1 approximation.
  const historicalFcfCagr = companyData ? historicalCagr(companyData.periods, 'unlevered_fcf') : null
  const historicalRevenueCagr = companyData ? historicalCagr(companyData.periods, 'revenue') : null

  // Same shape as showActiveResults, for the reverse-DCF card specifically: a stale or
  // in-flight reverse result must never render (or export) as if it were current, even
  // while the forward side is showing fine.
  const showReverseResult = reverseResult && !reverseResultStale && !loading

  // "Explain This Valuation": up to three deterministic observations over outputs already
  // computed above - see explainValuation.js. Each observation independently respects the same
  // forward/reverse invalidation as the cards it draws from (showActiveResults/
  // showReverseResult), so this never needs its own staleness logic.
  const explainObservations = explainValuation({
    showActiveResults,
    activeResults,
    activeSensitivity,
    showReverseResult,
    reverseResult,
    historicalFcfCagr,
    fcfGrowthRate: form.fcfGrowthRate,
    forecastYears: form.forecastYears,
  })

  return (
    <div className="feature-page workspace">
      <CompanyHeader
        profile={companyData?.profile ?? null}
        source={companyData?.source ?? null}
        ticker={ticker}
        setTicker={setTicker}
        onLoadCompany={loadCompany}
        companyLoading={companyLoading}
        companyError={companyError}
        isDemoSnapshot={isDemoSnapshot}
        isDemoOpen={showCostcoDemo}
        onToggleDemo={handleToggleCostcoDemo}
      />

      <CostcoDemoPanel open={showCostcoDemo} />

      <div className="analytical-row">
        <section className="analytical-col">
          <div className="analytical-col-header">
            <span className="step-badge">1</span>
            <h2>Sourced Historical Data</h2>
          </div>
          {companyData ? (
            <CompanySourcedData
              companyData={companyData}
              showHistory={showHistory}
              onToggleHistory={() => setShowHistory((v) => !v)}
            />
          ) : (
            <p className="col-empty-hint">
              Load a company above to see sourced historical financials here.
            </p>
          )}
        </section>

        <section className="analytical-col">
          <div className="analytical-col-header">
            <span className="step-badge">2</span>
            <h2>Assumptions</h2>
          </div>
          <form onSubmit={handleSubmit} id="dcf-assumptions-form">
            <div className="field-group">
              <div className="field-group-label">Forecast</div>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Base Year UFCF</span>
                  {fieldBadgeType('baseYearFcf') && <SourceBadge type={fieldBadgeType('baseYearFcf')} />}
                </span>
                <FormattedNumberInput
                  required
                  min="0"
                  step="any"
                  value={form.baseYearFcf}
                  onChange={setFieldValue('baseYearFcf')}
                  formatter={compactCurrency}
                />
              </label>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">FCF Growth Rate (%/yr)</span>
                  {fieldBadgeType('fcfGrowthRate') && <SourceBadge type={fieldBadgeType('fcfGrowthRate')} />}
                </span>
                <input
                  type="number"
                  required
                  step="any"
                  value={form.fcfGrowthRate}
                  onChange={handleChange('fcfGrowthRate')}
                />
                {/* Every other field on this form is shared across all three demo cases -
                    this is the one exception, so editing it must not read as "edits every
                    case" the way editing WACC below genuinely does. */}
                {isDemoSnapshot && (
                  <span className="field-row-note no-print">
                    Specific to the {COSTCO_CASES.find((c) => c.id === activeDemoCaseId)?.label} tab -
                    every other field here is shared across all three cases.
                  </span>
                )}
              </label>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Forecast Period (years)</span>
                  {fieldBadgeType('forecastYears') && <SourceBadge type={fieldBadgeType('forecastYears')} />}
                </span>
                <input
                  type="number"
                  required
                  min="1"
                  max="15"
                  step="1"
                  value={form.forecastYears}
                  onChange={handleChange('forecastYears')}
                />
              </label>
            </div>

            <div className="field-group">
              <div className="field-group-label">Discount &amp; Terminal Value</div>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">WACC (%)</span>
                  {fieldBadgeType('wacc') && <SourceBadge type={fieldBadgeType('wacc')} />}
                </span>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="any"
                  value={form.wacc}
                  onChange={handleChange('wacc')}
                />
              </label>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Terminal Growth Rate (%)</span>
                  {fieldBadgeType('terminalGrowthRate') && (
                    <SourceBadge type={fieldBadgeType('terminalGrowthRate')} />
                  )}
                </span>
                <input
                  type="number"
                  required
                  min="-300"
                  max="100"
                  step="any"
                  value={form.terminalGrowthRate}
                  onChange={handleChange('terminalGrowthRate')}
                />
              </label>
            </div>

            <div className="field-group">
              <div className="field-group-label">Bridge Inputs</div>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Net Debt (net cash if negative)</span>
                  {fieldBadgeType('netDebt') && <SourceBadge type={fieldBadgeType('netDebt')} />}
                </span>
                <FormattedNumberInput
                  required
                  step="any"
                  value={form.netDebt}
                  onChange={setFieldValue('netDebt')}
                  formatter={compactCurrency}
                />
              </label>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Diluted Shares Outstanding</span>
                  {fieldBadgeType('dilutedSharesOutstanding') && (
                    <SourceBadge type={fieldBadgeType('dilutedSharesOutstanding')} />
                  )}
                </span>
                <FormattedNumberInput
                  required
                  min="0"
                  step="any"
                  value={form.dilutedSharesOutstanding}
                  onChange={setFieldValue('dilutedSharesOutstanding')}
                  formatter={(v) => `${compactShares(v)} shares`}
                />
              </label>
            </div>

            <div className="field-group">
              <div className="field-group-label">Reference Price (optional)</div>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">Reference Share Price</span>
                  {referencePriceBadgeType() && (
                    <span
                      title={
                        form.referencePriceSourceTicker
                          ? `Originally sourced from ${form.referencePriceSourceTicker}`
                          : undefined
                      }
                    >
                      <SourceBadge type={referencePriceBadgeType()} />
                    </span>
                  )}
                </span>
                <FormattedNumberInput
                  min="0"
                  step="any"
                  value={form.referencePrice}
                  onChange={setFieldValue('referencePrice')}
                  formatter={dollarsPerShare}
                />
              </label>
              <label className="field-row">
                <span className="field-row-head">
                  <span className="field-row-label">As of</span>
                </span>
                <input
                  type="date"
                  value={form.referencePriceDate}
                  onChange={handleChange('referencePriceDate')}
                />
              </label>
            </div>

            <button type="submit" className="run-valuation-btn" disabled={loading}>
              {loading ? 'Calculating…' : 'Run Valuation'}
            </button>
            {!backendAwake && !loading && (
              <p className="warmup-status">
                Waking up the valuation engine - the first run may take up to a minute.
              </p>
            )}
          </form>
        </section>

        <section className="analytical-col">
          <div className="analytical-col-header">
            <span className="step-badge">3</span>
            <h2>Valuation Summary</h2>
            {showActiveResults && (
              <div className="col-actions no-print">
                <button type="button" className="secondary" onClick={exportCsv}>
                  CSV
                </button>
                <button type="button" className="secondary" onClick={() => window.print()}>
                  Print
                </button>
              </div>
            )}
          </div>

          {/* Real WAI-ARIA tabs, not styled buttons: roving tabindex (only the active tab is
              in the Tab order), aria-selected drives both semantics and the active-state
              CSS, and handleDemoTabKeyDown implements Left/Right/Home/End per the standard
              pattern. Switching tabs never fetches anything - see selectDemoTab.
              One shared tabpanel (DEMO_TABPANEL_ID), not three - all three tabs' aria-
              controls point at the same, always-present id, which only the active tab's
              content ever occupies. The alternative (a separate DOM node per case, all three
              always mounted, inactive ones hidden) is equally valid per the WAI-ARIA
              Authoring Practices, but would mean either rendering the whole result body
              three times or extracting it into its own component for no behavioral gain -
              this app has exactly one visible case at a time, never more. */}
          {isDemoSnapshot && (
            <div className="demo-case-tabs no-print" role="tablist" aria-label="Costco demo case">
              {COSTCO_CASES.map((c) => (
                <button
                  key={c.id}
                  ref={(el) => {
                    demoTabRefs.current[c.id] = el
                  }}
                  id={`demo-tab-${c.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeDemoCaseId === c.id}
                  aria-controls={DEMO_TABPANEL_ID}
                  tabIndex={activeDemoCaseId === c.id ? 0 : -1}
                  onClick={() => selectDemoTab(c.id)}
                  onKeyDown={handleDemoTabKeyDown}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div
            id={isDemoSnapshot ? DEMO_TABPANEL_ID : undefined}
            role={isDemoSnapshot ? 'tabpanel' : undefined}
            aria-labelledby={isDemoSnapshot ? `demo-tab-${activeDemoCaseId}` : undefined}
            tabIndex={isDemoSnapshot ? 0 : undefined}
          >
            {loading ? (
              <p className="col-empty-hint">
                {isDemoSnapshot ? 'Calculating all three cases…' : 'Calculating…'}
              </p>
            ) : isDemoSnapshot && !demoResults ? (
              <p className="col-empty-hint">
                One click of Run Valuation calculates all three cases - switch tabs afterward
                to compare them instantly, with no new calculation.
              </p>
            ) : activeResultsStale ? (
              <p className="terminal-growth-warning">
                <span className="terminal-growth-warning-explanation">
                  {isDemoSnapshot
                    ? 'Assumptions changed since these results were calculated. Click Run Valuation to refresh all three cases.'
                    : 'Assumptions changed since this valuation was calculated. Click Run Valuation to refresh.'}
                </span>
              </p>
            ) : activeError ? (
              <p className="error">{activeError}</p>
            ) : activeResults ? (
              <>
                <div className="valuation-hero">
                  <span className="hero-label">
                    Implied Value per Share
                    {isDemoSnapshot &&
                      ` — ${COSTCO_CASES.find((c) => c.id === activeDemoCaseId)?.label}`}
                  </span>
                  <span className="hero-value">{dollarsPerShare(activeResults.value_per_share)}</span>
                </div>

                {hasUsableReferencePrice && (
                  <div className="valuation-comparison">
                    <div className="comparison-rows">
                      <div className="comparison-row">
                        <span className="label">Reference Price (as of {form.referencePriceDate})</span>
                        <span className="value">{dollarsPerShare(referencePriceNum)}</span>
                      </div>
                      <div className="comparison-row">
                        <span className="label">{impliedUpside >= 0 ? 'Implied Upside' : 'Implied Downside'}</span>
                        <span className={`value ${impliedUpside >= 0 ? 'value-positive' : 'value-negative'}`}>
                          {impliedUpside >= 0 ? '+' : ''}
                          {(impliedUpside * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <p className="comparison-disclaimer">
                      The difference reflects the model&rsquo;s selected assumptions and simplified
                      flat-growth methodology. It is not an investment recommendation.
                    </p>
                  </div>
                )}

                <div className="valuation-support-grid">
                  <div>
                    <span className="label">Enterprise Value</span>
                    <span className="value">{compactCurrency(activeResults.enterprise_value)}</span>
                  </div>
                  <div>
                    <span className="label">{netDebtNum < 0 ? 'Net Cash' : 'Net Debt'}</span>
                    <span className="value">{compactCurrency(Math.abs(netDebtNum))}</span>
                  </div>
                  <div>
                    <span className="label">Equity Value</span>
                    <span className="value">{compactCurrency(activeResults.equity_value)}</span>
                  </div>
                  <div>
                    <span className="label">Diluted Shares</span>
                    <span className="value">{compactShares(Number(form.dilutedSharesOutstanding))}</span>
                  </div>
                  <div>
                    <span className="label">WACC</span>
                    <span className="value">{form.wacc}%</span>
                  </div>
                  <div>
                    <span className="label">Terminal Growth</span>
                    <span className="value">{form.terminalGrowthRate}%</span>
                  </div>
                  <div>
                    <span className="label">Forecast Period</span>
                    <span className="value">{form.forecastYears} yrs</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="col-empty-hint">Run a valuation to see results here.</p>
            )}

            {/* Reverse DCF: the growth rate this same model needs to reconcile the
                reference price, not a market forecast - the copy throughout this block says
                "reconciles," never "the market expects" or similar. One shared result
                regardless of mode (never per Low/Base/High case), compared against
                whichever growth assumption is currently active. Deliberately a sibling of
                the forward ternary above, not nested inside its activeResults branch: the
                two calculations invalidate independently (see FORWARD_STALE_FIELDS/
                REVERSE_STALE_FIELDS), so forward going stale, erroring, or still being
                mid-run must never also hide a reverse result that's still perfectly valid,
                and vice versa. The card itself always renders (never conditioned on
                hasUsableReferencePrice) so the feature stays discoverable before any price
                is entered - its own first ternary branch below covers "no usable price yet"
                with a concrete instruction, rather than the whole block disappearing. */}
            <div className="reverse-dcf-card">
              <div className="reverse-dcf-label">Price-Implied FCF Growth</div>
              {!hasUsableReferencePrice ? (
                <p className="col-empty-hint">
                  Enter a positive reference price and as-of date to calculate price-implied
                  growth.
                </p>
              ) : loading ? (
                <p className="col-empty-hint">Calculating…</p>
              ) : reverseResultStale ? (
                <p className="terminal-growth-warning">
                  <span className="terminal-growth-warning-explanation">
                    Assumptions changed since this was calculated. Click Run Valuation to
                    refresh.
                  </span>
                </p>
              ) : !reverseResult ? (
                <p className="col-empty-hint">
                  Run Valuation to calculate the growth rate that reconciles the reference
                  price.
                </p>
              ) : reverseResult.status === 'solved' ? (
                <>
                  <span className="reverse-dcf-value">
                    {percent(reverseResult.implied_fcf_growth_rate)}
                  </span>
                  <p className="reverse-dcf-context">
                    The constant annual FCF growth rate that reconciles{' '}
                    {dollarsPerShare(referencePriceNum)} as of {form.referencePriceDate},
                    given the current WACC, terminal growth, forecast period, base year
                    FCF, net debt, and share count - not a market forecast.
                  </p>
                  <p className="reverse-dcf-compare">
                    vs.{' '}
                    {isDemoSnapshot
                      ? `${COSTCO_CASES.find((c) => c.id === activeDemoCaseId)?.label}’s`
                      : 'the'}{' '}
                    {form.fcfGrowthRate}%/yr {isDemoSnapshot ? '' : 'analyst '}assumption
                  </p>
                  <p className="reverse-dcf-historical">
                    {historicalFcfCagr
                      ? `Historical UFCF CAGR (FY${historicalFcfCagr.oldestFiscalYearEnd.slice(0, 4)}–FY${historicalFcfCagr.newestFiscalYearEnd.slice(0, 4)}): ${percent(historicalFcfCagr.cagr)}`
                      : "Historical UFCF CAGR: not meaningful for this company's history"}
                    {historicalRevenueCagr && (
                      <span className="reverse-dcf-historical-secondary">
                        {' '}
                        (revenue CAGR over the same span: {percent(historicalRevenueCagr.cagr)})
                      </span>
                    )}
                  </p>
                </>
              ) : reverseResult.status === 'target_below_floor' ? (
                <p className="col-empty-hint">
                  Even at very low explicit-period growth, this model can&rsquo;t reach{' '}
                  {dollarsPerShare(referencePriceNum)} given the current net debt and share
                  count - the floor here is {dollarsPerShare(reverseResult.floor_value_per_share)}.
                </p>
              ) : reverseResult.status === 'not_bracketed' ? (
                <p className="col-empty-hint">
                  Price-implied growth couldn&rsquo;t be solved within a computable range
                  for these inputs.
                </p>
              ) : (
                <p className="error">
                  Price-implied growth is unavailable (connection or server issue).
                </p>
              )}
            </div>

            {explainObservations.length > 0 && (
              <div className="explain-valuation">
                <h3>Explain This Valuation</h3>
                <ul>
                  {explainObservations.map((obs) => (
                    <li key={obs.id}>{obs.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>

      {companyData && companyData.periods.length > 1 && (
        <SourcedHistoryPanel periods={companyData.periods} visible={showHistory} />
      )}

      {showActiveResults && (
        <WorkflowCard
          step={4}
          title="Analysis Outputs"
          dense
          actions={
            <div className="analysis-tabs no-print">
              <button
                type="button"
                className={analysisTab === 'sensitivity' ? 'active' : ''}
                onClick={() => setAnalysisTab('sensitivity')}
              >
                Sensitivity &amp; Bridge
              </button>
              <button
                type="button"
                className={analysisTab === 'schedule' ? 'active' : ''}
                onClick={() => setAnalysisTab('schedule')}
              >
                Forecast &amp; Discounting
              </button>
            </div>
          }
        >
          {activeSensitivity && (
            <div
              className={
                analysisTab === 'sensitivity' ? 'sensitivity-legend-wrap' : 'sensitivity-legend-wrap no-screen'
              }
            >
              <button
                type="button"
                className="sensitivity-legend-toggle no-print"
                onClick={() => setShowSensitivityLegend((v) => !v)}
                aria-expanded={showSensitivityLegend}
              >
                How to read this <span aria-hidden="true">{showSensitivityLegend ? '▲' : '▼'}</span>
              </button>
              <p
                className={showSensitivityLegend ? 'sensitivity-legend' : 'sensitivity-legend no-screen'}
              >
                The highlighted cell is your base case &mdash; {form.wacc}% WACC (the discount
                rate),{' '}
                {form.terminalGrowthRate}% terminal growth (the assumed long-run growth rate)
                &mdash; implying{' '}
                {dollarsPerShare(activeResults.value_per_share)}/share. A lower WACC or higher terminal
                growth generally increases value; the reverse generally decreases it.
                &ldquo;n/a&rdquo; means that combination falls outside the Gordon Growth
                formula&rsquo;s valid mathematical range &mdash; most commonly because terminal
                growth equals or exceeds WACC. The Value Bridge subtracts net debt from
                enterprise value, then divides by diluted shares. Sensitivity warnings below
                describe how fragile a result is to small assumption changes, not whether the
                assumptions themselves are reasonable.
              </p>
            </div>
          )}

          <div className={analysisTab === 'sensitivity' ? 'analysis-outputs-row' : 'analysis-outputs-row no-screen'}>
            <div className="sensitivity-panel">
              {activeSensitivity ? (
                <>
                  <h3>Sensitivity: Value per Share by WACC &amp; Terminal Growth</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>WACC</th>
                          {activeSensitivity.terminal_growth_rates.map((g) => (
                            <th key={g}>{percent(g)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeSensitivity.rows.map((row) => (
                          <tr key={row.wacc}>
                            <td>{percent(row.wacc)}</td>
                            {row.value_per_share_by_growth.map((cellValue, i) => {
                              const isBaseCase =
                                Math.abs(row.wacc - Number(form.wacc) / 100) < 1e-6 &&
                                Math.abs(
                                  activeSensitivity.terminal_growth_rates[i] -
                                    Number(form.terminalGrowthRate) / 100,
                                ) < 1e-6
                              const className = isBaseCase
                                ? 'sensitivity-base-case'
                                : cellValue !== null
                                  ? sensTierClass(cellValue)
                                  : undefined
                              return (
                                <td key={i} className={className}>
                                  {cellValue === null ? 'n/a' : dollarsPerShare(cellValue)}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="assumptions">
                    Base case held for all else. WACC-at-or-below-terminal-growth cells are n/a.
                    Tint reflects relative value (green = higher, red = lower).
                  </p>
                </>
              ) : (
                <p className="col-empty-hint">Sensitivity grid unavailable for this run.</p>
              )}
            </div>

            <div className="bridge-panel">
              <h3>Value Bridge</h3>
              <ValueBridge
                results={activeResults}
                netDebt={netDebtNum}
                dilutedSharesOutstanding={Number(form.dilutedSharesOutstanding)}
              />
              <p className="assumptions">
                Incl. PV of Terminal Value {compactCurrency(activeResults.pv_terminal_value)} (Terminal Value{' '}
                {compactCurrency(activeResults.terminal_value)}).
              </p>
              {(activeResults.terminal_growth_warnings?.length > 0 ||
                activeResults.fcf_growth_warnings?.length > 0) && (
                <ul className="terminal-growth-warning-list">
                  {[...activeResults.terminal_growth_warnings, ...activeResults.fcf_growth_warnings].map(
                    (warning) => (
                      <li
                        key={warning.id}
                        className={`terminal-growth-warning terminal-growth-warning--${warning.tier}`}
                      >
                        <span className="terminal-growth-warning-tier">{warning.tier}</span>
                        <span className="terminal-growth-warning-explanation">
                          {warning.explanation}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className={analysisTab === 'schedule' ? undefined : 'no-screen'}>
            <h3>Forecast &amp; Discounting</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Unlevered FCF</th>
                    <th>Discount Factor</th>
                    <th>Present Value</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResults.forecast.map((row) => (
                    <tr key={row.year}>
                      <td>{row.year}</td>
                      <td>{currency(row.fcf)}</td>
                      <td>{row.discount_factor.toFixed(3)}</td>
                      <td>{currency(row.present_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            type="button"
            className="methodology-toggle no-print"
            onClick={() => setShowMethodology((v) => !v)}
          >
            ⓘ Methodology {showMethodology ? '▲' : '▼'}
          </button>
          <p className={`assumptions ${showMethodology ? '' : 'no-screen'}`}>
            Explicit-period FCF is projected from the base year at a single flat growth rate (no
            revenue/margin/CapEx build-up); terminal value uses the Gordon Growth method off WACC
            and terminal growth as direct inputs; cash flows are discounted using the end-of-year
            convention, not mid-year.
          </p>
          <p className={`assumptions ${showMethodology ? '' : 'no-screen'}`}>
            Terminal growth represents the business&rsquo;s steady-state growth rate forever, not
            a near-term forecast. Positive values are conventionally benchmarked against
            sustainable long-run nominal economic growth (real growth plus inflation) in the cash
            flows&rsquo; own currency &mdash; a figure that varies by market and period, so it
            isn&rsquo;t hard-coded here. Negative values imply permanent structural decline, not
            near-term softness (which belongs in the explicit forecast period instead). Only WACC
            &gt; terminal growth, and Gordon Growth&rsquo;s own convergence requirement, are
            enforced as hard limits; combinations that are valid but structurally unusual &mdash;
            a narrow WACC&ndash;terminal growth spread, or terminal growth at or below &minus;100%
            (at exactly &minus;100%, next period&rsquo;s projected cash flow is zero; below it,
            repeated compounding produces alternating-sign cash flows) &mdash; surface as
            warnings above instead of being blocked outright.
          </p>
          <p className={`assumptions ${showMethodology ? '' : 'no-screen'}`}>
            Explicit-period FCF growth has no fixed economic ceiling or floor &mdash; analyst
            judgment, not a hard-coded threshold. The arithmetic itself stays well-defined at
            any value, so nothing is blocked on economic grounds; assumptions that are valid
            but unusual surface as warnings instead. Exactly &minus;100% means every forecast
            year becomes $0. Below &minus;100%, projected cash flow alternates between
            negative and positive each year rather than continuing to decline &mdash;
            mechanically computed, but worth confirming it&rsquo;s what you intend. Only
            overflow or a non-finite result is rejected outright, since that genuinely cannot
            be computed.
          </p>
        </WorkflowCard>
      )}

      {/* Scenario Comparison sits with the Saved Scenarios workflow at the bottom, after
          the core company -> assumptions -> valuation -> analysis sequence, rather than
          interrupting it - comparing scenarios is a side workflow, not part of reading the
          current valuation. */}
      {comparison && (
        <ScenarioComparisonTable
          title="Scenario Comparison"
          comparisons={comparison}
          metrics={COMPARISON_METRICS}
          onClear={() => setComparison(null)}
        />
      )}

      <div className="scenarios-compact">
        <ScenarioManager
          storageKey="dcf"
          currentData={form}
          onLoad={loadScenario}
          onCompare={handleCompare}
        />
      </div>
    </div>
  )
}

export default DcfValuation
