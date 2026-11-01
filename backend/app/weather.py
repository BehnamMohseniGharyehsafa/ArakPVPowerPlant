"""Bounded weather acquisition, provenance and strict EPW quality gate."""

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import urllib.request
import zipfile

import numpy as np
import pandas as pd
import pvlib

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("SOLAR_DATA_DIR", ROOT / "data"))
CACHE = DATA / "cache"
SOURCE_URL = "https://climate.onebuilding.org/WMO_Region_2_Asia/IRN_Iran/MK_Markazi/IRN_MK_Arak.407690_TMYx.zip"
MAX_FILE_BYTES = 30 * 1024 * 1024


@dataclass
class Weather:
    data: pd.DataFrame
    metadata: dict
    provenance: dict
    quality: dict


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_epw(archive: Path, destination: Path) -> Path:
    """Validate every member; copy only the single EPW without extractall."""
    with zipfile.ZipFile(archive) as z:
        if (
            len(z.infolist()) > 100
            or sum(i.file_size for i in z.infolist()) > 100 * 1024 * 1024
        ):
            raise ValueError("Archive exceeds safe member or expanded-size limits")
        for item in z.infolist():
            path = PurePosixPath(item.filename.replace("\\", "/"))
            if (
                path.is_absolute()
                or ".." in path.parts
                or ":" in item.filename
                or (item.external_attr >> 16) & 0o170000 == 0o120000
            ):
                raise ValueError("Unsafe archive path or symbolic link")
        files = [i for i in z.infolist() if i.filename.lower().endswith(".epw")]
        if len(files) != 1 or files[0].file_size > MAX_FILE_BYTES:
            raise ValueError(
                "Archive must contain exactly one EPW within the size limit"
            )
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(z.read(files[0]))
    return destination


