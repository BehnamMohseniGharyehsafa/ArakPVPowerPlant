"""Download and quality-check the original public Arak dataset."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.weather import load_weather

if __name__ == "__main__":
    import json

    weather = load_weather()
    print(
        json.dumps(
            {
                "station": weather.metadata,
                "quality": weather.quality,
                "provenance": weather.provenance,
            },
            indent=2,
        )
    )
