"""Route-level tests for the DCF API surface (/api/dcf/*).

These exercise the FastAPI routing, request validation, and response
serialization layer - the thing backend/tests/test_dcf.py never touches, since
those tests call the calculation/schema functions directly. Deliberately not
re-proving the math here (that's test_dcf.py's job): each case below is about
whether the HTTP layer wires it up correctly, not whether the number is right.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID_PAYLOAD = {
    "base_year_fcf": 100_000_000,
    "fcf_growth_rate": 0.05,
    "forecast_years": 5,
    "wacc": 0.10,
    "terminal_growth_rate": 0.02,
    "net_debt": 200_000_000,
    "diluted_shares_outstanding": 100_000_000,
}


def test_valuation_route_returns_200_with_expected_shape():
    res = client.post("/api/dcf/valuation", json=VALID_PAYLOAD)
    assert res.status_code == 200
    body = res.json()
    assert set(body.keys()) == {
        "forecast",
        "terminal_value",
        "pv_terminal_value",
        "enterprise_value",
        "equity_value",
        "value_per_share",
        "terminal_growth_warnings",
        "fcf_growth_warnings",
    }
    assert isinstance(body["value_per_share"], float)
    assert isinstance(body["forecast"], list)
    assert len(body["forecast"]) == VALID_PAYLOAD["forecast_years"]
    # Comfortable base case (8pp WACC/terminal-growth spread, 5% FCF growth) - no warnings.
    assert body["terminal_growth_warnings"] == []
    assert body["fcf_growth_warnings"] == []


def test_valuation_route_serializes_terminal_growth_warnings():
    # 1.5pp spread -> "high" tier, per the tiers hand-verified in test_dcf.py.
    payload = {**VALID_PAYLOAD, "terminal_growth_rate": 0.085}
    res = client.post("/api/dcf/valuation", json=payload)
    assert res.status_code == 200
    warnings = res.json()["terminal_growth_warnings"]
    assert len(warnings) == 1
    assert warnings[0]["id"] == "narrow_wacc_terminal_growth_spread"
    assert warnings[0]["tier"] == "high"
    assert isinstance(warnings[0]["explanation"], str) and warnings[0]["explanation"]


def test_valuation_route_rejects_wacc_at_or_below_terminal_growth():
    payload = {**VALID_PAYLOAD, "wacc": 0.05, "terminal_growth_rate": 0.05}
    res = client.post("/api/dcf/valuation", json=payload)
    assert res.status_code == 422
    assert "WACC must be greater than the terminal growth rate" in res.text


def test_valuation_route_rejects_missing_required_field():
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "wacc"}
    res = client.post("/api/dcf/valuation", json=payload)
    assert res.status_code == 422


def test_valuation_route_rejects_wrong_field_type():
    payload = {**VALID_PAYLOAD, "base_year_fcf": "not-a-number"}
    res = client.post("/api/dcf/valuation", json=payload)
    assert res.status_code == 422


def test_valuation_route_accepts_fcf_growth_rate_below_negative_100_percent_with_warning():
    # Computationally well-defined, so not rejected - flagged with a warning instead.
    payload = {**VALID_PAYLOAD, "fcf_growth_rate": -1.5}
    res = client.post("/api/dcf/valuation", json=payload)
    assert res.status_code == 200
    warnings = res.json()["fcf_growth_warnings"]
    assert len(warnings) == 1
    assert warnings[0]["id"] == "alternating_sign_explicit_period_fcf"


def test_valuation_route_serializes_fcf_growth_warnings():
    payload = {**VALID_PAYLOAD, "fcf_growth_rate": -1.0}
    res = client.post("/api/dcf/valuation", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert all(year["fcf"] == 0.0 for year in body["forecast"])
    warnings = body["fcf_growth_warnings"]
    assert len(warnings) == 1
    assert warnings[0]["id"] == "zero_explicit_period_fcf"
    assert warnings[0]["tier"] == "extreme"


def test_valuation_route_no_longer_caps_fcf_growth_rate_upper_bound():
    payload = {**VALID_PAYLOAD, "fcf_growth_rate": 50.0}
    res = client.post("/api/dcf/valuation", json=payload)
    assert res.status_code == 200


def test_valuation_route_returns_422_not_500_on_overflow():
    # A raw, uncaught OverflowError would otherwise surface as an unhandled 500 - this is
    # the actual failure mode the router's typed-exception handling exists to prevent.
    payload = {**VALID_PAYLOAD, "base_year_fcf": 1e307, "forecast_years": 15}
    res = client.post("/api/dcf/valuation", json=payload)
    assert res.status_code == 422
    assert "can't be computed safely" in res.text


def test_valuation_route_only_accepts_post():
    res = client.get("/api/dcf/valuation")
    assert res.status_code == 405


def test_sensitivity_route_returns_200_with_five_by_five_shape():
    res = client.post("/api/dcf/sensitivity", json=VALID_PAYLOAD)
    assert res.status_code == 200
    body = res.json()
    assert len(body["terminal_growth_rates"]) == 5
    assert len(body["rows"]) == 5
    assert all(
        len(row["value_per_share_by_growth"]) == len(body["terminal_growth_rates"])
        for row in body["rows"]
    )


def test_sensitivity_route_serializes_invalid_cells_as_json_null():
    # Narrow 6.5%/5.5% base spread pushes some grid cells to WACC <= growth,
    # same case already hand-verified at the calculation layer in test_dcf.py.
    payload = {**VALID_PAYLOAD, "wacc": 0.065, "terminal_growth_rate": 0.055}
    res = client.post("/api/dcf/sensitivity", json=payload)
    assert res.status_code == 200
    rows = res.json()["rows"]
    flattened = [v for row in rows for v in row["value_per_share_by_growth"]]
    assert None in flattened


def test_sensitivity_route_returns_422_when_base_case_overflows():
    payload = {**VALID_PAYLOAD, "base_year_fcf": 1e307, "forecast_years": 15}
    res = client.post("/api/dcf/sensitivity", json=payload)
    assert res.status_code == 422
    assert "can't be computed safely" in res.text
