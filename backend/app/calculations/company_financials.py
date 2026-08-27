"""Derives unlevered free cash flow and its components from raw company financial data
(EBIT, taxes, D&A, CapEx, working-capital accounts) - the bridge between sourced
fundamentals (see app/services/company_data.py) and the DCF engine's base_year_fcf input.

Modeling assumptions, explicit by design:
- Effective tax rate = income tax expense / pretax income. Undefined (None) when pretax
  income isn't positive - a loss-making or breakeven year doesn't have a meaningful
  effective rate, and forcing one would misstate UFCF rather than just leaving it unknown.
- Net working capital = (current assets - cash and short-term investments) - (current
  liabilities - current portion of debt). Cash and debt are financing/investing items, not
  operating working capital, so both are excluded before differencing.
- UFCF = EBIT x (1 - tax rate) + D&A - CapEx - change in NWC - the standard
  enterprise-value-DCF construction, not an OCF - CapEx shortcut (which blends in
  after-tax-interest and other financing effects that don't belong in an unlevered figure).
- Any missing input makes the result undefined (None) rather than silently treating it as
  zero - a missing D&A figure should not quietly become "no D&A", for example.
"""


def effective_tax_rate(income_tax_expense, pretax_income):
    if income_tax_expense is None or pretax_income is None or pretax_income <= 0:
        return None
    return income_tax_expense / pretax_income


def net_working_capital(current_assets, cash_and_short_term_investments, current_liabilities, current_debt):
    if None in (current_assets, cash_and_short_term_investments, current_liabilities, current_debt):
        return None
    return (current_assets - cash_and_short_term_investments) - (current_liabilities - current_debt)


def change_in_nwc(nwc_current_period, nwc_prior_period):
    if nwc_current_period is None or nwc_prior_period is None:
        return None
    return nwc_current_period - nwc_prior_period


def unlevered_fcf(ebit, tax_rate, depreciation_and_amortization, capital_expenditures, nwc_change):
    if None in (ebit, tax_rate, depreciation_and_amortization, capital_expenditures, nwc_change):
        return None
    return ebit * (1 - tax_rate) + depreciation_and_amortization - capital_expenditures - nwc_change


def net_debt(total_debt, cash):
    if total_debt is None or cash is None:
        return None
    return total_debt - cash
