// Pure logic pulled out of DcfValuation.jsx specifically so it's unit-testable without a
// DOM - DcfValuation.jsx itself can't be imported by Node's test runner (it contains JSX,
// which only Vite's build pipeline can parse), but this plain module can. Both functions
// are the two places a real bug here would be a genuine financial/UX correctness issue,
// not just a rendering detail: silently mixing up which case a result belongs to, or a tab
// strip whose arrow keys drift or dead-end at an edge.

// Reconciles a Promise.allSettled outcome array (same order as caseIds) into a
// {[caseId]: {results, sensitivity, error}} dict. Every case gets its own independent
// entry - a rejected case never inherits another case's results, and a fulfilled case
// never carries a leftover error. errorMessage defaults to String(reason) so this stays
// testable with plain Error objects; DcfValuation.jsx passes friendlyErrorMessage.
export function reconcileDemoResults(caseIds, settled, errorMessage = (reason) => String(reason?.message ?? reason)) {
  const next = {}
  caseIds.forEach((caseId, i) => {
    const outcome = settled[i]
    next[caseId] =
      outcome.status === 'fulfilled'
        ? { results: outcome.value.results, sensitivity: outcome.value.sensitivity, error: null }
        : { results: null, sensitivity: null, error: errorMessage(outcome.reason) }
  })
  return next
}

// Standard WAI-ARIA roving-tabindex arithmetic for a horizontal tab strip: ArrowRight/
// ArrowLeft wrap around both ends, Home/End jump to the ends, any other key is not this
// widget's concern (returns null so the caller leaves default browser behavior alone).
export function nextDemoTabIndex(key, currentIndex, length) {
  if (key === 'ArrowRight') return (currentIndex + 1) % length
  if (key === 'ArrowLeft') return (currentIndex - 1 + length) % length
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  return null
}
