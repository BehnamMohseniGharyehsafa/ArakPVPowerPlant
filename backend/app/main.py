"""FastAPI transport; scientific functions remain independently executable."""

from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
import io
import json
import threading
import uuid
import zipfile
import os
import contextvars
import time

from fastapi import FastAPI, HTTPException, UploadFile, Query
from fastapi.responses import Response, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import joblib
import numpy as np

from .config import Scenario, presets, MODEL_VERSION
from .weather import DATA, ROOT, load_weather, store_upload, SOURCE_URL, MAX_FILE_BYTES
from .engine import Run, simulate, equipment_snapshot, CancelledRun
from .analysis import (
    finance,
    diagnostics,
    optimise_cleaning,
    uncertainty,
    UNCERTAINTY_DEFAULTS,
)
from .exports import results_csv, equipment_csv, bundle, report_html
from .reports import report_pdf
from .security import SecurityBoundary, SESSION, PUBLIC, session_root, cache_key
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.gzip import GZipMiddleware

executor = ThreadPoolExecutor(
    max_workers=int(os.getenv("SOLAR_WORKERS", "1" if PUBLIC else "2")),
    thread_name_prefix="solar",
)
jobs: dict[str, dict] = {}
runs: OrderedDict[str, Run] = OrderedDict()
analyses: dict[str, dict] = {}
lock = threading.RLock()


@asynccontextmanager
async def lifespan(app):
    yield
    executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(
    title="Solar Field Twin",
    version=MODEL_VERSION,
    lifespan=lifespan,
    docs_url=None if PUBLIC else "/docs",
    redoc_url=None if PUBLIC else "/redoc",
    openapi_url=None if PUBLIC else "/openapi.json",
)
app.add_middleware(SecurityBoundary)
app.add_middleware(GZipMiddleware, minimum_size=1500)
if PUBLIC:
    hosts = [
        "127.0.0.1",
        "localhost",
        "testserver",
        "behnamproject-arakpvpowerplant.onrender.com",
    ]
    if os.getenv("RENDER_EXTERNAL_HOSTNAME"):
        hosts.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)


def owned_job(job_id):
    if job_id not in jobs or jobs[job_id].get("owner", "local") != SESSION.get():
        raise HTTPException(404, "Job not found")
    return jobs[job_id]


def public_reference():
    manifest = DATA / "public" / "reference.json"
    if not manifest.exists():
        return None
    return json.loads(manifest.read_text(encoding="utf-8"))


@app.exception_handler(ValueError)
async def value_error_handler(request, error):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=422, content={"detail": str(error)})


def get_run(run_id: str) -> Run:
    if not run_id.isalnum() or len(run_id) != 24:
        raise HTTPException(404, "Run not found")
    with lock:
        key = cache_key(run_id)
        if key in runs:
            runs.move_to_end(key)
            return runs[key]
        path = session_root() / "runs" / f"{run_id}.joblib"
        ref = public_reference()
        if not path.exists() and ref and ref["run_id"] == run_id:
            path = DATA / "public" / "reference.joblib"
        if not path.exists():
            raise HTTPException(404, "Run not found; run the scenario first")
        run = joblib.load(path)
        runs[key] = run
        while len(runs) > int(os.getenv("SOLAR_MEMORY_RUNS", "1" if PUBLIC else "3")):
            runs.popitem(last=False)
        return run


def run_analyses(run_id: str) -> dict:
    key = cache_key(run_id)
    if key not in analyses:
        path = session_root() / "runs" / f"{run_id}-analysis.json"
        analyses[key] = (
            json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        )
    return analyses[key]


def submit(kind: str, callback) -> dict:
    with lock:
        for key in list(jobs):
            if (
                jobs[key]["status"] not in {"running", "queued"}
                and time.time() - jobs[key].get("created", 0) > 3600
            ):
                jobs.pop(key)
        if PUBLIC and any(
            j.get("owner") == SESSION.get() and j["status"] in {"queued", "running"}
            for j in jobs.values()
        ):
            raise HTTPException(429, "This browser already has an active calculation")
        if sum(j["status"] in {"queued", "running"} for j in jobs.values()) >= 4:
            raise HTTPException(
                429, "Calculation queue is full; wait for a running job"
            )
        id = uuid.uuid4().hex
        stop = threading.Event()
        jobs[id] = {
            "id": id,
            "kind": kind,
            "status": "queued",
            "progress": 0,
            "message": "Queued",
            "cancel": stop,
            "owner": SESSION.get(),
            "created": time.time(),
        }

    def work():
        def update(value, message):
            with lock:
                jobs[id].update(progress=value, message=message)

        try:
            jobs[id]["status"] = "running"
            result = callback(update, stop)
            if stop.is_set():
                raise CancelledRun("Cancelled")
            jobs[id].update(
                status="complete", progress=100, message="Complete", result=result
            )
        except CancelledRun:
            jobs[id].update(status="cancelled", message="Cancelled")
        except Exception as error:
            jobs[id].update(status="failed", message=str(error))

    executor.submit(contextvars.copy_context().run, work)
    return {"job_id": id}


