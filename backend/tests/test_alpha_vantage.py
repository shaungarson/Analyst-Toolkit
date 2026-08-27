import pytest

from app.services import alpha_vantage


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