def download_weather() -> Path:
    folder = CACHE / "arak"
    epw = folder / "original.epw"
    if epw.exists() and (folder / "provenance.json").exists():
        return epw
    folder.mkdir(parents=True, exist_ok=True)
    archive = folder / "original.zip"
    request = urllib.request.Request(
        SOURCE_URL, headers={"User-Agent": "SolarFieldTwin/1.0 (research simulation)"}
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = response.read(MAX_FILE_BYTES + 1)
        if len(payload) > MAX_FILE_BYTES:
            raise ValueError("Weather archive exceeds 30 MiB")
    archive.write_bytes(payload)
    safe_epw(archive, epw)
    provenance = {
        "source_url": SOURCE_URL,
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
        "archive_sha256": checksum(archive),
        "epw_sha256": checksum(epw),
        "dataset_type": "TMYx typical meteorological year; not historical plant observations",
        "reference_year": 2001,
    }
    (folder / "provenance.json").write_text(
        json.dumps(provenance, indent=2), encoding="utf-8"
    )
    return epw


def load_weather(weather_id: str = "arak") -> Weather:
    if not weather_id.replace("-", "").replace("_", "").isalnum():
        raise ValueError("Invalid weather identifier")
    epw = (
        download_weather()
        if weather_id == "arak"
        else CACHE / weather_id / "original.epw"
    )
    if not epw.exists():
        raise ValueError("Weather file not found")
    frame, meta = pvlib.iotools.read_epw(epw, coerce_year=2001)
    expected = pd.date_range("2001-01-01", periods=8760, freq="h", tz=frame.index.tz)
    if len(frame) != 8760 or not frame.index.equals(expected):
        raise ValueError(
            "EPW must contain a complete, ordered 365-day hourly calendar (8760 intervals)"
        )
    bounds = {
        "ghi": (0, 1500),
        "dni": (0, 1500),
        "dhi": (0, 1500),
        "temp_air": (-70, 65),
        "wind_speed": (0, 65),
        "atmospheric_pressure": (30000, 110000),
    }
    flags = [[] for _ in range(8760)]
    issues = []
    fatal = []
    for column, (low, high) in bounds.items():
        values = pd.to_numeric(frame[column], errors="coerce")
        invalid = ~np.isfinite(values) | (values < low) | (values > high)
        for i in np.flatnonzero(invalid):
            flags[i].append(f"invalid_{column}")
        if invalid.any():
            fatal.append(f"{column}: {invalid.sum()} invalid/missing values")
        frame[column] = values
    if fatal:
        raise ValueError(
            "Weather quality gate failed. No silent imputation: " + "; ".join(fatal)
        )
    midpoint = frame.index + pd.Timedelta(minutes=30)
    solar = pvlib.solarposition.get_solarposition(
        midpoint, meta["latitude"], meta["longitude"], altitude=meta["altitude"]
    )
    cosine = np.maximum(np.cos(np.radians(solar.apparent_zenith.to_numpy())), 0)
    discrepancy = abs(
        frame.ghi.to_numpy() - frame.dhi.to_numpy() - frame.dni.to_numpy() * cosine
    )
    inconsistent = (discrepancy > np.maximum(100, frame.ghi.to_numpy() * 0.25)) & (
        frame.ghi.to_numpy() > 50
    )
    for i in np.flatnonzero(inconsistent):
        flags[i].append("irradiance_closure_warning")
    if inconsistent.any():
        issues.append(
            f"{inconsistent.sum()} hours have GHI/DNI/DHI closure differences >25% or 100 W/m² (midpoint approximation)"
        )
    night = (cosine == 0) & (frame.ghi.to_numpy() > 20)
    for i in np.flatnonzero(night):
        flags[i].append("night_irradiance_warning")
    rain = pd.to_numeric(
        frame.get("liquid_precipitation_depth", pd.Series(np.nan, index=frame.index)),
        errors="coerce",
    )
    quantity = pd.to_numeric(
        frame.get(
            "liquid_precipitation_quantity", pd.Series(np.nan, index=frame.index)
        ),
        errors="coerce",
    )
    valid_rain = np.isfinite(rain) & (rain >= 0) & (rain < 999) & (quantity == 1)
    rain_available = bool(valid_rain.all())
    frame["rain_mm"] = rain.where(valid_rain, np.nan)
    if not rain_available:
        issues.append(
            "Usable hourly rainfall is incomplete. Default: explicitly assumed no natural rain cleaning; illustrative rain is optional."
        )
    frame["data_quality_flags"] = [";".join(x) for x in flags]
    provenance_path = epw.parent / "provenance.json"
    provenance = (
        json.loads(provenance_path.read_text(encoding="utf-8"))
        if provenance_path.exists()
        else {}
    )
    if provenance.get("epw_sha256") and provenance["epw_sha256"] != checksum(epw):
        raise ValueError("EPW checksum differs from recorded provenance")
    quality = {
        "hours": 8760,
        "status": "warning" if issues else "valid",
        "issues": issues,
        "flagged_hours": sum(bool(x) for x in flags),
        "rain_available": rain_available,
        "timestamp_convention": "EPW hour-ending radiation mapped to interval-start labels; solar geometry at interval midpoint; fixed local standard time; no DST",
    }
    return Weather(frame, meta, provenance, quality)


def store_upload(payload: bytes) -> str:
    if len(payload) > MAX_FILE_BYTES:
        raise ValueError("EPW upload exceeds 30 MiB")
    id = "epw-" + hashlib.sha256(payload).hexdigest()[:20]
    folder = CACHE / id
    folder.mkdir(parents=True, exist_ok=True)
    epw = folder / "original.epw"
    epw.write_bytes(payload)
    (folder / "provenance.json").write_text(
        json.dumps(
            {
                "source_url": "User-uploaded EPW",
                "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
                "epw_sha256": checksum(epw),
                "dataset_type": "User EPW interpreted as a typical 365-day reference calendar",
                "reference_year": 2001,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    load_weather(id)
    return id
