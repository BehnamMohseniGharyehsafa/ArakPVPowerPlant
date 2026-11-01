"""Validated, versioned engineering assumptions. No manufacturer claims."""

from typing import Literal
from pydantic import BaseModel, Field, model_validator

MODEL_VERSION = "1.0.0"


class Module(BaseModel):
    rated_power_w: float = Field(725, gt=0, le=1500)
    width_m: float = Field(1.303, gt=0.2, le=3)
    length_m: float = Field(2.384, gt=0.5, le=4)
    efficiency: float = Field(0.2334, gt=0.05, lt=0.5)
    gamma_pdc: float = Field(-0.003, ge=-0.01, le=0)
    vmp_v: float = Field(42.17, gt=0)
    voc_v: float | None = Field(None, gt=0)
    beta_voc_per_c: float | None = Field(None, ge=-0.02, le=0)
    beta_vmp_per_c: float | None = Field(None, ge=-0.02, le=0)
    isc_a: float | None = Field(None, gt=0)
    max_system_voltage_v: float = Field(1500, gt=0)
    bifacial: bool = True
    bifaciality: float = Field(0.7, ge=0, le=1)
    electrical_model: Literal["pvwatts", "desoto"] = "pvwatts"
    # Complete De Soto reference inputs must be supplied with provenance.
    desoto: dict[str, float] | None = None
    parameter_source: str = (
        "Illustrative engineering assumptions; not a verified datasheet"
    )

    @model_validator(mode="after")
    def advanced_inputs(self):
        if self.electrical_model == "desoto":
            required = {"alpha_sc", "a_ref", "I_L_ref", "I_o_ref", "R_sh_ref", "R_s"}
            if not self.desoto or not required <= self.desoto.keys():
                raise ValueError(
                    "De Soto requires all six reference parameters and a documented parameter_source"
                )
            if self.parameter_source.startswith("Illustrative"):
                raise ValueError(
                    "Supply documented provenance for the single-diode parameters"
                )
            if (
                any(
                    self.desoto[k] <= 0
                    for k in ["a_ref", "I_L_ref", "I_o_ref", "R_sh_ref"]
                )
                or self.desoto["R_s"] < 0
            ):
                raise ValueError(
                    "Single-diode reference currents, shunt resistance and a_ref must be positive; series resistance must be nonnegative"
                )
        return self


