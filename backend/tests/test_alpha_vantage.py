import pytest

from app.services import alpha_vantage
from app.services.alpha_vantage import RateLimitedError


def test_throttle_enforces_minimum_spacing_between_requests(monkeypatch):
    # A single "Load Company" call fires several sequential Alpha Vantage requests; the
    # free tier enforces roughly 1 request/second, so consecutive calls must be paced -
    # confirmed as a real, live issue (not hypothetical) when the first real-key test
    # tripped Alpha Vantage's own per-second rate-limit notice.
    # time.monotonic() is relative to an arbitrary reference point (typically process/system
    # start), never actually 0.0 in real usage - starting the fake clock well above 0 (and
    # above the sentinel _last_request_at default of 0.0) mirrors real behavior, where the
    # very first request of a process is never throttled against that default.
    clock = {"now": 1_000.0}
    sleeps = []

    monkeypatch.setattr(alpha_vantage.time, "monotonic", lambda: clock["now"])
    monkeypatch.setattr(alpha_vantage.time, "sleep", lambda seconds: sleeps.append(seconds))
    monkeypatch.setattr(alpha_vantage, "_last_request_at", 0.0)

    alpha_vantage._throttle()  # first call: enough time has already "passed" since the sentinel
    assert sleeps == []

    clock["now"] += 0.3  # next request fires well within the throttle window
    alpha_vantage._throttle()
    assert sleeps == pytest.approx([alpha_vantage._MIN_SECONDS_BETWEEN_REQUESTS - 0.3])

    sleeps.clear()
    clock["now"] += alpha_vantage._MIN_SECONDS_BETWEEN_REQUESTS + 5  # plenty of time has passed
    alpha_vantage._throttle()
    assert sleeps == []


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def test_rate_limit_message_never_includes_the_raw_api_key(monkeypatch):
    # Confirmed live against the real API: Alpha Vantage's own rate-limit response echoes
    # the caller's API key back in plain text ("We have detected your API key as ...").
    # This app is public and the key is shared across every user, so that raw text must
    # never reach an API response - it's sanitized to a generic message instead.
    fake_key = "SUPER-SECRET-FAKE-KEY-123"
    monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", fake_key)
    monkeypatch.setattr(alpha_vantage, "_throttle", lambda: None)
    monkeypatch.setattr(
        alpha_vantage.httpx,
        "get",
        lambda *args, **kwargs: _FakeResponse(
            {"Information": f"We have detected your API key as {fake_key} and our standard rate limit is 25/day."}
        ),
    )

    with pytest.raises(RateLimitedError) as exc_info:
        alpha_vantage._request({"function": "OVERVIEW", "symbol": "TEST"})

    assert fake_key not in str(exc_info.value)
