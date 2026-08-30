"""Maps raw SEC XBRL company facts (app/services/sec_edgar.py) onto the flat set of
financial-statement concepts the DCF needs (app/schemas/company.py's FinancialPeriod).

Real filings were inspected across Apple, Caterpillar, and Walmart before writing this -
XBRL tag names for the same economic concept genuinely vary by company and change over time
within the same company (e.g. Walmart's D&A moved from DepreciationDepletionAndAmortization
to DepreciationAmortizationAndAccretionNet starting FY2020). Every fallback chain below
exists because a real company in that sample needed it, not speculatively.

Two concepts can't be read off a single tag and are computed instead:
- Cash: this app's "cash" has always meant cash-and-short-term-investments combined (see
  app/calculations/company_financials.py's net_working_capital docstring), matching Alpha
  Vantage's cashAndShortTermInvestments field. SEC's clean, universal tag
  (CashAndCashEquivalentsAtCarryingValue) is cash-only, so the short-term-investments
  component is added back explicitly to preserve that existing meaning.
- Debt: no company in the sample reports one universal "total debt" tag. Composition
  genuinely differs (Apple splits long-term debt into current/noncurrent with no separate
  short-term-borrowings line; Caterpillar has the reverse; Walmart reports all three).
  Total debt is summed from whichever recognized, non-overlapping, interest-bearing
  components a filer reports - operating-lease liabilities are deliberately never included.

Every mapped value carries a provenance record (XBRL tag(s), accession number, filed date,
form, fiscal year/period, unit, and a "direct" vs "calculated" confidence marker) so a
future milestone can surface it without re-deriving it. This module does not decide when to
fall back to Alpha Vantage - it reports None for anything it can't confidently map, and
leaves that decision to app/services/company_data.py, which has the Alpha Vantage data to
fall back to.
"""

import datetime

# A 52/53-week fiscal year (e.g. Apple's) can run a few days short of or over 365 - this
# range comfortably covers every real annual period seen (364-371 days) while still
# rejecting the quarterly stub periods SEC sometimes tags fp="FY" (confirmed live: Apple's
# company facts contain a Q4-only fact under the FY2020 Revenues tag, duration ~90 days,
# that duration alone - not fp - correctly excludes).
_ANNUAL_DURATION_MIN_DAYS = 340
_ANNUAL_DURATION_MAX_DAYS = 380

_REVENUE_TAGS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
]
_EBIT_TAGS = ["OperatingIncomeLoss"]
_PRETAX_INCOME_TAGS = [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
]
_INCOME_TAX_EXPENSE_TAGS = ["IncomeTaxExpenseBenefit"]
_DA_TAGS = [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
]
_CAPEX_TAGS = ["PaymentsToAcquirePropertyPlantAndEquipment"]
_DILUTED_SHARES_TAGS = ["WeightedAverageNumberOfDilutedSharesOutstanding"]

_CURRENT_ASSETS_TAGS = ["AssetsCurrent"]
_CURRENT_LIABILITIES_TAGS = ["LiabilitiesCurrent"]

_CASH_TAGS = ["CashAndCashEquivalentsAtCarryingValue"]
_SHORT_TERM_INVESTMENT_TAGS = [
    "MarketableSecuritiesCurrent",
    "AvailableForSaleSecuritiesCurrent",
    "ShortTermInvestments",
]
# SEC's own pre-combined tag - seen in Caterpillar's pre-2021 filings, before it switched to
# reporting cash and short-term investments as separate lines.
_CASH_AND_STI_COMBINED_TAGS = ["CashCashEquivalentsAndShortTermInvestments"]

# Each slot is itself a same-concept fallback chain (old vs. new tag naming for the same
# line item); slots are summed. Finance leases are included as recognized interest-bearing
# debt (conventional treatment, and consistent with excluding only operating leases);
# capital lease tags are the pre-ASU-2016-02 name for the same concept.
_DEBT_NONCURRENT_SLOTS = [
    ["LongTermDebtNoncurrent"],
    ["FinanceLeaseLiabilityNoncurrent", "CapitalLeaseObligationsNoncurrent"],
]
_DEBT_CURRENT_SLOTS = [
    ["LongTermDebtCurrent"],
    ["ShortTermBorrowings"],
    ["OtherShortTermBorrowings"],
    ["FinanceLeaseLiabilityCurrent", "CapitalLeaseObligationsCurrent"],
]
# Only used when a filer reports no split current/noncurrent debt tags at all - current_debt
# is genuinely unknowable from a single undifferentiated total in that case.
_DEBT_COMBINED_FALLBACK_TAGS = ["LongTermDebt"]

