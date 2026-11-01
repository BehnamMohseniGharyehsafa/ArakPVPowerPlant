"""Reproduce an annual run and export actual timestep results without a browser."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.config import Scenario
from backend.app.engine import simulate
from backend.app.exports import results_csv, bundle
from backend.app.analysis import (
    finance,
    diagnostics,
    optimise_cleaning,
    uncertainty,
    UNCERTAINTY_DEFAULTS,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--output", type=Path, default=Path("outputs/reference"))
    parser.add_argument(
        "--analyses",
        action="store_true",
        help="Include diagnostics, cleaning and a 20-sample uncertainty demonstration",
    )
    args = parser.parse_args()
    scenario = (
        Scenario.model_validate_json(args.config.read_text(encoding="utf-8"))
        if args.config
        else Scenario()
    )
    run = simulate(scenario)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "plant_hourly.csv").write_text(results_csv(run), encoding="utf-8")
    (args.output / "metadata.json").write_text(
        json.dumps(run.metadata, indent=2), encoding="utf-8"
    )
    (args.output / "summary.json").write_text(
        json.dumps(run.summary, indent=2), encoding="utf-8"
    )
    analyses = {}
    if args.analyses:
        analyses = {
            "diagnostics": diagnostics(run),
            "cleaning": optimise_cleaning(run),
            "uncertainty": uncertainty(run, 20, UNCERTAINTY_DEFAULTS),
        }
    (args.output / "complete_results.zip").write_bytes(bundle(run, analyses))
    print(
        json.dumps(
            {
                "run_id": run.id,
                "annual_energy_mwh": run.summary["annual_energy_kwh"] / 1000,
                "performance_ratio": run.summary["performance_ratio"],
                "max_hourly_accounting_residual_kwh": run.summary[
                    "max_accounting_residual_kwh"
                ],
                "output": str(args.output.resolve()),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
