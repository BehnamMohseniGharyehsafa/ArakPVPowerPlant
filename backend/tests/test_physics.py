import io
import zipfile
import numpy as np
import pytest
import pvlib
from pydantic import ValidationError
from backend.app.config import Scenario, Plant, Module, Fault
from backend.app.engine import (
    simulate,
    equipment_snapshot,
    convert,
    soil_profile,
    cleaning_days,
)
from backend.app.weather import safe_epw


def variant(reference, **updates):
    return Scenario.model_validate({**reference.scenario.model_dump(), **updates})


def test_calendar_and_topology(reference):
    assert len(reference.frame) == 8760
    assert reference.weather.data.index.is_unique
    assert reference.weather.data.index.year.unique().tolist() == [2001]
    p = reference.scenario.plant
    assert p.module_count == 4160
    assert p.dc_capacity_kw == pytest.approx(3016)
    assert (
        p.module_count
        == p.inverter_count * p.strings_per_inverter * p.modules_per_string
    )
    assert any(c["status"] == "unverified" for c in p.constraints())


def test_limits_aggregation_and_accounting(reference):
    f = reference.frame
    assert np.all(f.loc[f.solar_zenith_deg >= 90, "ac_power_kw"] == 0)
    assert (f.ac_power_kw >= 0).all()
    assert (reference.inverter_ac_kw <= reference.scenario.plant.inverter_ac_kw).all()
    np.testing.assert_allclose(
        reference.string_dc_kw.sum(axis=1), f.dc_power_kw, atol=1e-9
    )
    np.testing.assert_allclose(
        reference.inverter_ac_kw.sum(axis=1), f.ac_power_kw, atol=1e-9
    )
    assert abs(f.ac_energy_kwh.sum() - f.resample("D").ac_energy_kwh.sum().sum()) < 1e-7
    assert reference.summary["max_accounting_residual_kwh"] < 1e-8
    assert f.cumulative_ac_energy_kwh.iloc[-1] == pytest.approx(
        reference.summary["annual_energy_kwh"]
    )


def test_pvwatts_hand_benchmark():
    # Analytic STC and thermal limits are separate from an annual library-to-library comparison.
    assert pvlib.pvsystem.pvwatts_dc(1000, 25, 725, -0.003) == pytest.approx(725)
    assert pvlib.pvsystem.pvwatts_dc(500, 45, 725, -0.003) == pytest.approx(340.75)
    ac, clipping = convert(np.array([[0, 50, 200.0]]), np.full((1, 3), 0.98), 125)
    assert ac[0, 0] == 0
    assert ac[0, 2] == pytest.approx(125)
    assert clipping[0, 2] > 0


def test_faults_weather_and_monotonicity(reference, weather):
    plant = reference.scenario.plant.model_dump()
    fault = Fault(kind="inverter_outage", target="inverter", target_index=0)
    outage = simulate(variant(reference, faults=[fault.model_dump()]), weather)
    assert np.all(outage.inverter_ac_kw[:, 0] == 0)
    np.testing.assert_allclose(
        outage.inverter_ac_kw[:, 1:], reference.inverter_ac_kw[:, 1:]
    )
    string = simulate(
        variant(
            reference,
            faults=[Fault(kind="string_disconnect", target="string").model_dump()],
        ),
        weather,
    )
    assert np.all(string.string_dc_kw[:, 0] == 0)
    hot = simulate(variant(reference, ambient_offset_c=10), weather)
    assert hot.summary["annual_energy_kwh"] < reference.summary["annual_energy_kwh"]
    capped = simulate(
        variant(reference, plant={**plant, "export_limit_kw": 1000}), weather
    )
    assert capped.frame.ac_power_kw.max() <= 1000
    assert capped.summary["annual_energy_kwh"] <= reference.summary["annual_energy_kwh"]
    dirty = simulate(
        variant(
            reference,
            soiling={**reference.scenario.soiling.model_dump(), "initial_loss": 0.15},
        ),
        weather,
    )
    assert dirty.summary["annual_energy_kwh"] <= reference.summary["annual_energy_kwh"]
    bright = simulate(variant(reference, plant={**plant, "albedo": 0.5}), weather)
    assert bright.frame.poa_rear_w_m2.sum() > reference.frame.poa_rear_w_m2.sum()
    assert bright.summary["annual_energy_kwh"] > reference.summary["annual_energy_kwh"]
    bias = simulate(
        variant(
            reference, faults=[Fault(kind="sensor_bias", target="plant").model_dump()]
        ),
        weather,
    )
    np.testing.assert_allclose(bias.frame.ac_power_kw, reference.frame.ac_power_kw)
    assert bias.frame.observed_ac_kw.sum() > bias.frame.ac_power_kw.sum()


