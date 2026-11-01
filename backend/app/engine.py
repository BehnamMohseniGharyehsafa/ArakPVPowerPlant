"""Hourly string-resolved DC / inverter-resolved AC physical calculation engine."""

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import threading

import numpy as np
import pandas as pd
import pvlib
from joblib import Memory

from .config import MODEL_VERSION, Scenario
from .weather import CACHE, Weather, load_weather

memory = Memory(CACHE / "computations", verbose=0)


class CancelledRun(RuntimeError):
    """Cooperative cancellation at computational boundaries."""


@dataclass
class Run:
    id: str
    scenario: Scenario
    weather: Weather
    frame: pd.DataFrame
    string_dc_kw: np.ndarray
    inverter_ac_kw: np.ndarray
    no_soil_inverter_dc_kw: np.ndarray
    inverter_efficiencies: np.ndarray
    inverter_availability: np.ndarray
    grid_caps: np.ndarray
    string_temperatures: np.ndarray
    string_relative: np.ndarray
    summary: dict
    metadata: dict


def cleaning_days(s: Scenario, weather: Weather | None = None) -> list[int]:
    soil = s.soiling
    if soil.strategy == "fixed":
        return list(range(soil.interval_days, 365, soil.interval_days))
    if soil.strategy == "threshold":
        if weather is None:
            raise ValueError(
                "Threshold cleaning requires the scenario weather and rainfall state"
            )
        days = []
        profile = soil_profile(s, weather, [])
        for day in range(365):
            if profile[day * 24] >= soil.threshold:
                days.append(day)
                profile = soil_profile(s, weather, days)
        return days
    return sorted(set(soil.cleaning_days)) if soil.strategy == "manual" else []


def soil_profile(
    s: Scenario, weather: Weather, dates: list[int] | None = None
) -> np.ndarray:
    index = weather.data.index
    rain = pd.Series(0.0, index=index)
    if s.soiling.rain_mode == "epw":
        if not weather.quality["rain_available"]:
            raise ValueError(
                "Hourly EPW rainfall is incomplete; select assumed no rainfall or an illustrative rainfall scenario"
            )
        rain[:] = weather.data.rain_mm.to_numpy()
    if s.soiling.rain_mode == "illustrative":
        for day in s.soiling.illustrative_rain_days:
            rain.iloc[day * 24 + 6] = s.soiling.rain_threshold_mm + 1
    dates = cleaning_days(s, weather) if dates is None else dates
    washes = [(index[0] + pd.Timedelta(days=d)).date() for d in dates]
    return pvlib.soiling.kimber(
        rain,
        cleaning_threshold=s.soiling.rain_threshold_mm,
        soiling_loss_rate=s.soiling.daily_rate,
        grace_period=14,
        max_soiling=0.3,
        manual_wash_dates=washes,
        initial_soiling=s.soiling.initial_loss,
    ).to_numpy()


@memory.cache
def common_geometry(
    weather_hash: str,
    weather_id: str,
    latitude: float,
    longitude: float,
    altitude: float,
):
    weather = load_weather(weather_id)
    return solar_geometry(weather, latitude, longitude, altitude)


def solar_geometry(
    weather: Weather, latitude: float, longitude: float, altitude: float
):
    frame = weather.data
    times = frame.index + pd.Timedelta(minutes=30)
    sun = pvlib.solarposition.get_solarposition(
        times,
        latitude,
        longitude,
        altitude=altitude,
        pressure=frame.atmospheric_pressure.to_numpy(),
        temperature=frame.temp_air.to_numpy(),
        method="nrel_numpy",
    )
    extra = pvlib.irradiance.get_extra_radiation(times).to_numpy()
    return sun.apparent_zenith.to_numpy(), sun.azimuth.to_numpy(), extra


def convert(
    dc_kw: np.ndarray, efficiency: np.ndarray, rated_kw: float
) -> tuple[np.ndarray, np.ndarray]:
    """pvlib PVWatts; nominal AC rating stays fixed when conversion degrades."""
    pdc0 = rated_kw / efficiency
    with np.errstate(divide="ignore", invalid="ignore"):
        zeta = dc_kw / pdc0
        eta = (
            efficiency
            / 0.9637
            * (-0.0162 * zeta - 0.0059 / np.maximum(zeta, 1e-30) + 0.9858)
        )
    unconstrained = np.maximum(0, np.nan_to_num(eta * dc_kw))
    # Call the library as the numerical source of truth; formula above only isolates clipping.
    ac = np.maximum(0, pvlib.inverter.pvwatts(dc_kw, pdc0, eta_inv_nom=efficiency))
    return np.asarray(ac), np.maximum(unconstrained - ac, 0)


