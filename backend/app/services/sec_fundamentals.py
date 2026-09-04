"""Maps raw SEC XBRL company facts (app/services/sec_edgar.py) onto the flat set of
financial-statement concepts the DCF needs (app/schemas/company.py's FinancialPeriod).

Real filings were inspected across Apple, Caterpillar, and Walmart before writing this -
XBRL tag names for the same economic concept genuinely vary by company and change over time
within the same company (e.g. Walmart's D&A moved from DepreciationDepletionAndAmortization
to DepreciationAmortizationAndAccretionNet starting FY2020). Every fallback chain below
exists because a real company in that sample needed it, not speculatively.

Three concepts can't be read off a single tag and are computed instead:
- D&A: most filers report one combined cash-flow D&A tag. Some report none and only tag the
  components (Microsoft, Alphabet, Tesla and Intel), and those are summed from an explicit,
  reviewed component list - never from a tag-name pattern - but only where the filer tags both
  components in every period. Alphabet and Tesla do not, and are refused rather than served
  depreciation alone, which would assert an amortization of zero their own filings contradict.
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
# One combined cash-flow D&A fact, in priority order. Thirteen of a seventeen-ticker basket
# resolve here, and this chain is always tried first - see _extract_depreciation_and_amortization
# for why preferring it matters rather than being a mere ordering preference.
_DA_TAGS = [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
]

# Components, summed only when no combined fact exists for the period AND this filer appears in
# the verified map below. The map is an allowlist, not a heuristic: a filer is added only after
# its component sum has been reconciled by hand against its own filed cash flow statements, in
# every year the app would display.
#
# Structural evidence is deliberately not enough. An earlier version admitted any filer that
# tagged both components throughout the period set, while its own documentation conceded that
# this was necessary but not sufficient evidence of complete D&A - which means an unknown filer
# would have been served a figure on the promise of a reconciliation that can only happen after
# the app has already used it. A live ticker cannot be reconciled later. So an unknown filer with
# both component tags in every year stays unmapped, and the caller falls back or refuses exactly
# as for any other field this module cannot confidently map.
#
# Reconciliation evidence for the two approved filers, checked across all five displayed years
# against the aggregate on each filer's own cash flow statement:
#
#   MSFT (CIK 789019)  Its line is msft:DepreciationAmortizationAndOther, a company extension tag
#       the companyfacts API never exposes, and it bundles an "other" bucket that is not D&A and
#       falls either way: +1.2%, -4.9%, -4.6%, -2.6%, +1.0% across FY2026-FY2022. Microsoft also
#       restated that line between filings (FY2025 34,153 -> 29,433), so the aggregate is not a
#       fixed target. Deviation is two-sided and is NOT conservative.
#   INTC (CIK 50863)   Depreciation and AmortizationOfIntangibleAssets ARE the two D&A lines on
#       its cash flow statement. Exact in all five years; its impairment sits on a separate line
#       this construction does not touch.
#
# Examined and deliberately NOT approved:
#
#   GOOGL  Reports AmortizationOfIntangibleAssets only on 10-Qs, never annually, while its 10-Ks
#       carry FiniteLivedIntangibleAssetsAccumulatedAmortization and forward amortization
#       schedules. It HAS intangible amortization; its cash-flow line "Depreciation of property
#       and equipment" is depreciation only, and the amortization sits inside "Other".
#       Depreciation alone matches that one line exactly and is still not this filer's D&A.
#   TSLA   Its line is tsla:DepreciationAmortizationAndImpairment, and the filing reports no
#       material long-lived-asset or goodwill impairments - so the residual is amortization and
#       other depreciation, not impairment. Depreciation alone runs -18% to -35% low in every
#       year, and FY2021, the one year it also tags intangible amortization, is still -32.6%:
#       us-gaap:Depreciation is not even Tesla's whole depreciation.
#
# Both components are REQUIRED for every year an approved filer displays. An earlier version made
# amortization optional on the strength of Alphabet's exact match against its depreciation line;
# that was wrong twice over - the match was against one line rather than against Alphabet's D&A,
# and "optional" is arithmetically identical to assuming zero for any filer that simply does not
# tag the concept, which is the silent substitution CLAUDE.md's validation principle exists to
# prevent.
_DA_COMPONENT_VERIFIED_FILERS = {
    789019: "MSFT",
    50863: "INTC",
}

_DA_COMPONENT_DEPRECIATION_TAGS = ["Depreciation"]
_DA_COMPONENT_AMORTIZATION_TAGS = ["AmortizationOfIntangibleAssets"]

# Deliberately NOT components, each rejected against real facts in the same basket rather than
# on the name alone. A tag-name pattern over /depreciat|amorti/ matches every one of these:
#
#   FinanceLeaseRightOfUseAssetAmortization - real amortization, but adding it double-counts:
#     Microsoft's two components already sit within ~1% of its filed line, and adding its 5,403
#     of finance-lease amortization would overshoot that line by 15%.
#   AmortizationOfFinancingCosts, DebtInstrumentUnamortizedDiscount* - financing cost, not D&A
#     (Tesla reports the former).
#   AvailableForSaleSecurities*AmortizedCost* - a securities carrying basis, not an expense.
#   FiniteLivedIntangibleAssetsAmortizationExpenseYear{Two..Five}, *NextTwelveMonths,
#     *AfterYearFive - forward-looking disclosure of amortization not yet incurred (Alphabet and
#     Microsoft both report these).
#   OtherComprehensiveIncomeDefinedBenefitPlansNetUnamortizedGainLossArisingDuringPeriodNetOfTax
#     - an OCI pension movement that matches only on the word "unamortized" (Intel reports it).
#   DepreciationNonproduction - explicitly the non-production portion only, so for a
#     manufacturer it silently omits the depreciation sitting in cost of sales.

# Two genuinely equivalent names for the same cash-flow line. Verified against the real
# company facts of a seventeen-ticker basket: PepsiCo, Home Depot, NVIDIA, Amazon, Ford and
# AT&T report no PaymentsToAcquirePropertyPlantAndEquipment fact at all, and all six report
# PaymentsToAcquireProductiveAssets for every one of their five most recent annual periods.
#
# Deliberately NOT added, despite matching a "PaymentsToAcquire*" pattern and appearing at full
# coverage on the same filers: PaymentsForRepurchaseOfCommonStock, PaymentsToAcquireBusinesses*
# and PaymentsToAcquireMarketableSecurities. None of them is capital expenditure, and a
# pattern-based fallback chain would silently absorb all three.
_CAPEX_TAGS = [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
]
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


def _da_component_summation_is_verified(company_facts):
    """Whether this filer is one whose component sum has been reconciled against its own filed
    statements and deliberately approved (see _DA_COMPONENT_VERIFIED_FILERS).

    Keyed on SEC's CIK rather than on the ticker: CIK is the filer's stable identifier and does
    not move with a ticker change, a re-listing, or a reorganization.
    """
    try:
        return int(company_facts.get("cik")) in _DA_COMPONENT_VERIFIED_FILERS
    except (TypeError, ValueError):
        return False


def _extract_depreciation_and_amortization(facts_by_tag, period_end, components_verified):
    """One combined D&A fact when the filer reports one; otherwise a sum of both components,
    but only for a filer in the verified map (see _DA_COMPONENT_VERIFIED_FILERS).

    The combined tag is preferred as a correctness rule, not a convenience. Measured across the
    basket, component summation does not reliably reproduce a filer's own combined figure where
    both exist: Ford's components come to 49% of its combined line and Amazon's to 65% (both
    report D&A this module does not decompose), while Home Depot's exceed it by 16%. Summing
    whenever components happen to be present would therefore replace thirteen exact figures with
    approximations, so components are consulted only for a period with no combined fact at all -
    which also makes double-counting structurally impossible rather than merely unlikely.

    Where the combined fact is absent and the filer is not in the verified map, this returns None
    and the caller falls back or refuses exactly as for any other unmappable field. Nothing here
    substitutes a partial figure for a complete one: a filer whose amortization is simply
    untagged would otherwise be served depreciation alone, which is arithmetically the same as
    assuming its amortization is zero.

    Resolution is per period. An approved filer missing a component in one period loses only that
    period - which matters because the caller requests one period more than it displays, purely
    to supply the prior-year balance sheet for a working-capital delta. A gap in that extra,
    never-displayed year must not erase D&A from the years the analyst actually sees.
    """
    combined = _select_component(facts_by_tag, _DA_TAGS, period_end, False, "USD")
    if combined is not None:
        return combined["value"], {"confidence": "direct", "components": [combined]}

    if not components_verified:
        return None, None

    depreciation = _select_component(facts_by_tag, _DA_COMPONENT_DEPRECIATION_TAGS, period_end, False, "USD")
    amortization = _select_component(facts_by_tag, _DA_COMPONENT_AMORTIZATION_TAGS, period_end, False, "USD")
    if depreciation is None or amortization is None:
        return None, None

    # "calculated" becomes "combined" in the exposed vocabulary (app/schemas/company.py): summed
    # from more than one fact, which is exactly what this is. Both tags are named in components.
    return depreciation["value"] + amortization["value"], {
        "confidence": "calculated",
        "components": [depreciation, amortization],
    }


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


# Period discovery anchors on the union of these tags rather than on EBIT alone.
#
# Anchoring on OperatingIncomeLoss by itself was a real, silent data-integrity defect, not a
# coverage gap: Johnson & Johnson stopped tagging OperatingIncomeLoss after FY2014 (its income
# statement runs gross profit straight to pre-tax earnings with no operating-income subtotal),
# so discovery walked back a decade and the app served FY2014 financials as J&J's latest
# period - with "reported" provenance, no warning, and every downstream figure derived from
# eleven-year-old data. The original docstring's claim that EBIT is "present for every company
# in the validation sample" was true of that three-company sample (Apple, Caterpillar, Walmart)
# and false in general.
#
# Revenue leads the union because it is the most universally reported annual concept; EBIT is
# retained so a filer that reports operating income but not a mapped revenue tag still resolves.
_PERIOD_ANCHOR_TAGS = _REVENUE_TAGS + _EBIT_TAGS

# Independent reference for the staleness guard below. NetIncomeLoss is not used for any mapped
# value - it is here only because it is near-universally tagged, so it can corroborate how
# recent a filer's data actually is without depending on the same tags the anchor uses.
_STALENESS_REFERENCE_TAGS = _PERIOD_ANCHOR_TAGS + ["NetIncomeLoss"]

# One fiscal year plus filing slack. A period end this far behind the newest annual period the
# filer actually reports is not "the latest year" by any reading - it means discovery failed to
# find the recent years, which is exactly the J&J failure. Deliberately generous: 52/53-week
# fiscal years drift by days, and a company that genuinely has not filed recently should not be
# punished for it, because the comparison is against its own newest fact rather than today.
_MAX_PERIOD_STALENESS_DAYS = 400


def _annual_ends_for_tags(facts_by_tag, tags):
    """Distinct fiscal-year-end dates with a confirmed annual (10-K, ~365-day) fact for any of
    `tags`, newest first. Duration-based, exercising the same annual-length filter every other
    concept is matched against."""
    ends = set()
    for tag in tags:
        tag_data = facts_by_tag.get(tag, {})
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
    return sorted(ends, reverse=True)


def _annual_period_ends(facts_by_tag, max_periods):
    """Annual fiscal-year-end dates to map, most recent first.

    Two guards, in order:

    1. Discovery anchors on the union of _PERIOD_ANCHOR_TAGS, so no single tag's absence can
       silently rewind a company's history (see the comment above).
    2. Any candidate materially older than the newest period the filer reports at all is
       dropped rather than returned. This is a backstop, not the primary fix: with the union
       anchor it should never fire, and it exists so that a future tag change cannot reintroduce
       silent staleness. Dropping is deliberate over warning - a stale period is not an unusual
       assumption the analyst can weigh, it is the wrong year's data, and every figure derived
       from it would be wrong in a way no downstream warning could repair. If that leaves
       nothing, the caller sees no SEC periods and falls back exactly as for any other filer
       this module cannot map.
    """
    candidates = _annual_ends_for_tags(facts_by_tag, _PERIOD_ANCHOR_TAGS)
    if not candidates:
        return []

    # Guard 1 - wholesale staleness. If the newest period the anchors can find is itself far
    # behind the newest annual period this filer reports at all, discovery has failed: return
    # nothing rather than a confident-looking set of old figures.
    reference = _annual_ends_for_tags(facts_by_tag, _STALENESS_REFERENCE_TAGS)
    if reference and _duration_days(candidates[0], reference[0]) > _MAX_PERIOD_STALENESS_DAYS:
        return []

    # Guard 2 - contiguity. Ordinary history is a run of consecutive fiscal years, each about a
    # year apart; a decade-wide gap between one candidate and the next means the older side
    # belongs to a tag that stopped being reported, not to this company's recent history. Stop
    # at the gap rather than filtering each period against the newest, which would discard the
    # legitimate multi-year history every one of these charts and statistics is built from.
    current = [candidates[0]]
    for end in candidates[1:]:
        if _duration_days(end, current[-1]) > _MAX_PERIOD_STALENESS_DAYS:
            break
        current.append(end)
    return current[:max_periods]


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
    da_components_verified = _da_component_summation_is_verified(company_facts)

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

        da_value, da_prov = _extract_depreciation_and_amortization(
            facts_by_tag, period_end, da_components_verified
        )
        values["depreciation_and_amortization"] = da_value
        if da_prov:
            provenance["depreciation_and_amortization"] = da_prov

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
