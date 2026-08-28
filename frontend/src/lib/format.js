export const currency = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const percent = (n) => `${(n * 100).toFixed(2)}%`

// Compact, analyst-facing magnitude formatting ($111.59B, not $111,588,891,893) for figures
// that are routinely in the hundreds of millions to trillions. Below $1M there's no real
// legibility win from compacting, so it falls back to the plain currency() formatter -
// "$450,000" is already easy to read; "$0.45M" is not an improvement.
export const compactCurrency = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return 'n/a'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`
  return currency(n)
}

// Same magnitude compaction for share counts (14.59B shares, 50.00M shares), no currency
// symbol.
export const compactShares = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return 'n/a'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  return n.toLocaleString('en-US')
}
