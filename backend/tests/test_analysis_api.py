import csv
import io
import numpy as np
import pytest
from fastapi.testclient import TestClient
from backend.app.analysis import finance, optimise_cleaning, uncertainty, diagnostics
from backend.app.engine import delivered_for_soiling, soil_profile, simulate
from backend.app.config import Scenario, Fault
from backend.app.exports import results_csv, equipment_csv, bundle, report_html
from backend.app.main import app, runs


def test_finance_and_exports(reference):
    result = finance(reference)
    flows = result["cashflows"]
    hand_npv = sum(
        x["cash"] / (1 + reference.scenario.finance.discount_rate) ** x["year"]
        for x in flows
    )
    assert result["npv"] == pytest.approx(hand_npv)
    assert result["lcoe_per_kwh"] > 0
    rows = list(csv.DictReader(io.StringIO(results_csv(reference))))
    assert len(rows) == 8760
    assert sum(float(x["ac_energy_kwh"]) for x in rows) == pytest.approx(
        reference.summary["annual_energy_kwh"]
    )
    equip = list(
        csv.DictReader(
            io.StringIO(equipment_csv(reference, "inverter", start=4000, end=4001))
        )
    )
    assert len(equip) == 20
    assert sum(float(x["delivered_ac_energy_kwh"]) for x in equip) == pytest.approx(
        reference.frame.ac_power_kw.iloc[4000]
    )
    assert "not measured historical" in report_html(reference, {})


def test_pdf_report_is_readable_and_run_linked(reference):
    from pypdf import PdfReader
    from backend.app.reports import report_pdf

    content = report_pdf(reference, {})
    reader = PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() for page in reader.pages)
    assert len(reader.pages) >= 5
    assert reference.id in text
    assert f"{reference.summary['annual_energy_kwh']/1000:,.2f} MWh" in text
    assert "not historical plant measurements" in text
    assert "No P50/P90 result is inferred" in text


def test_cleaning_optimisation(reference):
    result = optimise_cleaning(reference, min_interval=30, max_operations=6)
    best = result["strategies"][-1]
    assert best["net_benefit"] >= -1e-7
    assert len(best["cleaning_days"]) <= 6
    assert all(
        b - a >= 30 for a, b in zip(best["cleaning_days"], best["cleaning_days"][1:])
    )
    fixed = result["strategies"][1]
    if fixed["operations"] <= 6:
        assert best["net_benefit"] >= fixed["net_benefit"] - 0.01
    soil = soil_profile(reference.scenario, reference.weather)
    np.testing.assert_allclose(
        delivered_for_soiling(reference, soil), reference.frame.ac_power_kw, atol=1e-8
    )


def test_uncertainty_reproducible(reference):
    a = uncertainty(reference, 5, {"resource": 0.02})
    b = uncertainty(reference, 5, {"resource": 0.02})
    assert a == b
    assert a["p90_energy_kwh"] <= a["p50_energy_kwh"]


def test_api(reference):
    runs[reference.id] = reference
    client = TestClient(app)
    assert client.get("/api/health").status_code == 200
    info = client.get(f"/api/runs/{reference.id}").json()
    assert info["summary"]["module_count"] == 4160
    assert (
        client.get(f"/api/runs/{reference.id}/equipment?hour=8760").status_code == 422
    )
    assert (
        client.get(f"/api/runs/{reference.id}/series?start=10&end=5").status_code == 422
    )
    assert (
        client.get(f"/api/runs/{reference.id}/export?start=0&end=24").text.count("\n")
        == 25
    )
    assert client.get(f"/api/runs/{reference.id}/report").status_code == 200
    assert (
        client.post("/api/runs", json={"plant": {"row_pitch_m": 1}}).status_code == 422
    )