@app.get("/api/health")
def health():
    return {"status": "ok", "model_version": MODEL_VERSION}


@app.get("/api/bootstrap")
def bootstrap():
    scenarios = {s.id: s for s in presets()}
    folder = session_root() / "scenarios"
    if folder.exists():
        for path in folder.glob("*.json"):
            try:
                s = Scenario.model_validate_json(path.read_text(encoding="utf-8"))
                scenarios[s.id] = s
            except ValueError:
                continue
    w = load_weather()
    return {
        "scenarios": [s.model_dump() for s in scenarios.values()],
        "weather": {
            "station": w.metadata,
            "quality": w.quality,
            "provenance": w.provenance,
        },
        "model_version": MODEL_VERSION,
        "uncertainty_defaults": UNCERTAINTY_DEFAULTS,
        "hosting": {
            "public": PUBLIC,
            "storage": (
                "Temporary, isolated browser session; download outputs before leaving"
                if PUBLIC
                else "Local disk"
            ),
            "reference_run_id": (public_reference() or {}).get("run_id"),
        },
    }


@app.post("/api/weather/upload")
async def upload(file: UploadFile):
    content = await file.read(MAX_FILE_BYTES + 1)
    weather_id = store_upload(content)
    if PUBLIC:
        folder = session_root() / "weather"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / weather_id).touch()
    w = load_weather(weather_id)
    return {
        "weather_id": weather_id,
        "station": w.metadata,
        "quality": w.quality,
        "provenance": w.provenance,
    }


@app.put("/api/scenarios/{scenario_id}")
def save_scenario(scenario_id: str, scenario: Scenario):
    if scenario_id != scenario.id:
        raise HTTPException(422, "Scenario path and payload identifiers must match")
    if (
        PUBLIC
        and scenario.weather_id != "arak"
        and not (session_root() / "weather" / scenario.weather_id).exists()
    ):
        raise HTTPException(404, "Weather file does not belong to this browser session")
    folder = session_root() / "scenarios"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{scenario.id}.json"
    temporary = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    temporary.write_text(scenario.model_dump_json(indent=2), encoding="utf-8")
    temporary.replace(path)
    return scenario.model_dump()


@app.post("/api/runs")
def start_run(scenario: Scenario):
    if (
        PUBLIC
        and scenario.plant.inverter_count * scenario.plant.strings_per_inverter > 160
    ):
        raise HTTPException(
            422,
            "Free online runs support up to 160 strings; use the local application for larger studies",
        )
    if (
        PUBLIC
        and scenario.weather_id != "arak"
        and not (session_root() / "weather" / scenario.weather_id).exists()
    ):
        raise HTTPException(404, "Weather file does not belong to this browser session")

    def work(progress, stop):
        ref = public_reference()
        if (
            ref
            and Scenario.model_validate(scenario.model_dump()).model_dump()
            == ref["scenario"]
        ):
            run = get_run(ref["run_id"])
            progress(100, "Loaded verified reference simulation")
            return {"run_id": run.id, "summary": run.summary}
        run = simulate(scenario, progress=progress, cancelled=stop)
        folder = session_root() / "runs"
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{run.id}.joblib"
        temporary = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
        joblib.dump(run, temporary, compress=3)
        temporary.replace(path)
        with lock:
            runs[cache_key(run.id)] = run
            while len(runs) > int(
                os.getenv("SOLAR_MEMORY_RUNS", "1" if PUBLIC else "3")
            ):
                runs.popitem(last=False)
        return {"run_id": run.id, "summary": run.summary}

    return submit("simulation", work)


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    return {k: v for k, v in owned_job(job_id).items() if k not in {"cancel", "owner"}}


@app.delete("/api/jobs/{job_id}")
def cancel_job(job_id: str):
    owned_job(job_id)["cancel"].set()
    return {"status": "cancellation_requested"}


@app.get("/api/runs/{run_id}")
def run_info(run_id: str):
    run = get_run(run_id)
    return {
        "run_id": run.id,
        "summary": run.summary,
        "metadata": run.metadata,
        "finance": finance(run),
        "analyses": run_analyses(run_id),
    }


@app.get("/api/runs/{run_id}/series")
def series(
    run_id: str,
    start: int = Query(0, ge=0, le=8759),
    end: int = Query(8760, ge=1, le=8760),
):
    if end <= start:
        raise HTTPException(422, "End must follow start")
    frame = get_run(run_id).frame.iloc[start:end]
    return {
        "start_hour": start,
        "columns": {column: frame[column].to_list() for column in frame.columns},
    }


@app.get("/api/runs/{run_id}/equipment")
def equipment(run_id: str, hour: int = Query(0, ge=0, le=8759)):
    return equipment_snapshot(get_run(run_id), hour)


class AnalysisRequest(BaseModel):
    kind: str = Field(pattern="^(diagnostics|cleaning|uncertainty)$")
    samples: int = Field(40, ge=5, le=200)
    ranges: dict[str, float] = Field(
        default_factory=lambda: UNCERTAINTY_DEFAULTS.copy()
    )
    min_interval: int = Field(14, ge=1, le=120)
    max_operations: int = Field(12, ge=1, le=30)