def test_cleaning_and_equipment(reference, weather):
    no_wash = soil_profile(reference.scenario, weather, [])
    washed = soil_profile(reference.scenario, weather, [30])
    assert np.all(washed <= no_wash + 1e-9)
    snap = equipment_snapshot(reference, 4000)
    assert len(snap["strings"]) == 160
    assert sum(s["dc_power_kw"] for s in snap["strings"]) == pytest.approx(
        reference.frame.dc_power_kw.iloc[4000]
    )
    assert sum(s["allocated_ac_kw"] for s in snap["strings"]) == pytest.approx(
        reference.frame.ac_power_kw.iloc[4000]
    )


def test_cached_and_supplied_weather_paths_match(reference):
    cached = simulate(reference.scenario)
    np.testing.assert_allclose(
        cached.frame.ac_power_kw, reference.frame.ac_power_kw, rtol=0, atol=1e-9
    )
    loaded = Scenario.model_validate_json(reference.scenario.model_dump_json())
    assert simulate(loaded).id == cached.id


def test_timed_fault_recovery_and_temperature(reference, weather):
    event = Fault(
        kind="temperature",
        target="string",
        severity=0.5,
        start_hour=4000,
        duration_hours=100,
    )
    altered = simulate(variant(reference, faults=[event.model_dump()]), weather)
    assert (
        altered.string_dc_kw[4000:4100, 0].sum()
        < reference.string_dc_kw[4000:4100, 0].sum()
    )
    np.testing.assert_allclose(
        altered.string_dc_kw[:4000], reference.string_dc_kw[:4000]
    )
    np.testing.assert_allclose(
        altered.string_dc_kw[4100:], reference.string_dc_kw[4100:]
    )
    assert altered.summary["max_accounting_residual_kwh"] < 1e-8


def test_invalid_configs_and_unsafe_zip(tmp_path):
    with pytest.raises(ValidationError):
        Plant(row_pitch_m=1)
    with pytest.raises(ValidationError):
        Module(electrical_model="desoto")
    with pytest.raises(ValidationError):
        Scenario(faults=[Fault(target_index=500)])
    archive = tmp_path / "bad.zip"
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("../escape.epw", "unsafe")
    with pytest.raises(ValueError, match="Unsafe"):
        safe_epw(archive, tmp_path / "safe.epw")


def test_optional_documented_single_diode(weather):
    module = pvlib.pvsystem.retrieve_sam("CECMod").iloc[:, 0]
    params = {
        key: float(module[key])
        for key in ["alpha_sc", "a_ref", "I_L_ref", "I_o_ref", "R_sh_ref", "R_s"]
    }
    configured = Module(
        rated_power_w=float(module.STC),
        vmp_v=float(module.V_mp_ref),
        electrical_model="desoto",
        desoto=params,
        bifacial=False,
        parameter_source="pvlib bundled CEC module database: " + str(module.name),
    )
    run = simulate(
        Scenario(
            plant=Plant(
                module=configured,
                inverter_count=1,
                strings_per_inverter=1,
                modules_per_string=10,
            )
        ),
        weather,
    )
    assert run.summary["annual_energy_kwh"] > 0
    assert run.summary["max_accounting_residual_kwh"] < 1e-8
    assert run.frame.ac_power_kw[run.frame.solar_zenith_deg >= 90].sum() == 0
    assert run.frame.sunrise_local.str.contains("2001-").all()


def test_threshold_cleaning_respects_explicit_rain_and_wet_grace(weather):
    raw = Scenario().model_dump()
    raw["soiling"].update(
        strategy="threshold",
        initial_loss=0,
        daily_rate=0.01,
        threshold=0.05,
        rain_mode="illustrative",
        illustrative_rain_days=[3],
    )
    with_rain = Scenario.model_validate(raw)
    washes = cleaning_days(with_rain, weather)
    assert not any(3 <= day <= 17 for day in washes)
    raw["soiling"]["rain_mode"] = "none"
    dry = cleaning_days(Scenario.model_validate(raw), weather)
    assert dry[0] < washes[0]
