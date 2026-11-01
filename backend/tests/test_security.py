from fastapi.testclient import TestClient
from backend.app.config import Scenario
from backend.app import main, security


def test_public_sessions_are_isolated_and_cross_origin_writes_rejected(
    monkeypatch, tmp_path, reference
):
    monkeypatch.setattr(main, "PUBLIC", True)
    monkeypatch.setattr(security, "PUBLIC", True)
    monkeypatch.setattr(main, "DATA", tmp_path)
    monkeypatch.setattr(security, "DATA", tmp_path)
    security.LIMITS.clear()
    first, second = TestClient(main.app), TestClient(main.app)
    first.get("/api/bootstrap")
    second.get("/api/bootstrap")
    sid = first.cookies.get(security.COOKIE).split(".")[0]
    scenario = Scenario(id="private-browser-case", name="Browser one scenario")
    assert (
        first.put(
            "/api/scenarios/private-browser-case", json=scenario.model_dump()
        ).status_code
        == 403
    )
    headers = {"X-Solar-Client": "1"}
    assert (
        first.put(
            "/api/scenarios/private-browser-case",
            json=scenario.model_dump(),
            headers={**headers, "Origin": "https://untrusted.example"},
        ).status_code
        == 403
    )
    assert (
        first.put(
            "/api/scenarios/private-browser-case",
            json=scenario.model_dump(),
            headers=headers,
        ).status_code
        == 200
    )
    assert any(
        s["id"] == "private-browser-case"
        for s in first.get("/api/bootstrap").json()["scenarios"]
    )
    assert all(
        s["id"] != "private-browser-case"
        for s in second.get("/api/bootstrap").json()["scenarios"]
    )
    main.runs[(sid, reference.id)] = reference
    assert first.get("/api/runs/" + reference.id).status_code == 200
    assert second.get("/api/runs/" + reference.id).status_code == 404
    main.jobs["isolated-test-job"] = {"owner": sid, "status": "complete", "created": 0}
    assert second.get("/api/jobs/isolated-test-job").status_code == 404
    response = first.get("/api/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert "object-src 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers["Cache-Control"] == "no-store"


def test_signed_session_cookie_cannot_be_forged():
    token = security.sign("a" * 32)
    assert security.read_session(token) == "a" * 32
    assert (
        security.read_session(token[:-1] + ("0" if token[-1] != "0" else "1"))
        != "a" * 32
    )