class Plant(BaseModel):
    module: Module = Field(default_factory=Module)
    modules_per_string: int = Field(26, ge=1, le=60)
    strings_per_inverter: int = Field(8, ge=1, le=40)
    inverter_count: int = Field(20, ge=1, le=50)
    inverter_ac_kw: float = Field(125, gt=0, le=2000)
    inverter_efficiency: float = Field(0.98, ge=0.8, le=0.999)
    inverter_max_dc_v: float = Field(1500, gt=0)
    inverter_mppt_min_v: float = Field(500, gt=0)
    inverter_mppt_max_v: float = Field(1300, gt=0)
    inverter_max_input_a: float | None = Field(None, gt=0)
    design_min_cell_c: float = Field(-20, ge=-80, le=25)
    design_max_cell_c: float = Field(75, ge=25, le=110)
    tilt_deg: float = Field(30, ge=0, le=75)
    azimuth_deg: float = Field(180, ge=0, lt=360)
    row_pitch_m: float = Field(6.3, gt=0.5, le=30)
    clearance_m: float = Field(0.8, ge=0.1, le=5)
    albedo: float = Field(0.25, ge=0, le=0.95)
    mounting: Literal["open_rack_glass_glass", "open_rack_glass_polymer"] = (
        "open_rack_glass_glass"
    )
    rear_structure_loss: float = Field(0.02, ge=0, le=0.5)
    temperature_model: Literal["faiman", "sandia"] = "faiman"
    faiman_u0: float = Field(25, ge=5, le=60)
    faiman_u1: float = Field(6.84, ge=0, le=20)
    cell_delta_t_c: float = Field(3, ge=0, le=10)
    dc_loss: float = Field(0.015, ge=0, le=0.3)
    ac_loss: float = Field(0.01, ge=0, le=0.3)
    availability: float = Field(0.995, ge=0, le=1)
    export_limit_kw: float | None = Field(None, ge=0)
    annual_degradation: float = Field(0.005, ge=0, le=0.1)
    operating_year: int = Field(0, ge=0, le=50)
    latitude: float | None = Field(None, ge=-89, le=89)
    longitude: float | None = Field(None, ge=-180, le=180)
    altitude_m: float | None = Field(None, ge=-500, le=9000)

    @property
    def module_count(self):
        return self.modules_per_string * self.strings_per_inverter * self.inverter_count

    @property
    def dc_capacity_kw(self):
        return self.module_count * self.module.rated_power_w / 1000

    @property
    def gcr(self):
        return self.module.length_m / self.row_pitch_m

    @model_validator(mode="after")
    def geometry(self):
        import math

        if self.gcr >= 0.95 or self.row_pitch_m <= self.module.length_m * math.cos(
            math.radians(self.tilt_deg)
        ):
            raise ValueError(
                "Row pitch must exceed the horizontal projection of a module and GCR must be below 0.95"
            )
        if self.module_count > 30000:
            raise ValueError("Interactive runs are limited to 30,000 modules")
        if self.inverter_count * self.strings_per_inverter > 400:
            raise ValueError(
                "This local interactive engine supports at most 400 strings per run"
            )
        return self

    def constraints(self):
        m, n = self.module, self.modules_per_string
        checks = []
        if m.voc_v is None or m.beta_voc_per_c is None:
            checks.append(
                {
                    "status": "unverified",
                    "name": "Cold string open-circuit voltage",
                    "detail": "Voc and its temperature coefficient are required",
                }
            )
        else:
            voltage = (
                n * m.voc_v * (1 + m.beta_voc_per_c * (self.design_min_cell_c - 25))
            )
            limit = min(m.max_system_voltage_v, self.inverter_max_dc_v)
            checks.append(
                {
                    "status": "verified" if voltage <= limit else "failed",
                    "name": "Cold string open-circuit voltage",
                    "detail": f"{voltage:.1f} V / {limit:.0f} V limit",
                }
            )
        if m.beta_vmp_per_c is None:
            checks.append(
                {
                    "status": "unverified",
                    "name": "MPPT operating window",
                    "detail": f"STC Vmp = {n*m.vmp_v:.1f} V; hot/cold Vmp coefficient required",
                }
            )
        else:
            hot = n * m.vmp_v * (1 + m.beta_vmp_per_c * (self.design_max_cell_c - 25))
            cold = n * m.vmp_v * (1 + m.beta_vmp_per_c * (self.design_min_cell_c - 25))
            checks.append(
                {
                    "status": (
                        "verified"
                        if hot >= self.inverter_mppt_min_v
                        and cold <= self.inverter_mppt_max_v
                        else "failed"
                    ),
                    "name": "MPPT operating window",
                    "detail": f"{hot:.1f}–{cold:.1f} V",
                }
            )
        if m.isc_a is None or self.inverter_max_input_a is None:
            checks.append(
                {
                    "status": "unverified",
                    "name": "Input current compatibility",
                    "detail": "Module Isc and inverter current limit required; no code sizing certification",
                }
            )
        else:
            current = m.isc_a * self.strings_per_inverter
            checks.append(
                {
                    "status": (
                        "verified" if current <= self.inverter_max_input_a else "failed"
                    ),
                    "name": "STC input current",
                    "detail": f"{current:.1f} A; design safety factors not assessed",
                }
            )
        implied = m.rated_power_w / (m.width_m * m.length_m * 1000)
        checks.append(
            {
                "status": (
                    "verified" if abs(implied - m.efficiency) < 0.005 else "warning"
                ),
                "name": "Module area and efficiency",
                "detail": f"Area-implied efficiency {implied*100:.2f}%; entered {m.efficiency*100:.2f}%",
            }
        )
        return checks


FAULT_TYPES = Literal[
    "string_disconnect",
    "string_underperformance",
    "inverter_outage",
    "inverter_efficiency",
    "local_soiling",
    "uniform_soiling",
    "partial_shading",
    "temperature",
    "curtailment",
    "sensor_bias",
    "degradation",
]


class Fault(BaseModel):
    id: str = Field("fault-1", max_length=100)
    kind: FAULT_TYPES = "inverter_outage"
    target: Literal["plant", "inverter", "string"] = "inverter"
    target_index: int = Field(0, ge=0)
    severity: float = Field(1, ge=0, le=1)
    start_hour: int = Field(0, ge=0, lt=8760)
    duration_hours: int = Field(8760, ge=1, le=8760)
    repair_cost: float = Field(300, ge=0)
    safety_critical: bool = False


class Soiling(BaseModel):
    initial_loss: float = Field(0.01, ge=0, le=0.3)
    daily_rate: float = Field(0.0007, ge=0, le=0.02)
    strategy: Literal["none", "fixed", "threshold", "manual"] = "fixed"
    interval_days: int = Field(60, ge=1, le=365)
    threshold: float = Field(0.05, gt=0, le=0.3)
    cleaning_days: list[int] = Field(default_factory=list, max_length=365)
    rain_mode: Literal["none", "epw", "illustrative"] = "none"
    illustrative_rain_days: list[int] = Field(default_factory=list, max_length=365)
    rain_threshold_mm: float = Field(6, gt=0)

    @model_validator(mode="after")
    def dates(self):
        if any(
            d < 0 or d > 364 for d in self.cleaning_days + self.illustrative_rain_days
        ):
            raise ValueError("Cleaning and rainfall days must be 0–364")
        return self


