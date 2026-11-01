"""Transparent decision support; synthetic diagnostic evidence is not field validation."""

import numpy as np
import numpy_financial as npf
import pandas as pd
from scipy.optimize import milp, Bounds, LinearConstraint

from .config import Scenario
from .engine import Run, simulate, soil_profile, delivered_for_soiling, cleaning_days


def finance(run: Run) -> dict:
    s, f = run.scenario, run.scenario.finance
    years = np.arange(1, f.horizon_years + 1)
    energy = run.summary["annual_energy_kwh"] * (1 - s.plant.annual_degradation) ** (
        years - 1
    )
    revenue = (
        run.summary["gross_value"]
        * (1 - s.plant.annual_degradation) ** (years - 1)
        * (1 + f.price_escalation) ** (years - 1)
    )
    cleaning = len(run.summary["cleaning_days"]) * f.cleaning_cost
    repair = sum(x.repair_cost for x in s.faults if x.kind != "sensor_bias")
    opex = (f.annual_opex + cleaning) * (1 + f.cost_escalation) ** (years - 1)
    replacement = np.where(
        years == f.replacement_year,
        f.replacement_cost * (1 + f.cost_escalation) ** (years - 1),
        0,
    )
    costs = opex + replacement
    costs[0] += repair
    cash = np.r_[-f.capex, revenue - costs]
    discounted = cash / (1 + f.discount_rate) ** np.arange(len(cash))
    cumulative = np.cumsum(discounted)
    crossings = np.flatnonzero(cumulative >= 0)
    payback = None
    if len(crossings):
        i = int(crossings[0])
        payback = 0 if i == 0 else i - 1 + (-cumulative[i - 1]) / discounted[i]
    discounted_cost = f.capex + np.sum(costs / (1 + f.discount_rate) ** years)
    discounted_energy = np.sum(energy / (1 + f.discount_rate) ** years)
    return {
        "currency": f.currency,
        "assumption_type": "Illustrative editable costs and electricity values; no official tariff claim",
        "npv": float(npf.npv(f.discount_rate, cash)),
        "lcoe_per_kwh": (
            float(discounted_cost / discounted_energy)
            if discounted_energy > 0
            else None
        ),
        "discounted_payback_years": payback,
        "annual_gross_value": run.summary["gross_value"],
        "annual_opex": float(costs[0]),
        "annual_net_cash": float(cash[1]),
        "degradation_lifetime_value_loss": float(
            np.sum(
                run.summary["gross_value"] * (1 + f.price_escalation) ** (years - 1)
                - revenue
            )
        ),
        "cashflows": [
            {
                "year": int(y),
                "cash": float(cf),
                "discounted_cash": float(d),
                "cumulative_discounted_cash": float(c),
                "energy_kwh": float(energy[y - 1]) if y else 0,
            }
            for y, (cf, d, c) in enumerate(zip(cash, discounted, cumulative))
        ],
    }


