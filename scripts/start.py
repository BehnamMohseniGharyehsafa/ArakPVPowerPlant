"""Single-command installation, build and local startup on Windows or Linux."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]


def execute(args, cwd=ROOT):
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-install", action="store_true")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if sys.version_info < (3, 12):
        parser.error("Python 3.12 or newer is required")
    envdir = ROOT / ".venv"
    python = envdir / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        venv.create(envdir, with_pip=True)
    if not args.skip_install:
        execute([python, "-m", "pip", "install", "-r", "requirements.lock"])
        execute([python, "-m", "pip", "install", "--no-deps", "-e", "."])
        npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
        if npm is None:
            raise SystemExit(
                "Install Node.js 22+ (including npm), then rerun this command"
            )
        execute([npm, "ci", "--no-audit", "--no-fund"], ROOT / "frontend")
        execute([npm, "run", "build"], ROOT / "frontend")
    if not (ROOT / "frontend/dist/index.html").exists():
        raise SystemExit("Frontend build missing. Run without --skip-install.")
    execute([python, "scripts/download_weather.py"])
    print(f"\nOpen http://127.0.0.1:{args.port} — press Ctrl+C to stop.\n", flush=True)
    try:
        execute(
            [
                python,
                "-m",
                "uvicorn",
                "backend.app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                args.port,
            ]
        )
    except KeyboardInterrupt:
        print("Stopped.")


if __name__ == "__main__":
    main()
