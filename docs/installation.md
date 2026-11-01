# Installation and operation

## Requirements

Use Python 3.13 and Node.js 22 or newer with npm 10.5.1+. The Python project accepts compatible Python 3.12+ through dependency resolution, but the supplied exact lock was exercised on Python 3.13. WebGL2 is desirable; the 2D string/module map works when WebGL is unavailable. A modern Chromium-based browser is recommended for the large interactive field.

## One command

From the repository root, `python scripts/start.py` installs a project-local virtual environment, installs pinned Python packages, installs frontend dependencies, builds the frontend and validates the downloaded EPW before starting FastAPI on `127.0.0.1:8000`. This can take several minutes on first use. It does not require a weather API key. Use `--port 8080` for a different local port.

## Manual Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m pip install --no-deps -e .
npm --prefix frontend ci
npm --prefix frontend run build
.\.venv\Scripts\python.exe scripts\download_weather.py
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Activation is optional when using the explicit Python path. If PowerShell prevents `npm.ps1` execution, use `npm.cmd` with the same arguments; no execution-policy change is necessary.

## Manual Linux

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pip install --no-deps -e .
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python scripts/download_weather.py
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

## Development

Run the API with `--reload`. In another terminal, run `npm --prefix frontend run dev` and open the URL printed by Vite, normally `http://127.0.0.1:5173`. Vite proxies `/api` to port 8000. API-only work does not need a frontend build. Production serves `frontend/dist` from FastAPI; restart the API after the first frontend build so it mounts static assets.

## Docker

`docker compose up --build` builds the Node frontend and Python runtime and exposes the service on loopback port 8000. The runtime uses a non-root user, with `SOLAR_DATA_DIR=/data`. The named data volume retains the original weather, provenance, cached geometry, scenario JSON and simulation runs. Containers require outbound access for the initial weather download. Docker execution was not available in the development host, so the recipe is provided without a local Docker validation claim.

## Tests

Run `.venv/Scripts/python.exe -m pytest -q` on Windows or `.venv/bin/python -m pytest -q` on Linux. `npm --prefix frontend test` runs component tests, and `npm --prefix frontend run build` checks TypeScript and compiles production assets. Keep the API on port 8000 for `npm --prefix frontend run test:e2e`.

Windows browser tests use installed Microsoft Edge at its conventional path. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to another Chromium executable if needed. Linux uses `npx playwright install --with-deps chromium` from `frontend`. Browser tests use actual API outputs and do not mock the physical engine.

## Data and troubleshooting

`SOLAR_DATA_DIR` changes the local data root; its default is repository `data`. Weather lives in `cache/arak`, uploads in checksum-derived directories, runs in `runs`, scenarios in `scenarios`. First-use download failures appear as explicit errors; check network access and retry. Bad EPW input fails the quality gate instead of silently inventing values. A port-in-use error can be resolved with `--port` on the startup script. Imported scenarios must keep unique fault IDs and equipment targets inside the selected topology.

Large equipment CSV exports can be substantial; choose a single equipment index or date range. Cancellation is cooperative: annual simulations check phase boundaries, Monte Carlo checks between physical samples, and cleaning/diagnostic cancellation completes the active numerical operation before discarding the result.
