"""Generate a complete printable report and optional independent analysis outputs."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.config import Scenario
from backend.app.engine import simulate
from backend.app.exports import report_html
from backend.app.reports import report_pdf
from backend.app.analysis import (
    diagnostics,
    optimise_cleaning,
    uncertainty,
    UNCERTAINTY_DEFAULTS,
)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--output", type=Path, default=Path("outputs/report.html"))
    parser.add_argument("--samples", type=int, default=20)
    args = parser.parse_args()
    if not 5 <= args.samples <= 200:
        parser.error("samples must be 5–200")
    s = (
        Scenario.model_validate_json(args.config.read_text(encoding="utf-8"))
        if args.config
        else Scenario()
    )
    run = simulate(s)
    analyses = {
        "diagnostics": diagnostics(run),
        "cleaning": optimise_cleaning(run),
        "uncertainty": uncertainty(run, args.samples, UNCERTAINTY_DEFAULTS),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.suffix.lower() == ".pdf":
        args.output.write_bytes(report_pdf(run, analyses))
    else:
        args.output.write_text(report_html(run, analyses), encoding="utf-8")
    print(args.output.resolve())