def delivered_for_soiling(run: Run, soil: np.ndarray) -> np.ndarray:
    if run.scenario.plant.module.electrical_model != "pvwatts":
        raise ValueError(
            "Cleaning optimisation uses the linear PVWatts DC model. Select PVWatts for this decision analysis; the optional nonlinear De Soto annual simulation remains available."
        )
    dc = run.no_soil_inverter_dc_kw * (1 - soil[:, None])
    ac, _ = convert(dc, run.inverter_efficiencies, run.scenario.plant.inverter_ac_kw)
    output = (ac * run.inverter_availability).sum(axis=1) * (
        1 - run.scenario.plant.ac_loss
    )
    return np.minimum(output, run.grid_caps)


def simulate(
    s: Scenario,
    weather: Weather | None = None,
    progress=None,
    cancelled: threading.Event | None = None,
) -> Run:
    # Canonicalise defaults and JSON-supplied numeric types before hashing or calculation.
    s = Scenario.model_validate(s.model_dump())

    def step(value: int, message: str):
        if cancelled is not None and cancelled.is_set():
            raise CancelledRun("Simulation cancelled")
        if progress:
            progress(value, message)

    step(5, "Validating meteorology")
    w = weather or load_weather(s.weather_id)
    p, m = s.plant, s.plant.module
    if any(c["status"] == "failed" for c in p.constraints()):
        raise ValueError(
            "Electrical compatibility check failed; review plant configuration"
        )
    n, ni, ns = 8760, p.inverter_count, p.strings_per_inverter
    total_strings = ni * ns
    lat = w.metadata["latitude"] if p.latitude is None else p.latitude
    lon = w.metadata["longitude"] if p.longitude is None else p.longitude
    alt = w.metadata["altitude"] if p.altitude_m is None else p.altitude_m
    if weather is None:
        zenith, azimuth, extra = common_geometry(
            w.provenance["epw_sha256"], s.weather_id, lat, lon, alt
        )
    else:
        zenith, azimuth, extra = solar_geometry(w, lat, lon, alt)
    day = zenith < 90
    ghi, dni, dhi = [
        np.where(day, w.data[c].to_numpy() * s.resource_factor, 0)
        for c in ["ghi", "dni", "dhi"]
    ]
    step(20, "Transposing irradiance and row shading")
    unshaded = pvlib.irradiance.get_total_irradiance(
        p.tilt_deg,
        p.azimuth_deg,
        zenith,
        azimuth,
        dni,
        ghi,
        dhi,
        dni_extra=extra,
        albedo=p.albedo,
        model="haydavies",
    )
    height = p.clearance_m + m.length_m * np.sin(np.radians(p.tilt_deg)) / 2
    sheds = pvlib.bifacial.infinite_sheds.get_irradiance(
        p.tilt_deg,
        p.azimuth_deg,
        zenith,
        azimuth,
        p.gcr,
        height,
        p.row_pitch_m,
        ghi,
        dhi,
        dni,
        p.albedo,
        model="haydavies",
        dni_extra=extra,
        bifaciality=m.bifaciality if m.bifacial else 0,
        shade_factor=-p.rear_structure_loss,
    )
    clean = lambda value: np.where(
        day, np.maximum(np.nan_to_num(np.asarray(value, dtype=float)), 0), 0
    )
    poa_unshaded = clean(unshaded["poa_global"])
    front, rear, effective = [
        clean(sheds[c]) for c in ["poa_front", "poa_back", "poa_global"]
    ]
    soil = soil_profile(s, w)
    ambient = w.data.temp_air.to_numpy() + s.ambient_offset_c
    wind = w.data.wind_speed.to_numpy()
    # Thermal irradiance is incident front + rear, before electrical bifaciality and soiling.
    thermal_poa = front + (rear if m.bifacial else 0)
    if p.temperature_model == "faiman":
        module_temp = pvlib.temperature.faiman(
            thermal_poa, ambient, wind, p.faiman_u0, p.faiman_u1
        )
        cell_temp = pvlib.temperature.sapm_cell_from_module(
            module_temp, thermal_poa, p.cell_delta_t_c
        )
    else:
        parameters = pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"][p.mounting]
        module_temp = pvlib.temperature.sapm_module(
            thermal_poa, ambient, wind, parameters["a"], parameters["b"]
        )
        cell_temp = pvlib.temperature.sapm_cell_from_module(
            module_temp, thermal_poa, parameters["deltaT"]
        )
    step(35, "Calculating string electrical output")
    string_nominal_kw = p.modules_per_string * m.rated_power_w / 1000
    reference = poa_unshaded / 1000 * p.dc_capacity_kw
    shaded = front / 1000 * p.dc_capacity_kw
    bifacial = effective / 1000 * p.dc_capacity_kw

    def dc_model(e, t):
        if m.electrical_model == "pvwatts":
            return np.maximum(
                0, pvlib.pvsystem.pvwatts_dc(e, t, string_nominal_kw, m.gamma_pdc)
            )
        irradiance_array, temperature_array = np.broadcast_arrays(e, t)
        light = irradiance_array.ravel() > 0
        power = np.zeros(irradiance_array.size)
        params = pvlib.pvsystem.calcparams_desoto(
            irradiance_array.ravel()[light],
            temperature_array.ravel()[light],
            **m.desoto,
        )
        solved = pvlib.pvsystem.singlediode(*params)
        power[light] = np.maximum(np.nan_to_num(np.asarray(solved["p_mp"])), 0)
        return power.reshape(irradiance_array.shape) * p.modules_per_string / 1000

    thermal_dc = dc_model(effective, cell_temp)
    stc_temperature_dc = dc_model(effective, np.full(n, 25.0)) * total_strings
    string_temp = np.broadcast_to(cell_temp[:, None], (n, total_strings)).copy()
    string_factor = np.ones((n, total_strings))
    efficiency = np.full((n, ni), p.inverter_efficiency)
    inv_available = np.full((n, ni), p.availability)
    grid_caps = np.full(
        n, p.export_limit_kw if p.export_limit_kw is not None else np.inf
    )
    observed_factor = np.ones(n)
    statuses = [[] for _ in range(n)]
    for f in s.faults:
        start, stop = f.start_hour, min(n, f.start_hour + f.duration_hours)
        rows = slice(start, stop)
        targets = (
            np.arange(total_strings)
            if f.target == "plant"
            else (
                np.arange(f.target_index * ns, (f.target_index + 1) * ns)
                if f.target == "inverter"
                else np.array([f.target_index])
            )
        )
        inv_targets = np.arange(ni) if f.target == "plant" else np.unique(targets // ns)
        for i in range(start, stop):
            statuses[i].append(f.id)
        if f.kind in {
            "string_disconnect",
            "string_underperformance",
            "local_soiling",
            "uniform_soiling",
            "partial_shading",
            "degradation",
        }:
            # Reduced-order string power derate. No bypass-diode / mismatch solution is implied.
            if f.kind == "degradation":
                factor = 1 - f.severity * np.linspace(0, 1, stop - start)[:, None]
            else:
                factor = 0 if f.kind == "string_disconnect" else 1 - f.severity
            string_factor[rows, targets] *= factor
        elif f.kind == "temperature":
            string_temp[rows, targets] += f.severity * 40
        elif f.kind == "inverter_outage":
            inv_available[rows, inv_targets] = 0
        elif f.kind == "inverter_efficiency":
            efficiency[rows, inv_targets] *= 1 - 0.5 * f.severity
        elif f.kind == "curtailment":
            grid_caps[rows] = np.minimum(
                grid_caps[rows], ni * p.inverter_ac_kw * (1 - f.severity)
            )
        elif f.kind == "sensor_bias":
            observed_factor[rows] *= 1 + f.severity * 0.5
    actual_clean_dc = dc_model(effective[:, None], string_temp) * string_factor
    degradation_factor = (1 - p.annual_degradation) ** p.operating_year
    no_soil_string = actual_clean_dc * (1 - p.dc_loss) * degradation_factor
    soiled_dc = dc_model(effective * (1 - soil), cell_temp)
    actual_soiled_dc = (
        dc_model((effective * (1 - soil))[:, None], string_temp) * string_factor
    )
    dc_strings = actual_soiled_dc * (1 - p.dc_loss) * degradation_factor
    no_soil_inv = no_soil_string.reshape(n, ni, ns).sum(axis=2)
    dc_inv = dc_strings.reshape(n, ni, ns).sum(axis=2)
    step(60, "Converting inverter power and applying grid constraints")
    ac_inv, clipping = convert(dc_inv, efficiency, p.inverter_ac_kw)
    ac_available = ac_inv * inv_available
    pre_grid = ac_available.sum(axis=1) * (1 - p.ac_loss)
    delivered = np.minimum(pre_grid, grid_caps)
    grid_factor = np.divide(delivered, pre_grid, out=np.zeros(n), where=pre_grid > 0)
    delivered_inv = ac_available * (1 - p.ac_loss) * grid_factor[:, None]
    thermal_total = thermal_dc * total_strings
    soil_total = soiled_dc * total_strings
    fault_total = actual_soiled_dc.sum(axis=1)
    wire_total = fault_total * (1 - p.dc_loss)
    degradation_total = wire_total * degradation_factor
    stages = {
        "shading_loss_kwh": reference - shaded,
        "bifacial_gain_kwh": bifacial - shaded,
        "dc_model_response_loss_kwh": bifacial - stc_temperature_dc,
        "temperature_loss_kwh": stc_temperature_dc - thermal_total,
        "soiling_loss_kwh": thermal_total - soil_total,
        "fault_loss_kwh": soil_total - fault_total,
        "dc_electrical_loss_kwh": fault_total - wire_total,
        "degradation_loss_kwh": wire_total - degradation_total,
        "inverter_loss_kwh": degradation_total - ac_inv.sum(axis=1),
        "availability_loss_kwh": ac_inv.sum(axis=1) - ac_available.sum(axis=1),
        "ac_electrical_loss_kwh": ac_available.sum(axis=1) - pre_grid,
        "curtailment_loss_kwh": pre_grid - delivered,
    }
    accounted = (
        reference
        + stages["bifacial_gain_kwh"]
        - sum(v for k, v in stages.items() if k != "bifacial_gain_kwh")
    )
    residual = accounted - delivered
    frame = pd.DataFrame(
        {
            "timestamp_local": w.data.index.astype(str),
            "timestamp_utc": w.data.index.tz_convert("UTC").astype(str),
            "ghi_w_m2": w.data.ghi.to_numpy() * s.resource_factor,
            "dni_w_m2": w.data.dni.to_numpy() * s.resource_factor,
            "dhi_w_m2": w.data.dhi.to_numpy() * s.resource_factor,
            "ambient_temp_c": ambient,
            "wind_speed_m_s": wind,
            "solar_zenith_deg": zenith,
            "solar_azimuth_deg": azimuth,
            "solar_elevation_deg": 90 - zenith,
            "incidence_angle_deg": pvlib.irradiance.aoi(
                p.tilt_deg, p.azimuth_deg, zenith, azimuth
            ),
            "extraterrestrial_dni_w_m2": extra,
            "poa_unshaded_w_m2": poa_unshaded,
            "poa_front_w_m2": front,
            "poa_rear_w_m2": rear if m.bifacial else np.zeros(n),
            "poa_direct_w_m2": clean(unshaded["poa_direct"]),
            "poa_sky_diffuse_w_m2": clean(unshaded["poa_sky_diffuse"]),
            "poa_ground_diffuse_w_m2": clean(unshaded["poa_ground_diffuse"]),
            "effective_irradiance_w_m2": effective * (1 - soil),
            "module_temp_c": module_temp,
            "cell_temp_c": cell_temp,
            "soiling_fraction": soil,
            "shading_fraction": np.divide(
                poa_unshaded - front,
                poa_unshaded,
                out=np.zeros(n),
                where=poa_unshaded > 0,
            ),
            "dc_power_kw": dc_strings.sum(axis=1),
            "ac_power_kw": delivered,
            "ac_energy_kwh": delivered,
            "observed_ac_kw": delivered * observed_factor,
            "reference_energy_kwh": reference,
            "clipping_loss_kwh": clipping.sum(axis=1),
            **stages,
            "accounting_residual_kwh": residual,
            "cumulative_ac_energy_kwh": np.cumsum(delivered),
            "fault_status": [";".join(x) for x in statuses],
            "data_quality_flags": w.data.data_quality_flags.to_numpy(),
            "scenario_id": s.id,
        }
    )
    frame.index = w.data.index
    rise_set = pvlib.solarposition.sun_rise_set_transit_spa(
        w.data.index[::24], lat, lon, how="numpy"
    )
    frame["sunrise_local"] = np.repeat(rise_set.sunrise.astype(str).to_numpy(), 24)
    frame["sunset_local"] = np.repeat(rise_set.sunset.astype(str).to_numpy(), 24)
    energy, irradiation = float(delivered.sum()), float(front.sum() / 1000)
    monthly = frame.resample("MS").agg(
        {
            "ac_energy_kwh": "sum",
            "dc_power_kw": "sum",
            "ghi_w_m2": "sum",
            "poa_front_w_m2": "sum",
            "poa_rear_w_m2": "sum",
            "ambient_temp_c": "mean",
            "cell_temp_c": "mean",
            "soiling_fraction": "mean",
        }
    )
    months = [
        {
            "month": i + 1,
            "label": stamp.strftime("%b"),
            **{k: float(v) for k, v in row.items()},
        }
        for i, (stamp, row) in enumerate(monthly.iterrows())
    ]
    prices = (
        np.asarray(s.finance.hourly_prices)
        if s.finance.hourly_prices
        else s.finance.price_per_kwh
    )
    payload = json.dumps(
        {
            "scenario": s.model_dump(),
            "weather": w.provenance["epw_sha256"],
            "version": MODEL_VERSION,
            "pvlib": pvlib.__version__,
        },
        sort_keys=True,
    )
    run_id = hashlib.sha256(payload.encode()).hexdigest()[:24]
    summary = {
        "annual_energy_kwh": energy,
        "annual_dc_energy_kwh": float(frame.dc_power_kw.sum()),
        "dc_capacity_kw": p.dc_capacity_kw,
        "ac_capacity_kw": ni * p.inverter_ac_kw,
        "module_count": p.module_count,
        "string_count": total_strings,
        "inverter_count": ni,
        "dc_ac_ratio": p.dc_capacity_kw / (ni * p.inverter_ac_kw),
        "specific_yield_kwh_kwp": energy / p.dc_capacity_kw,
        "reference_yield_h": irradiation,
        "performance_ratio": (
            energy / p.dc_capacity_kw / irradiation if irradiation else 0
        ),
        "capacity_factor": energy / (ni * p.inverter_ac_kw * n),
        "annual_ghi_kwh_m2": float(ghi.sum() / 1000),
        "annual_poa_front_kwh_m2": irradiation,
        "annual_poa_rear_kwh_m2": float(rear.sum() / 1000) if m.bifacial else 0,
        "gross_value": float(np.sum(delivered * prices)),
        "max_accounting_residual_kwh": float(np.abs(residual).max()),
        "losses_kwh": {k: float(v.sum()) for k, v in stages.items()},
        "reference_energy_kwh": float(reference.sum()),
        "clipping_loss_kwh": float(clipping.sum()),
        "monthly": months,
        "cleaning_days": cleaning_days(s, w),
        "constraints": p.constraints(),
    }
    metadata = {
        "run_id": run_id,
        "model_version": MODEL_VERSION,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "scenario": s.model_dump(),
        "weather": w.provenance,
        "station": w.metadata,
        "weather_quality": w.quality,
        "plant_location": {"latitude": lat, "longitude": lon, "altitude_m": alt},
        "timestep_hours": 1,
        "software": {
            "pvlib": pvlib.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "models": {
            "solar_position": "pvlib NREL SPA (numpy)",
            "irradiance": "Hay-Davies / infinite sheds",
            "thermal": p.temperature_model,
            "dc": m.electrical_model,
            "inverter": "PVWatts",
            "soiling": "Kimber",
        },
        "assumptions": [
            "TMY reference conditions, not measured historical plant production",
            "Station coordinates initialise the configurable plant location; site resource assessment requires local information",
            "Module values are illustrative; electrical compatibility may remain unverified",
            "String-homogeneous reduced-order model; module outputs are allocated, not measured",
            "Infinite parallel rows on flat terrain; no terrain, obstacles, end effects or bypass-diode mismatch",
            "Faiman module temperature plus configurable SAPM cell delta; wind-height calibration is not site validated",
            "Unshaded POA components shown separately; row shading is computed independently of WebGL",
            "Sequential energy attribution; temperature losses may be negative",
            "PR uses shaded front POA; bifacial contribution can increase conventional PR",
            "Availability is an expected fractional derate, separate from discrete outages",
            "Rain cleaning is disabled unless valid EPW or explicit illustrative rain is selected",
            "Tariffs, costs, degradation and fault severities are editable illustrative assumptions",
        ],
    }
    relative = np.divide(
        dc_strings,
        thermal_dc[:, None],
        out=np.ones_like(dc_strings),
        where=thermal_dc[:, None] > 0,
    )
    step(100, "Complete")
    return Run(
        run_id,
        s,
        w,
        frame,
        dc_strings,
        delivered_inv,
        no_soil_inv,
        efficiency,
        inv_available,
        grid_caps,
        string_temp,
        relative,
        summary,
        metadata,
    )


def equipment_snapshot(run: Run, hour: int) -> dict:
    p, f = run.scenario.plant, run.frame.iloc[hour]
    clean_thermal_dc = (
        f.reference_energy_kwh
        - f.shading_loss_kwh
        + f.bifacial_gain_kwh
        - f.get("dc_model_response_loss_kwh", 0)
        - f.temperature_loss_kwh
    )
    clean_module_potential_w = (
        clean_thermal_dc
        * 1000
        / p.module_count
        * (1 - p.dc_loss)
        * (1 - p.annual_degradation) ** p.operating_year
    )
    dc = run.string_dc_kw[hour]
    inv_dc = dc.reshape(p.inverter_count, p.strings_per_inverter).sum(axis=1)
    strings = []
    for i, power in enumerate(dc):
        inv = i // p.strings_per_inverter
        active_events = [
            x
            for x in run.scenario.faults
            if x.start_hour <= hour < min(8760, x.start_hour + x.duration_hours)
            and (
                x.target == "plant"
                or (x.target == "inverter" and x.target_index == inv)
                or (x.target == "string" and x.target_index == i)
            )
        ]
        active = [x.id for x in active_events]
        local_soil = float(f.soiling_fraction)
        local_shade = float(f.shading_fraction)
        for event in active_events:
            if event.kind in {"local_soiling", "uniform_soiling"}:
                local_soil = 1 - (1 - local_soil) * (1 - event.severity)
            if event.kind == "partial_shading":
                local_shade = 1 - (1 - local_shade) * (1 - event.severity)
        share = float(power / inv_dc[inv]) if inv_dc[inv] > 0 else 0
        strings.append(
            {
                "id": f"S-{i+1:03d}",
                "index": i,
                "inverter_id": f"INV-{inv+1:02d}",
                "inverter_index": inv,
                "dc_power_kw": float(power),
                "allocated_ac_kw": float(run.inverter_ac_kw[hour, inv] * share),
                "module_dc_w": float(power * 1000 / p.modules_per_string),
                "dc_gap_to_clean_potential_w": max(
                    0.0,
                    float(
                        clean_module_potential_w - power * 1000 / p.modules_per_string
                    ),
                ),
                "cell_temp_c": float(run.string_temperatures[hour, i]),
                "effective_irradiance_w_m2": float(f.effective_irradiance_w_m2),
                "relative_performance": float(run.string_relative[hour, i]),
                "faults": active,
                "soiling_fraction": local_soil,
                "shading_fraction": local_shade,
                "fault_severity": max(
                    [
                        (
                            1
                            if x.kind in {"string_disconnect", "inverter_outage"}
                            else x.severity
                        )
                        for x in active_events
                    ],
                    default=0,
                ),
                "data_resolution": "String DC potential before inverter availability; module values allocated uniformly",
            }
        )
    return {
        "hour": hour,
        "strings": strings,
        "inverters": [
            {
                "id": f"INV-{i+1:02d}",
                "index": i,
                "dc_power_kw": float(inv_dc[i]),
                "ac_power_kw": float(run.inverter_ac_kw[hour, i]),
            }
            for i in range(p.inverter_count)
        ],
    }
