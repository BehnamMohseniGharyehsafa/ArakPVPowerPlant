"""Package publishable source without environments, caches, generated data or Git internals."""

from pathlib import Path
import os
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
destination = ROOT / "outputs/solar-field-twin-source.zip"
excluded = {
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    "dist",
    "cache",
    "data",
    "runs",
    "scenarios",
    "outputs",
    "output",
    "tmp",
    "test-results",
    "playwright-report",
    "demo-frames",
    ".openai",
}
destination.parent.mkdir(exist_ok=True)
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for directory, folders, names in os.walk(ROOT):
        folders[:] = sorted(name for name in folders if name not in excluded)
        for name in sorted(names):
            path = Path(directory) / name
            if path.suffix in {".pyc", ".log", ".tsbuildinfo"} or path.name.startswith(
                ".env"
            ):
                continue
            archive.write(path, Path("solar-field-twin") / path.relative_to(ROOT))
print(destination)
