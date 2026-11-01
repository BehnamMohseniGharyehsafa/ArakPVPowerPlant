"""Numerical exports share the same immutable run as the interface."""

from html import escape
import io
import json
import zipfile
import numpy as np
import pandas as pd
from .engine import Run
from .analysis import finance
from .reports import report_pdf


def results_csv(
    run: Run, start: int = 0, end: int = 8760, aggregation: str = "hourly"
) -> str:
    frame = run.frame.iloc[start:end].copy()
    if aggregation != "hourly":
        numeric = frame.select_dtypes(include="number")
        energy = [
            c for c in numeric if c.endswith("_kwh") and not c.startswith("cumulative")
        ]
        averages = [
            c for c in numeric if c not in energy and not c.startswith("cumulative")
        ]
        frame = frame.resample("D" if aggregation == "daily" else "MS").agg(
            {**{c: "sum" for c in energy}, **{c: "mean" for c in averages}}
        )
        frame.insert(0, "timestamp_local", frame.index.astype(str))
        frame.insert(1, "timestamp_utc", frame.index.tz_convert("UTC").astype(str))
        frame["scenario_id"] = run.scenario.id
    return frame.to_csv(index=False, float_format="%.8f")


def equipment_csv(
    run: Run, level: str, index: int | None = None, start: int = 0, end: int = 8760
) -> str:
    p = run.scenario.plant
    if level == "inverter":
        count = p.inverter_count
        dc = run.string_dc_kw.reshape(8760, count, p.strings_per_inverter).sum(axis=2)
        ac = run.inverter_ac_kw
    else:
        count = p.inverter_count * p.strings_per_inverter
        dc = run.string_dc_kw
        inv_dc = dc.reshape(8760, p.inverter_count, p.strings_per_inverter).sum(axis=2)
        shares = np.divide(
            dc,
            np.repeat(inv_dc, p.strings_per_inverter, axis=1),
            out=np.zeros_like(dc),
            where=np.repeat(inv_dc, p.strings_per_inverter, axis=1) > 0,
        )
        ac = np.repeat(run.inverter_ac_kw, p.strings_per_inverter, axis=1) * shares
    if level == "module":
        if index is None or index < 0 or index >= p.module_count:
            raise ValueError(
                "Module exports require one valid module index; outputs are allocated from its string"
            )
        ids = [index]
    else:
        if index is not None and not 0 <= index < count:
            raise ValueError("Equipment index outside topology")
        ids = [index] if index is not None else list(range(count))
    frames = []
    for id in ids:
        source = id // p.modules_per_string if level == "module" else id
        scale = p.modules_per_string if level == "module" else 1
        frame = pd.DataFrame(
            {
                "timestamp_local": run.frame.timestamp_local.iloc[start:end].to_numpy(),
                "timestamp_utc": run.frame.timestamp_utc.iloc[start:end].to_numpy(),
                "equipment_id": (
                    f"M-{id+1:05d}"
                    if level == "module"
                    else f"INV-{id+1:02d}" if level == "inverter" else f"S-{id+1:03d}"
                ),
                "dc_power_kw": dc[start:end, source] / scale,
                "delivered_ac_energy_kwh": ac[start:end, source] / scale,
                "resolution": (
                    "Allocated from homogeneous string"
                    if level == "module"
                    else (
                        "Modelled"
                        if level == "inverter"
                        else "Modelled DC; AC allocated within inverter"
                    )
                ),
                "scenario_id": run.scenario.id,
                "run_id": run.id,
            }
        )
        frames.append(frame)
    return pd.concat(frames).to_csv(index=False, float_format="%.8f")


def bundle(run: Run, analyses: dict) -> bytes:
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("plant_hourly.csv", results_csv(run))
        z.writestr("plant_daily.csv", results_csv(run, aggregation="daily"))
        z.writestr("plant_monthly.csv", results_csv(run, aggregation="monthly"))
        z.writestr(
            "weather.csv", run.weather.data.to_csv(index_label="timestamp_local")
        )
        z.writestr("inverters.csv", equipment_csv(run, "inverter"))
        z.writestr(
            "faults.csv",
            pd.DataFrame([f.model_dump() for f in run.scenario.faults]).to_csv(
                index=False
            ),
        )
        z.writestr("metadata.json", json.dumps(run.metadata, indent=2))
        z.writestr("finance.json", json.dumps(finance(run), indent=2))
        z.writestr("analysis.json", json.dumps(analyses, indent=2))
        z.writestr("report.html", report_html(run, analyses))
        z.writestr("report.pdf", report_pdf(run, analyses))
        z.writestr(
            "README.txt",
            "One-hour TMY intervals. Energy is kWh and power kW. AC boundary is delivered electricity after availability, wiring and export constraints. Module values are allocated. See metadata.json and report.html for assumptions. Analysis sections are included only when executed for this run. Original weather remains in the local cache.",
        )
    return stream.getvalue()


