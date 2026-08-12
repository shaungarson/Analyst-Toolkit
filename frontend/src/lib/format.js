export const currency = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const percent = (n) => `${(n * 100).toFixed(2)}%`