@app.post("/api/runs/{run_id}/analysis")
def start_analysis(run_id: str, request: AnalysisRequest):
    if PUBLIC and request.samples > 80:
        raise HTTPException(
            422,
            "Free online uncertainty runs support up to 80 samples; larger studies can run locally",
        )
    run = get_run(run_id)
    if any(
        key not in UNCERTAINTY_DEFAULTS or not 0 <= value <= 0.5
        for key, value in request.ranges.items()
    ):
        raise HTTPException(
            422,
            "Uncertainty ranges must be recognised parameters with relative half-width 0–0.5",
        )

    def work(progress, stop):
        progress(5, "Calculating " + request.kind)
        if request.kind == "diagnostics":
            result = diagnostics(run)
        elif request.kind == "cleaning":
            result = optimise_cleaning(
                run, request.min_interval, request.max_operations
            )
        else:
            result = uncertainty(run, request.samples, request.ranges, progress, stop)
        if stop.is_set():
            raise CancelledRun("Cancelled")
        with lock:
            run_analyses(run_id)[request.kind] = result
            path = session_root() / "runs" / f"{run_id}-analysis.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".tmp")
            temporary.write_text(json.dumps(run_analyses(run_id)), encoding="utf-8")
            temporary.replace(path)
        return {"run_id": run_id, "kind": request.kind, "analysis": result}

    return submit(request.kind, work)


@app.get("/api/runs/{run_id}/export")
def export(
    run_id: str,
    dataset: str = "plant",
    level: str = "inverter",
    index: int | None = Query(None, ge=0),
    start: int = Query(0, ge=0, le=8759),
    end: int = Query(8760, ge=1, le=8760),
    aggregation: str = "hourly",
):
    run = get_run(run_id)
    if end <= start or aggregation not in {"hourly", "daily", "monthly"}:
        raise HTTPException(422, "Invalid export range or aggregation")
    if dataset == "zip":
        content, extension, mime = (
            bundle(run, run_analyses(run_id)),
            "zip",
            "application/zip",
        )
    elif dataset == "metadata":
        content, extension, mime = (
            json.dumps(run.metadata, indent=2),
            "json",
            "application/json",
        )
    elif dataset == "weather":
        content, extension, mime = (
            run.weather.data.iloc[start:end].to_csv(index_label="timestamp_local"),
            "csv",
            "text/csv",
        )
    elif dataset == "equipment" and level in {"module", "string", "inverter"}:
        if PUBLIC and index is None and level == "string":
            raise HTTPException(
                422,
                "Select an individual string for an online export to keep memory bounded",
            )
        content, extension, mime = (
            equipment_csv(run, level, index, start, end),
            "csv",
            "text/csv",
        )
    elif dataset in {"faults", "maintenance", "cleaning"}:
        import pandas as pd

        data = (
            [f.model_dump() for f in run.scenario.faults]
            if dataset == "faults"
            else (
                run_analyses(run_id).get("diagnostics", {}).get("candidates", [])
                if dataset == "maintenance"
                else run_analyses(run_id).get("cleaning", {}).get("strategies", [])
            )
        )
        content, extension, mime = (
            pd.DataFrame(data).to_csv(index=False),
            "csv",
            "text/csv",
        )
    elif dataset == "plant":
        content, extension, mime = (
            results_csv(run, start, end, aggregation),
            "csv",
            "text/csv",
        )
    else:
        raise HTTPException(422, "Unsupported export dataset or level")
    return Response(
        content,
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="solar-{run.scenario.id}-{dataset}.{extension}"'
        },
    )


@app.get("/api/runs/{run_id}/report", response_class=HTMLResponse)
def report(run_id: str):
    return report_html(get_run(run_id), run_analyses(run_id))


@app.get("/api/runs/{run_id}/report.pdf")
def pdf_report(run_id: str):
    run = get_run(run_id)
    return Response(
        report_pdf(run, run_analyses(run_id)),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="solar-{run.scenario.id}-report.pdf"'
        },
    )


@app.get("/api/compare/export")
def comparison_export(run_ids: str):
    identifiers = run_ids.split(",")
    if not 1 <= len(identifiers) <= 20:
        raise HTTPException(422, "Choose 1–20 completed runs")
    selected = [get_run(id) for id in identifiers]
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        for run in selected:
            archive.writestr(
                f"{run.scenario.id}-{run.id}/plant_hourly.csv", results_csv(run)
            )
            archive.writestr(
                f"{run.scenario.id}-{run.id}/metadata.json",
                json.dumps(run.metadata, indent=2),
            )
        archive.writestr(
            "comparison.json",
            json.dumps(
                [
                    {
                        "run_id": r.id,
                        "scenario": r.scenario.name,
                        "summary": r.summary,
                        "finance": finance(r),
                    }
                    for r in selected
                ],
                indent=2,
            ),
        )
    return Response(
        stream.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="solar-scenario-comparison.zip"'
        },
    )


dist = ROOT / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