_SIMPLE_DURATION_FIELDS = {
    "revenue": (_REVENUE_TAGS, "USD"),
    "ebit": (_EBIT_TAGS, "USD"),
    "pretax_income": (_PRETAX_INCOME_TAGS, "USD"),
    "income_tax_expense": (_INCOME_TAX_EXPENSE_TAGS, "USD"),
    "depreciation_and_amortization": (_DA_TAGS, "USD"),
    "capital_expenditures": (_CAPEX_TAGS, "USD"),
    "diluted_shares_outstanding": (_DILUTED_SHARES_TAGS, "shares"),
}
_SIMPLE_INSTANT_FIELDS = {
    "current_assets": (_CURRENT_ASSETS_TAGS, "USD"),
    "current_liabilities": (_CURRENT_LIABILITIES_TAGS, "USD"),
}


def _duration_days(start, end):
    return (datetime.date.fromisoformat(end) - datetime.date.fromisoformat(start)).days


def _select_latest_fact(facts_by_tag, tag, period_end, is_instant, expected_unit):
    """Among this tag's 10-K facts for the exact period end (and, for duration concepts, an
    annual-length period), returns the most-recently-filed one - both as its plain value and
    a provenance record. None if no 10-K fact matches.

    Preferring the most-recently-filed fact (rather than the value as originally reported)
    is required for correctness, not just a tie-break: confirmed live against Walmart's
    February 2024 3-for-1 stock split, where the as-originally-filed FY2023 diluted share
    count (~2.7B) and the same period's restated, split-adjusted figure in later 10-Ks
    (~8.2B) differ by exactly that ratio. Only the latest-filed figure is comparable to a
    current, post-split share price."""
    tag_data = facts_by_tag.get(tag)
    if not tag_data:
        return None

    best, best_unit = None, None
    for unit, facts in tag_data.get("units", {}).items():
        if unit != expected_unit:
            continue
        for fact in facts:
            if fact.get("form") != "10-K" or fact.get("end") != period_end:
                continue
            if not is_instant:
                start = fact.get("start")
                if not start or not (
                    _ANNUAL_DURATION_MIN_DAYS <= _duration_days(start, period_end) <= _ANNUAL_DURATION_MAX_DAYS
                ):
                    continue
            if best is None or fact.get("filed", "") > best.get("filed", ""):
                best, best_unit = fact, unit

    if best is None:
        return None
    return {
        "tag": tag,
        "value": best.get("val"),
        "unit": best_unit,
        "accession_number": best.get("accn"),
        "filed": best.get("filed"),
        "form": best.get("form"),
        "fiscal_year": best.get("fy"),
        "fiscal_period": best.get("fp"),
    }


def _select_component(facts_by_tag, tags, period_end, is_instant, expected_unit):
    """Tries each tag in priority order; returns the first period-matching fact found."""
    for tag in tags:
        fact = _select_latest_fact(facts_by_tag, tag, period_end, is_instant, expected_unit)
        if fact is not None:
            return fact
    return None


def _select_field(facts_by_tag, tags, period_end, is_instant, expected_unit):
    fact = _select_component(facts_by_tag, tags, period_end, is_instant, expected_unit)
    if fact is None:
        return None, None
    return fact["value"], {"confidence": "direct", "components": [fact]}


def _extract_cash(facts_by_tag, period_end):
    cash_fact = _select_component(facts_by_tag, _CASH_TAGS, period_end, True, "USD")
    if cash_fact is not None:
        components = [cash_fact]
        total = cash_fact["value"]
        sti_fact = _select_component(facts_by_tag, _SHORT_TERM_INVESTMENT_TAGS, period_end, True, "USD")
        if sti_fact is not None:
            components.append(sti_fact)
            total += sti_fact["value"]
        return total, {"confidence": "calculated", "components": components}

    combined_fact = _select_component(facts_by_tag, _CASH_AND_STI_COMBINED_TAGS, period_end, True, "USD")
    if combined_fact is not None:
        return combined_fact["value"], {"confidence": "direct", "components": [combined_fact]}

    return None, None