def report_html(run: Run, analyses: dict) -> str:
    s, f = run.summary, finance(run)

    def table(rows, headers):
        return (
            "<table><thead><tr>"
            + "".join(f"<th>{escape(h)}</th>" for h in headers)
            + "</tr></thead><tbody>"
            + "".join(
                "<tr>" + "".join(f"<td>{escape(str(v))}</td>" for v in row) + "</tr>"
                for row in rows
            )
            + "</tbody></table>"
        )

    months = table(
        [
            (
                m["label"],
                f'{m["ac_energy_kwh"]/1000:,.2f}',
                f'{m["poa_front_w_m2"]/1000:,.1f}',
            )
            for m in s["monthly"]
        ],
        ["Month", "Delivered MWh", "Front POA kWh/m²"],
    )
    bars = (
        "".join(
            f'<rect x="{40+i*42}" y="{180-m["ac_energy_kwh"]/max(x["ac_energy_kwh"] for x in s["monthly"])*145}" width="24" height="{m["ac_energy_kwh"]/max(x["ac_energy_kwh"] for x in s["monthly"])*145}" rx="3" fill="#168c8d"/><text x="{52+i*42}" y="202" text-anchor="middle">{m["label"]}</text>'
            for i, m in enumerate(s["monthly"])
        )
        if s["annual_energy_kwh"]
        else ""
    )
    loss_table = table(
        [
            (k.replace("_kwh", "").replace("_", " "), f"{v/1000:,.3f}")
            for k, v in s["losses_kwh"].items()
        ],
        ["Sequential mechanism", "MWh"],
    )
    analysis_sections = ""
    for key, title in [
        ("diagnostics", "Fault diagnosis and maintenance"),
        ("cleaning", "Cleaning optimisation"),
        ("uncertainty", "Parameter uncertainty"),
    ]:
        body = (
            escape(json.dumps(analyses[key], indent=2)[:25000])
            if key in analyses
            else "This analysis has not been executed for this run. No result is inferred. Use the corresponding application page, then regenerate the report."
        )
        if key == "diagnostics" and key in analyses:
            body = (
                table(
                    [
                        (
                            c["target"],
                            c["kind"],
                            f'{c["lost_energy_kwh"]:,.1f}',
                            f'{c["net_repair_value"]:,.2f}',
                        )
                        for c in analyses[key]["candidates"]
                    ],
                    ["Equipment", "Injected event", "Lost kWh", "Net repair value"],
                )
                + f'<p>{escape(analyses[key]["limitations"])}</p>'
            )
        elif key == "cleaning" and key in analyses:
            body = (
                table(
                    [
                        (
                            c["strategy"],
                            c["operations"],
                            f'{c["recovered_kwh"]/1000:,.2f}',
                            f'{c["net_benefit"]:,.2f}',
                        )
                        for c in analyses[key]["strategies"]
                    ],
                    ["Strategy", "Operations", "Recovered MWh", "Net benefit"],
                )
                + f'<p>{escape(analyses[key]["method"])}</p>'
            )
        elif key == "uncertainty" and key in analyses:
            a = analyses[key]
            body = f'<p>P50: {a["p50_energy_kwh"]/1000:,.2f} MWh. P90: {a["p90_energy_kwh"]/1000:,.2f} MWh. Seed {a["seed"]}.</p><p>{escape(a["limitations"])}</p>'
        analysis_sections += f"<h2>{title}</h2>{body}"
    return f"""<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Solar Field technical report</title><style>body{{font:14px/1.6 system-ui;color:#203d44;max-width:1000px;margin:50px auto;padding:0 30px}}h1{{font-size:38px}}h2{{border-bottom:1px solid #dbe6e9;padding-top:20px}}.eyebrow{{letter-spacing:3px;color:#168c8d}}.metrics{{display:flex;gap:40px;font-size:24px}}table{{border-collapse:collapse;width:100%;margin:15px 0}}td,th{{text-align:left;padding:8px;border-bottom:1px solid #dbe6e9}}pre{{white-space:pre-wrap;font-size:11px;overflow-wrap:anywhere}}svg{{width:100%;max-width:570px}}text{{font-size:11px;fill:#566f77}}@media print{{button{{display:none}}body{{margin:0;font-size:10pt}}h2{{break-after:avoid}}tr{{break-inside:avoid}}}}</style><script src="/report-actions.js" defer></script></head><body><button id="print-report">Print / save as PDF</button><p class="eyebrow">SOLAR FIELD / TECHNICAL REPORT</p><h1>{escape(run.scenario.name)}</h1><p>Run {run.id} · model {run.metadata['model_version']} · {escape(run.metadata['created_at_utc'])}</p><h2>Executive summary</h2><p>Typical-year photovoltaic simulation using Arak EPW meteorology. All production and equipment telemetry are modelled, not measured historical plant operation.</p><div class="metrics"><span>{s['annual_energy_kwh']/1000:,.1f} MWh</span><span>{s['performance_ratio']*100:.2f}% front-reference PR</span><span>{s['specific_yield_kwh_kwp']:,.1f} kWh/kWp</span></div><h2>Plant and equipment</h2><p>{s['module_count']:,} modules · {s['string_count']} strings · {s['inverter_count']} inverters · {s['dc_capacity_kw']:,.1f} kWp DC · {s['ac_capacity_kw']:,.1f} kW AC</p>{table([(c['name'],c['status'],c['detail']) for c in s['constraints']], ['Constraint','Status','Evidence'])}<h2>Weather provenance and quality</h2><pre>{escape(json.dumps(run.metadata['weather'], indent=2))}</pre><p>{escape(run.weather.quality['timestamp_convention'])}</p><p>{escape('; '.join(run.weather.quality['issues']))}</p><h2>Scientific model chain</h2><p>NREL SPA → Hay-Davies transposition and infinite-sheds row shading/front/rear irradiance → {escape(run.scenario.plant.temperature_model)} temperature → {escape(run.scenario.plant.module.electrical_model)} DC → per-inverter PVWatts AC → availability/wiring → export limit. The original one-hour EPW resolution is retained.</p><h2>Monthly delivered energy</h2><svg viewBox="0 0 570 220" role="img" aria-label="Monthly delivered energy">{bars}</svg>{months}<h2>Sequential energy loss accounting</h2>{loss_table}<p>Reference {s['reference_energy_kwh']/1000:,.3f} MWh + bifacial gain − sequential reductions = delivered AC. Clipping ({s['clipping_loss_kwh']/1000:,.3f} MWh) is a subset of inverter losses. Maximum hourly residual: {s['max_accounting_residual_kwh']:.3g} kWh. Temperature effects may be signed.</p><h2>Financial assessment</h2><p>Currency {escape(f['currency'])}. NPV {f['npv']:,.2f}; LCOE {f['lcoe_per_kwh'] if f['lcoe_per_kwh'] is not None else 'undefined'} per kWh; discounted payback {f['discounted_payback_years'] if f['discounted_payback_years'] is not None else 'not reached'} years. Costs and delivered energy are both discounted. These are illustrative assumptions, not an official electricity tariff or investment recommendation.</p>{analysis_sections}<h2>Assumptions and limitations</h2><ul>{''.join('<li>'+escape(a)+'</li>' for a in run.metadata['assumptions'])}</ul><h2>Reproducible configuration</h2><pre>{escape(json.dumps(run.scenario.model_dump(), indent=2))}</pre><h2>References</h2><p>pvlib documentation: <a href="https://pvlib-python.readthedocs.io/">pvlib-python.readthedocs.io</a>; Dobos (2014), PVWatts v5 Manual, DOI 10.2172/1158421; Faiman (2008), DOI 10.1002/pip.813; Mikofski et al. (2019), DOI 10.1109/PVSC40753.2019.8980572; Kimber et al. (2006), DOI 10.1109/WCPEC.2006.279690; Sandia PVPMC performance ratio; Climate.OneBuilding.Org weather source. See repository docs/references.md for verification notes and full bibliography. IEC monitoring terminology is used without a compliance claim.</p></body></html>"""