class Finance(BaseModel):
    currency: str = Field("USD", min_length=1, max_length=12)
    price_per_kwh: float = Field(0.06, ge=0, le=100)
    hourly_prices: list[float] | None = Field(None, min_length=8760, max_length=8760)
    capex: float = Field(1800000, ge=0)
    annual_opex: float = Field(30000, ge=0)
    cleaning_cost: float = Field(450, ge=0)
    water_m3_per_clean: float = Field(12, ge=0)
    cleaning_labour_cost: float = Field(250, ge=0)
    cleaning_equipment_cost: float = Field(200, ge=0)
    replacement_cost: float = Field(120000, ge=0)
    replacement_year: int = Field(13, ge=1, le=50)
    discount_rate: float = Field(0.08, ge=0, le=0.5)
    horizon_years: int = Field(25, ge=1, le=50)
    cost_escalation: float = Field(0.02, ge=0, le=0.3)
    price_escalation: float = Field(0.01, ge=-0.1, le=0.3)
    repair_delay_days: int = Field(7, ge=0, le=365)
    repair_budget: float = Field(10000, ge=0)
    max_repairs: int = Field(5, ge=1, le=100)


class Scenario(BaseModel):
    schema_version: int = 1
    id: str = Field("reference", pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    name: str = Field("Healthy reference", min_length=1, max_length=100)
    weather_id: str = Field("arak", pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    plant: Plant = Field(default_factory=Plant)
    soiling: Soiling = Field(default_factory=Soiling)
    finance: Finance = Field(default_factory=Finance)
    faults: list[Fault] = Field(default_factory=list, max_length=50)
    ambient_offset_c: float = Field(0, ge=-20, le=30)
    resource_factor: float = Field(1, ge=0.5, le=1.5)
    seed: int = Field(42, ge=0, le=2**32 - 1)

    @model_validator(mode="after")
    def targets(self):
        if len({f.id for f in self.faults}) != len(self.faults):
            raise ValueError("Fault identifiers must be unique within a scenario")
        for fault in self.faults:
            limit = (
                self.plant.inverter_count
                if fault.target == "inverter"
                else self.plant.inverter_count * self.plant.strings_per_inverter
            )
            if fault.target != "plant" and fault.target_index >= limit:
                raise ValueError(
                    f"Fault {fault.id} targets equipment outside the configured topology"
                )
            if (
                fault.kind in {"inverter_outage", "inverter_efficiency"}
                and fault.target == "string"
            ):
                raise ValueError("An inverter fault must target an inverter or plant")
            if fault.kind in {"curtailment", "sensor_bias"} and fault.target != "plant":
                raise ValueError(
                    "Grid curtailment and plant sensor bias require a plant target"
                )
        if self.finance.hourly_prices and min(self.finance.hourly_prices) < 0:
            raise ValueError("This financial model requires nonnegative prices")
        return self


def presets() -> list[Scenario]:
    base = Scenario()
    entries = [base]

    def add(id, name, **updates):
        raw = base.model_dump()
        raw.update(id=id, name=name, **updates)
        entries.append(Scenario.model_validate(raw))

    add("hot", "Higher ambient temperature", ambient_offset_c=8)
    add(
        "albedo",
        "Brighter ground",
        plant=base.plant.model_copy(update={"albedo": 0.5}).model_dump(),
    )
    add(
        "soiling",
        "No scheduled cleaning",
        soiling=base.soiling.model_copy(
            update={"strategy": "none", "daily_rate": 0.001}
        ).model_dump(),
    )
    for id, name, kind, target, severity in [
        ("string-fault", "String disconnection", "string_disconnect", "string", 1),
        ("inverter-fault", "Inverter outage", "inverter_outage", "inverter", 1),
        ("curtailed", "Grid export restriction", "curtailment", "plant", 0.3),
    ]:
        add(
            id,
            name,
            faults=[
                Fault(id=id, kind=kind, target=target, severity=severity).model_dump()
            ],
        )
    add(
        "fixed-cleaning",
        "Cleaning every 30 days",
        soiling=base.soiling.model_copy(update={"interval_days": 30}).model_dump(),
    )
    add(
        "optimise-cleaning",
        "Economic cleaning candidate",
        soiling=base.soiling.model_copy(update={"strategy": "none"}).model_dump(),
    )
    add(
        "aged",
        "Year 20 degradation",
        plant=base.plant.model_copy(update={"operating_year": 20}).model_dump(),
    )
    return entries
