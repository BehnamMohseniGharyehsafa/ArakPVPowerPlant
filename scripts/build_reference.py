"""Bake public, non-private TMY reference outputs into a deployment image."""

import sys
from pathlib import Path
import json
import joblib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.config import Scenario
from backend.app.engine import simulate
from backend.app.weather import DATA

if __name__ == "__main__":
    run = simulate(Scenario())
    folder = DATA / "public"
    folder.mkdir(parents=True, exist_ok=True)
    joblib.dump(run, folder / "reference.joblib", compress=3)
    (folder / "reference.json").write_text(
        json.dumps({"run_id": run.id, "scenario": run.scenario.model_dump()}),
        encoding="utf-8",
    )
    print("Verified public reference:", run.id, run.summary["annual_energy_kwh"], "kWh")