def diagnostics(run: Run, reference: Run | None = None) -> dict:
    raw = run.scenario.model_dump()
    raw["faults"] = []
    healthy = reference or simulate(Scenario.model_validate(raw), run.weather)
    expected, observed = (
        healthy.frame.ac_power_kw.to_numpy(),
        run.frame.observed_ac_kw.to_numpy(),
    )
    valid = expected > max(10, run.summary["ac_capacity_kw"] * 0.03)
    residual = np.divide(observed - expected, expected, out=np.zeros(8760), where=valid)
    abnormal = valid & (np.abs(residual) > 0.03)
    # Require three consecutive valid hourly anomalies; gaps overnight reset the detector.
    persistent = pd.Series(abnormal).rolling(3).sum().fillna(0).to_numpy() == 3
    episodes = []
    starts = np.flatnonzero(persistent & ~np.r_[False, persistent[:-1]])
    for start in starts:
        end = int(start) + 1
        while end < 8760 and abnormal[end]:
            end += 1
        first = max(0, int(start) - 2)
        episodes.append(
            {
                "start_hour": first,
                "end_hour": end,
                "onset": str(run.frame.index[first]),
                "mean_residual": float(residual[first:end].mean()),
                "lost_kwh": float(
                    np.maximum(
                        expected[first:end]
                        - run.frame.ac_power_kw.to_numpy()[first:end],
                        0,
                    ).sum()
                ),
                "classification": "Inferred power anomaly; cause unresolved",
            }
        )
    candidates = []
    for fault in run.scenario.faults:
        repaired = run.scenario.model_dump()
        repaired["faults"] = [x for x in repaired["faults"] if x["id"] != fault.id]
        alternative = simulate(Scenario.model_validate(repaired), run.weather)
        delta = np.maximum(
            alternative.frame.ac_power_kw.to_numpy() - run.frame.ac_power_kw.to_numpy(),
            0,
        )
        delay_hour = min(
            8760, fault.start_hour + run.scenario.finance.repair_delay_days * 24
        )
        repair_delta = delta.copy()
        repair_delta[:delay_hour] = 0
        prices = (
            np.asarray(run.scenario.finance.hourly_prices)
            if run.scenario.finance.hourly_prices
            else run.scenario.finance.price_per_kwh
        )
        value = float(np.sum(repair_delta * prices))
        target = (
            "Plant"
            if fault.target == "plant"
            else (
                f"INV-{fault.target_index+1:02d}"
                if fault.target == "inverter"
                else f"S-{fault.target_index+1:03d}"
            )
        )
        candidates.append(
            {
                "fault_id": fault.id,
                "kind": fault.kind,
                "target": target,
                "target_type": fault.target,
                "target_index": fault.target_index,
                "severity": fault.severity,
                "start_hour": fault.start_hour,
                "duration_hours": fault.duration_hours,
                "lost_energy_kwh": float(delta.sum()),
                "recoverable_energy_kwh": float(repair_delta.sum()),
                "recoverable_value": value,
                "repair_cost": fault.repair_cost,
                "net_repair_value": value - fault.repair_cost,
                "safety_critical": fault.safety_critical,
                "classification": "Known injected event (synthetic ground truth)",
                "confidence": "No field-validated diagnostic probability",
                "evidence": "Counterfactual physical rerun removes this event; interactions retained. Event attribution is not additive.",
                "inspection": "Qualified electrical inspection; confirm isolation, current, voltage and sensor calibration before attributing a cause",
                "repaired_daily_kwh": alternative.frame.ac_energy_kwh.resample("D")
                .sum()
                .to_list(),
            }
        )
    selected = []
    if candidates:
        benefit = np.array([c["net_repair_value"] for c in candidates])
        costs = np.array([c["repair_cost"] for c in candidates])
        safety = np.array([c["safety_critical"] for c in candidates], dtype=float)
        # Mandatory safety items override the economic resource budget, shown explicitly.
        remaining_budget = max(
            0, run.scenario.finance.repair_budget - float(costs @ safety)
        )
        available = 1 - safety
        constraint = LinearConstraint(
            np.vstack([costs * available, available]),
            [0, 0],
            [
                remaining_budget,
                max(0, run.scenario.finance.max_repairs - int(safety.sum())),
            ],
        )
        result = milp(
            -benefit * available,
            integrality=np.ones(len(candidates)),
            bounds=Bounds(safety, np.ones(len(candidates))),
            constraints=constraint,
            options={"time_limit": 10},
        )
        chosen = result.x if result.success else safety
        selected = [c["fault_id"] for c, x in zip(candidates, chosen) if x > 0.5]
    candidates.sort(key=lambda c: (not c["safety_critical"], -c["net_repair_value"]))
    peers = run.string_dc_kw.reshape(
        8760, run.scenario.plant.inverter_count, run.scenario.plant.strings_per_inverter
    )
    peer_median = np.median(peers, axis=2, keepdims=True)
    peer_ratios = np.divide(
        peers, peer_median, out=np.ones_like(peers), where=peer_median > 0.1
    )
    return {
        "episodes": episodes,
        "candidates": candidates,
        "selected_repairs": selected,
        "normalised_residual": residual.tolist(),
        "healthy_ac_kw": expected.tolist(),
        "mean_peer_ratio": peer_ratios.mean(axis=0).reshape(-1).tolist(),
        "total_lost_kwh": float(
            np.maximum(expected - run.frame.ac_power_kw.to_numpy(), 0).sum()
        ),
        "detector": "3 consecutive daylight hours with >3% normalised residual; peer string medians are supplementary evidence",
        "limitations": "Synthetic events are not independent detector validation. Several causes share a power signature. Safety-critical interventions take priority over economics; this model does not replace qualified electrical inspection.",
    }