def _sum_debt_slots(facts_by_tag, slots, period_end):
    total = 0.0
    components = []
    any_found = False
    for slot in slots:
        fact = _select_component(facts_by_tag, slot, period_end, True, "USD")
        if fact is not None:
            total += fact["value"]
            components.append(fact)
            any_found = True
    return total, components, any_found


def _extract_debt(facts_by_tag, period_end):
    noncurrent_total, noncurrent_components, noncurrent_found = _sum_debt_slots(
        facts_by_tag, _DEBT_NONCURRENT_SLOTS, period_end
    )
    current_total, current_components, current_found = _sum_debt_slots(
        facts_by_tag, _DEBT_CURRENT_SLOTS, period_end
    )

    if noncurrent_found or current_found:
        return {
            "total_debt": noncurrent_total + current_total,
            "current_debt": current_total,
        }, {"confidence": "calculated", "components": noncurrent_components + current_components}

    combined_fact = _select_component(facts_by_tag, _DEBT_COMBINED_FALLBACK_TAGS, period_end, True, "USD")
    if combined_fact is not None:
        # A single undifferentiated total was reported - the current-portion split isn't
        # available, so current_debt (needed for the NWC calculation) stays unknown rather
        # than being guessed at.
        return {"total_debt": combined_fact["value"], "current_debt": None}, {
            "confidence": "calculated",
            "components": [combined_fact],
        }

    return {"total_debt": None, "current_debt": None}, None


def _annual_period_ends(facts_by_tag, max_periods):
    """Distinct fiscal-year-end dates with a confirmed annual (10-K, ~365-day) EBIT fact,
    most recent first. EBIT anchors period discovery since it's a single universal tag
    confirmed present for every company in the validation sample, and duration-based -
    exercising the same annual-length filter every other concept is matched against."""
    ends = set()
    tag_data = facts_by_tag.get(_EBIT_TAGS[0], {})
    for unit, facts in tag_data.get("units", {}).items():
        if unit != "USD":
            continue
        for fact in facts:
            if fact.get("form") != "10-K":
                continue
            start, end = fact.get("start"), fact.get("end")
            if not start or not end:
                continue
            if _ANNUAL_DURATION_MIN_DAYS <= _duration_days(start, end) <= _ANNUAL_DURATION_MAX_DAYS:
                ends.add(end)
    return sorted(ends, reverse=True)[:max_periods]


def extract_annual_periods(company_facts, max_periods):
    """Returns up to max_periods annual period dicts, most recent fiscal year first:
    {"fiscal_year_end": "2025-09-27", "values": {...}, "provenance": {...}}.

    "values" has the same field names company_data.py's Alpha-Vantage extraction produces
    (revenue, ebit, pretax_income, income_tax_expense, depreciation_and_amortization,
    capital_expenditures, current_assets, current_liabilities, cash, total_debt,
    current_debt, diluted_shares_outstanding) - None for any field this filer's XBRL data
    doesn't confidently support, letting the caller decide whether/how to fall back.

    "provenance" has one entry per successfully-mapped field: {"confidence": "direct" or
    "calculated", "components": [{"tag", "value", "unit", "accession_number", "filed",
    "form", "fiscal_year", "fiscal_period"}, ...]}. Retained for a future provenance UI;
    not part of the API response schema yet.
    """
    facts_by_tag = company_facts.get("facts", {}).get("us-gaap", {})
    period_ends = _annual_period_ends(facts_by_tag, max_periods)

    periods = []
    for period_end in period_ends:
        values = {}
        provenance = {}

        for field, (tags, unit) in _SIMPLE_DURATION_FIELDS.items():
            value, prov = _select_field(facts_by_tag, tags, period_end, False, unit)
            values[field] = value
            if prov:
                provenance[field] = prov

        for field, (tags, unit) in _SIMPLE_INSTANT_FIELDS.items():
            value, prov = _select_field(facts_by_tag, tags, period_end, True, unit)
            values[field] = value
            if prov:
                provenance[field] = prov

        cash_value, cash_prov = _extract_cash(facts_by_tag, period_end)
        values["cash"] = cash_value
        if cash_prov:
            provenance["cash"] = cash_prov

        debt_values, debt_prov = _extract_debt(facts_by_tag, period_end)
        values["total_debt"] = debt_values["total_debt"]
        values["current_debt"] = debt_values["current_debt"]
        if debt_prov:
            provenance["total_debt"] = debt_prov

        periods.append({"fiscal_year_end": period_end, "values": values, "provenance": provenance})

    return periods