def optimise_cleaning(
    run: Run, min_interval: int = 14, max_operations: int = 12
) -> dict:
    """Exact daily finite-horizon segmentation DP, evaluated through AC constraints."""
    s = run.scenario
    price = (
        np.asarray(s.finance.hourly_prices)
        if s.finance.hourly_prices
        else np.full(8760, s.finance.price_per_kwh)
    )
    no_soil = soil_profile(s, run.weather, [])
    no_ac = delivered_for_soiling(run, no_soil)
    # After a wash, Kimber's state is independent of all earlier manual washes.
    base_profit = (no_ac * price).reshape(365, 24).sum(axis=1)
    initial_prefix = np.r_[0, np.cumsum(base_profit)]
    prefixes = np.zeros((365, 366))
    for d in range(365):
        ac = delivered_for_soiling(run, soil_profile(s, run.weather, [d]))
        prefixes[d, 1:] = np.cumsum((ac * price).reshape(365, 24).sum(axis=1))
    # State is (number of washes, most recent wash day); edges are wash-free segments.
    dp = np.full((max_operations + 1, 365), -np.inf)
    back = np.full((max_operations + 1, 365), -1, dtype=int)
    dp[1] = initial_prefix[:365] - s.finance.cleaning_cost
    for k in range(2, max_operations + 1):
        for d in range(min_interval, 365):
            previous = np.arange(0, d - min_interval + 1)
            scores = (
                dp[k - 1, previous]
                + prefixes[previous, d]
                - prefixes[previous, previous]
                - s.finance.cleaning_cost
            )
            best = int(np.argmax(scores))
            dp[k, d], back[k, d] = scores[best], previous[best]
    tail = prefixes[:, 365] - prefixes[np.arange(365), np.arange(365)]
    final = dp[1:] + tail[None, :]
    best_value = float(np.max(final))
    dates = []
    if best_value > initial_prefix[-1]:
        ki, d = np.unravel_index(np.argmax(final), final.shape)
        k = int(ki) + 1
        while k > 0:
            dates.append(int(d))
            d, k = int(back[k, d]), k - 1
    dates.sort()
    strategies = {
        "No cleaning": [],
        "Fixed interval": list(
            range(s.soiling.interval_days, 365, s.soiling.interval_days)
        ),
        "Threshold": [],
    }
    threshold_scenario = s.model_copy(deep=True)
    threshold_scenario.soiling.strategy = "threshold"
    strategies["Threshold"] = cleaning_days(threshold_scenario, run.weather)
    strategies["Economic optimum"] = dates
    rows = []
    for label, days in strategies.items():
        soil = soil_profile(s, run.weather, days)
        energy = delivered_for_soiling(run, soil)
        recovered = energy - no_ac
        gross = float(np.sum(recovered * price))
        cost = len(days) * s.finance.cleaning_cost
        rows.append(
            {
                "strategy": label,
                "cleaning_days": days,
                "operations": len(days),
                "energy_kwh": float(energy.sum()),
                "recovered_kwh": float(recovered.sum()),
                "incremental_value": gross,
                "cleaning_cost": cost,
                "net_benefit": gross - cost,
                "water_m3": len(days) * s.finance.water_m3_per_clean,
                "daily_soiling": soil.reshape(365, 24).mean(axis=1).tolist(),
                "daily_energy_kwh": energy.reshape(365, 24).sum(axis=1).tolist(),
            }
        )
    return {
        "strategies": rows,
        "recommended_days": dates,
        "minimum_interval_days": min_interval,
        "maximum_operations": max_operations,
        "method": "Daily finite-horizon dynamic programme; every candidate uses constrained deliverable AC, Kimber rainfall state and time-varying prices. Temperature is held at incident-irradiance model values.",
        "cost_breakdown": {
            "total_per_operation": s.finance.cleaning_cost,
            "labour_assumption": s.finance.cleaning_labour_cost,
            "equipment_assumption": s.finance.cleaning_equipment_cost,
        },
        "limitations": "Perfect foresight of one typical year; homogeneous plant-wide cleaning; no site-validated dust/rain parameters. Labour/equipment fields describe the editable total; water is reported, not priced separately.",
    }


UNCERTAINTY_DEFAULTS = {
    "resource": 0.03,
    "module_power": 0.015,
    "thermal_u0": 0.1,
    "soiling_rate": 0.25,
    "bifaciality": 0.05,
    "availability": 0.003,
    "inverter_efficiency": 0.005,
    "price": 0.1,
    "cleaning_cost": 0.15,
    "repair_cost": 0.2,
}


def perturb(s: Scenario, factors: dict[str, float]) -> Scenario:
    raw = s.model_dump()
    p, f, soil = raw["plant"], raw["finance"], raw["soiling"]
    raw["resource_factor"] = float(
        np.clip(raw["resource_factor"] * factors.get("resource", 1), 0.5, 1.5)
    )
    p["module"]["rated_power_w"] *= factors.get("module_power", 1)
    p["faiman_u0"] = float(
        np.clip(p["faiman_u0"] * factors.get("thermal_u0", 1), 5, 60)
    )
    p["module"]["bifaciality"] = float(
        np.clip(p["module"]["bifaciality"] * factors.get("bifaciality", 1), 0, 1)
    )
    p["availability"] = float(
        np.clip(p["availability"] * factors.get("availability", 1), 0, 1)
    )
    p["inverter_efficiency"] = float(
        np.clip(
            p["inverter_efficiency"] * factors.get("inverter_efficiency", 1), 0.8, 0.999
        )
    )
    soil["daily_rate"] = float(
        np.clip(soil["daily_rate"] * factors.get("soiling_rate", 1), 0, 0.02)
    )
    f["price_per_kwh"] *= factors.get("price", 1)
    if f["hourly_prices"]:
        f["hourly_prices"] = [v * factors.get("price", 1) for v in f["hourly_prices"]]
    f["cleaning_cost"] *= factors.get("cleaning_cost", 1)
    for fault in raw["faults"]:
        fault["repair_cost"] *= factors.get("repair_cost", 1)
    return Scenario.model_validate(raw)


def uncertainty(
    run: Run, samples: int, ranges: dict[str, float], progress=None, cancelled=None
) -> dict:
    rng = np.random.default_rng(run.scenario.seed)
    outputs = []
    for i in range(samples):
        if cancelled is not None and cancelled.is_set():
            from .engine import CancelledRun

            raise CancelledRun("Uncertainty job cancelled")
        factors = {
            key: float(rng.uniform(max(0.01, 1 - width), 1 + width))
            for key, width in ranges.items()
        }
        candidate = simulate(perturb(run.scenario, factors), run.weather)
        outputs.append(
            {
                "sample": i,
                "energy_kwh": candidate.summary["annual_energy_kwh"],
                "gross_value": candidate.summary["gross_value"],
                "npv": finance(candidate)["npv"],
                **factors,
            }
        )
        if progress:
            progress(int(90 * (i + 1) / samples), f"Monte Carlo {i+1}/{samples}")
    energy = np.array([o["energy_kwh"] for o in outputs])
    sensitivities = []
    for key, width in ranges.items():
        low = simulate(perturb(run.scenario, {key: max(0.01, 1 - width)}), run.weather)
        high = simulate(perturb(run.scenario, {key: 1 + width}), run.weather)
        sensitivities.append(
            {
                "parameter": key,
                "low_energy_kwh": low.summary["annual_energy_kwh"],
                "high_energy_kwh": high.summary["annual_energy_kwh"],
                "low_npv": finance(low)["npv"],
                "high_npv": finance(high)["npv"],
            }
        )
    sensitivities.sort(
        key=lambda x: abs(x["high_energy_kwh"] - x["low_energy_kwh"]), reverse=True
    )
    return {
        "samples": outputs,
        "seed": run.scenario.seed,
        "ranges": ranges,
        "distribution": "Independent bounded uniform relative factors; no fitted correlations",
        "p50_energy_kwh": float(np.quantile(energy, 0.5)),
        "p90_energy_kwh": float(np.quantile(energy, 0.1)),
        "interval_90": np.quantile(energy, [0.05, 0.95]).tolist(),
        "sensitivity": sensitivities,
        "limitations": "P90 is the 10th percentile under these assumed parameter distributions. A single TMY does not establish site-specific interannual weather variability or bankable P90. No measured detection accuracy is implied.",
    }
