"""Self-contained PDF reports generated only from an existing physical Run."""

from html import escape
import io
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, PolyLine
import numpy as np
import pandas as pd
from .engine import Run
from .analysis import finance

TEAL = colors.HexColor("#168b8e")
INK = colors.HexColor("#294752")
MUTED = colors.HexColor("#78909a")
LINE = colors.HexColor("#dfe9ec")
AMBER = colors.HexColor("#e4b34e")
WIDTH = A4[0] - 84


def text(value) -> str:
    return escape(
        str(value)
        .replace("—", " - ")
        .replace("–", "-")
        .replace("→", "to")
        .replace("−", "-")
        .replace("₀", "0")
        .replace("₁", "1")
    )


def report_pdf(run: Run, analyses: dict) -> bytes:
    stream = io.BytesIO()
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="BodySolar",
            fontName="Helvetica",
            fontSize=9,
            leading=14,
            textColor=INK,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallSolar",
            parent=styles["BodySolar"],
            fontSize=7.5,
            leading=11,
            textColor=MUTED,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CellSolar",
            parent=styles["BodySolar"],
            fontSize=8,
            leading=11,
            spaceAfter=0,
            wordWrap="CJK",
        )
    )
    styles.add(
        ParagraphStyle(
            name="TitleSolar",
            fontName="Helvetica-Bold",
            fontSize=30,
            leading=36,
            textColor=INK,
            spaceAfter=14,
        )
    )
    styles.add(
        ParagraphStyle(
            name="HeadingSolar",
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=21,
            textColor=INK,
            spaceBefore=18,
            spaceAfter=12,
            keepWithNext=True,
        )
    )
    styles.add(
        ParagraphStyle(
            name="EyebrowSolar",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=12,
            textColor=TEAL,
            spaceAfter=10,
        )
    )
    story = []

    def paragraph(value, style="BodySolar"):
        return Paragraph(text(value).replace("\n", "<br/>"), styles[style])

    def add(value, style="BodySolar"):
        story.append(paragraph(value, style))

    def heading(value):
        add(value, "HeadingSolar")

    def table(headers, rows, widths=None):
        values = [[paragraph(h, "CellSolar") for h in headers]] + [
            [paragraph(v, "CellSolar") for v in row] for row in rows
        ]
        result = Table(
            values,
            colWidths=widths or [WIDTH / len(headers)] * len(headers),
            repeatRows=1,
            hAlign="LEFT",
        )
        result.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef6f5")),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f8fafb")],
                    ),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.7, LINE),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.25, LINE),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 9),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.extend([result, Spacer(1, 10)])

    def chart(values, labels, title, colour=TEAL):
        drawing = Drawing(WIDTH, 195)
        maximum = max(max(values, default=0), 1)
        left, bottom, chart_width, chart_height = 44, 32, WIDTH - 55, 130
        for tick in range(5):
            y = bottom + chart_height * tick / 4
            drawing.add(Line(left, y, WIDTH - 8, y, strokeColor=LINE, strokeWidth=0.5))
            drawing.add(
                String(
                    left - 7,
                    y - 2,
                    f"{maximum*tick/4:,.0f}",
                    textAnchor="end",
                    fontName="Helvetica",
                    fontSize=7,
                    fillColor=MUTED,
                )
            )
        spacing = chart_width / max(len(values), 1)
        for i, (value, label) in enumerate(zip(values, labels)):
            height = max(0, value) / maximum * chart_height
            drawing.add(
                Rect(
                    left + i * spacing + spacing * 0.2,
                    bottom,
                    spacing * 0.6,
                    height,
                    fillColor=colour,
                    strokeColor=None,
                    rx=2,
                    ry=2,
                )
            )
            drawing.add(
                String(
                    left + (i + 0.5) * spacing,
                    16,
                    str(label),
                    textAnchor="middle",
                    fontName="Helvetica",
                    fontSize=7,
                    fillColor=MUTED,
                )
            )
        drawing.add(
            String(
                left, 183, title, fontName="Helvetica-Bold", fontSize=9, fillColor=INK
            )
        )
        story.append(drawing)

    def cash_chart(values):
        drawing = Drawing(WIDTH, 190)
        minimum, maximum = min(min(values), 0), max(max(values), 1)
        span = max(maximum - minimum, 1)
        points = [
            (
                40 + i * (WIDTH - 55) / (len(values) - 1),
                25 + (value - minimum) / span * 130,
            )
            for i, value in enumerate(values)
        ]
        zero_y = 25 - minimum / span * 130
        drawing.add(
            Line(40, zero_y, WIDTH - 10, zero_y, strokeColor=LINE, strokeWidth=0.8)
        )
        drawing.add(PolyLine(points, strokeColor=TEAL, strokeWidth=2))
        drawing.add(
            String(
                40,
                175,
                "Cumulative discounted cash flow",
                fontName="Helvetica-Bold",
                fontSize=9,
                fillColor=INK,
            )
        )
        for i in [0, len(values) // 2, len(values) - 1]:
            drawing.add(
                String(
                    points[i][0],
                    10,
                    f"Year {i}",
                    textAnchor="middle",
                    fontSize=7,
                    fillColor=MUTED,
                )
            )
        drawing.add(
            String(
                32,
                25,
                f"{minimum/1000:,.0f}k",
                textAnchor="end",
                fontSize=7,
                fillColor=MUTED,
            )
        )
        drawing.add(
            String(
                32,
                152,
                f"{maximum/1000:,.0f}k",
                textAnchor="end",
                fontSize=7,
                fillColor=MUTED,
            )
        )
        story.append(drawing)

    s, p, f = run.summary, run.scenario.plant, finance(run)
    add("SOLAR FIELD / PHOTOVOLTAIC INTELLIGENCE", "EyebrowSolar")
    add("Typical-year performance\nand decision report", "TitleSolar")
    add(run.scenario.name)
    add(
        f"Run {run.id} | Model {run.metadata['model_version']} | {run.metadata['created_at_utc'][:10]}",
        "SmallSolar",
    )
    story.append(Spacer(1, 14))
    table(
        ["Annual delivered energy", "Front-reference PR", "Installed DC capacity"],
        [
            [
                f"{s['annual_energy_kwh']/1000:,.2f} MWh",
                f"{s['performance_ratio']*100:.2f}%",
                f"{s['dc_capacity_kw']:,.1f} kWp",
            ]
        ],
    )
    heading("Executive summary")
    add(
        "This report describes an illustrative photovoltaic installation using Arak typical meteorological year weather. All generation, equipment values and diagnostic demonstrations are modelled. They are not historical plant measurements or evidence of a monitored commercial project."
    )
    add(
        f"The integer topology contains {s['module_count']:,} modules, {s['string_count']} strings and {s['inverter_count']} inverters. Annual delivered energy is {s['annual_energy_kwh']/1000:,.2f} MWh, specific yield {s['specific_yield_kwh_kwp']:,.1f} kWh/kWp and AC capacity factor {s['capacity_factor']*100:.2f}%."
    )
    add(
        "The performance ratio uses shaded front POA as the reference and includes bifacial contribution. Costs and electricity prices are illustrative assumptions. A single TMY does not establish historical output or site-specific interannual P90.",
        "SmallSolar",
    )
    chart(
        [m["ac_energy_kwh"] / 1000 for m in s["monthly"]],
        [m["label"] for m in s["monthly"]],
        "Monthly delivered electricity (MWh)",
    )
    story.append(PageBreak())
    heading("Plant configuration and equipment")
    table(
        ["Parameter", "Configured value"],
        [
            [
                "DC / AC capacity",
                f"{p.dc_capacity_kw:,.2f} kWp / {s['ac_capacity_kw']:,.2f} kW",
            ],
            [
                "Integer topology",
                f"{p.modules_per_string} modules/string x {p.strings_per_inverter} strings/inverter x {p.inverter_count} inverters",
            ],
            [
                "Module reference",
                f"{p.module.rated_power_w} Wp; {p.module.width_m} x {p.module.length_m} m; efficiency {p.module.efficiency*100:.2f}%",
            ],
            [
                "Module electrical inputs",
                f"Vmp {p.module.vmp_v} V; power coefficient {p.module.gamma_pdc*100:.3f}%/°C; maximum system voltage {p.module.max_system_voltage_v} V",
            ],
            ["Module parameter provenance", p.module.parameter_source],
            [
                "Orientation and geometry",
                f"Tilt {p.tilt_deg}°; azimuth {p.azimuth_deg}°; row pitch {p.row_pitch_m} m; lower-edge clearance {p.clearance_m} m; GCR {p.gcr:.4f}",
            ],
            [
                "Bifacial configuration",
                f"Enabled: {p.module.bifacial}; bifaciality {p.module.bifaciality}; albedo {p.albedo}; rear structure loss {p.rear_structure_loss}",
            ],
            [
                "Inverter",
                f"{p.inverter_ac_kw} kW each, nominal efficiency {p.inverter_efficiency*100:.2f}%; DC/AC {s['dc_ac_ratio']:.4f}",
            ],
            [
                "Operational assumptions",
                f"DC wiring {p.dc_loss*100:.2f}%; AC wiring {p.ac_loss*100:.2f}%; expected availability {p.availability*100:.2f}%; export cap {p.export_limit_kw} kW (None means unlimited)",
            ],
            ["Plant reference coordinates", str(run.metadata["plant_location"])],
        ],
        [160, WIDTH - 160],
    )
    table(
        ["Electrical constraint", "Status", "Evidence"],
        [[c["name"], c["status"], c["detail"]] for c in s["constraints"]],
        [140, 70, WIDTH - 210],
    )
    heading("Meteorological data provenance")
    table(
        ["Provenance field", "Value"],
        [
            [
                "Station",
                f"{run.weather.metadata['city']}, WMO {run.weather.metadata['WMO_code']}; latitude {run.weather.metadata['latitude']}, longitude {run.weather.metadata['longitude']}, elevation {run.weather.metadata['altitude']} m",
            ],
            ["Source URL", run.metadata["weather"]["source_url"]],
            ["Downloaded/uploaded UTC", run.metadata["weather"]["downloaded_at_utc"]],
            ["EPW SHA-256", run.metadata["weather"]["epw_sha256"]],
            [
                "Archive SHA-256",
                run.metadata["weather"].get(
                    "archive_sha256", "User-uploaded EPW; no archive"
                ),
            ],
            [
                "Quality gate",
                f"{run.weather.quality['hours']} hourly records; {run.weather.quality['flagged_hours']} flagged hours",
            ],
            ["Timestamp convention", run.weather.quality["timestamp_convention"]],
        ],
        [145, WIDTH - 145],
    )
    for issue in run.weather.quality["issues"]:
        add(issue, "SmallSolar")
    add(
        "Weather station coordinates initialise a separately configurable plant reference location. Appropriate site-specific resource information is required for a site resource assessment.",
        "SmallSolar",
    )
    story.append(PageBreak())
    heading("Scientific calculation chain")
    table(
        ["Stage", "Implementation and boundary"],
        [
            [
                "Solar position",
                "pvlib NREL SPA at hourly midpoint; apparent zenith, azimuth, elevation and angle of incidence. Daily SPA sunrise/sunset retained. Night generation is zero.",
            ],
            [
                "Irradiance",
                "Hay-Davies unshaded POA; infinite-sheds shaded front/rear irradiance. Restricted sky and ground view factors; long parallel rows on flat terrain. IAM = 1.",
            ],
            [
                "Temperature",
                f"{p.temperature_model}; Faiman U0={p.faiman_u0}, U1={p.faiman_u1}; module-to-cell deltaT={p.cell_delta_t_c}°C at 1000 W/m², or documented Sandia open-rack parameters.",
            ],
            [
                "DC",
                f"pvlib {p.module.electrical_model}; common irradiance with string-resolved reduced-order faults. Module outputs are allocated uniformly from strings.",
            ],
            [
                "Inverter and grid",
                "Per-inverter PVWatts conversion and rated clipping; explicit outage, expected availability, AC wiring and export cap. Plant equals the sum of delivered inverter output.",
            ],
            [
                "Soiling",
                f"Kimber; initial loss {run.scenario.soiling.initial_loss}; daily rate {run.scenario.soiling.daily_rate}; rain mode {run.scenario.soiling.rain_mode}. Rain grace period 14 days; manual resets have no grace.",
            ],
            [
                "Performance",
                "Yf = delivered kWh / installed kWp; Yr = front POA kWh/m² / 1 kW/m²; PR = Yf/Yr. Front-reference convention includes bifacial contribution.",
            ],
            [
                "Decisions",
                "Cleaning uses constrained future AC and finite-horizon dynamic programming. Maintenance uses event-removal counterfactuals and binary HiGHS selection; safety flags override economics.",
            ],
            [
                "Economics and uncertainty",
                "NPV uses time-zero capex and year-end net cash. LCOE discounts both costs and delivered energy. Seeded bounded parameter sampling reruns the physical model.",
            ],
        ],
        [110, WIDTH - 110],
    )
    add(
        "PVWatts v5: Pdc = Pstc x Geff/1000 x [1 + gamma x (Tcell - 25)]. Faiman: Tmodule = Tambient + Gincident/(U0 + U1 x wind). Cell correction: Tcell = Tmodule + deltaT x Gincident/1000. Irradiance is W/m² and gamma is °C^-1. Complete library implementations supply the numerical outputs.",
        "SmallSolar",
    )
    heading("Monthly energy and solar resource")
    table(
        ["Month", "AC MWh", "DC MWh", "Front POA kWh/m²", "Ambient °C"],
        [
            [
                m["label"],
                f"{m['ac_energy_kwh']/1000:,.2f}",
                f"{m['dc_power_kw']/1000:,.2f}",
                f"{m['poa_front_w_m2']/1000:,.1f}",
                f"{m['ambient_temp_c']:.1f}",
            ]
            for m in s["monthly"]
        ],
        [60, 80, 80, 145, WIDTH - 365],
    )
    heading("Energy loss accounting")
    table(
        ["Sequential mechanism", "MWh"],
        [
            [k.replace("_kwh", "").replace("_", " "), f"{v/1000:,.4f}"]
            for k, v in s["losses_kwh"].items()
        ],
        [WIDTH - 100, 100],
    )
    add(
        f"Reference {s['reference_energy_kwh']/1000:,.4f} MWh + bifacial gain - signed sequential losses = delivered AC {s['annual_energy_kwh']/1000:,.4f} MWh. Clipping is {s['clipping_loss_kwh']/1000:,.3f} MWh and is already included in inverter loss. Maximum hourly accounting residual: {s['max_accounting_residual_kwh']:.3g} kWh. DC model response separates the single-diode irradiance response from pure temperature effects; it is numerically zero for linear PVWatts.",
        "SmallSolar",
    )
    story.append(PageBreak())
    heading("Fault diagnostics and maintenance decisions")
    d = analyses.get("diagnostics")
    if d:
        add(
            f"Lost deliverable electricity compared with the healthy counterfactual: {d['total_lost_kwh']/1000:,.3f} MWh. Residual episodes: {len(d['episodes'])}. Detector: {d['detector']}."
        )
        if d["candidates"]:
            table(
                [
                    "Equipment / event",
                    "Lost MWh",
                    "Recoverable MWh",
                    "Net repair value",
                    "Priority",
                ],
                [
                    [
                        c["target"] + " / " + c["kind"],
                        f"{c['lost_energy_kwh']/1000:,.3f}",
                        f"{c['recoverable_energy_kwh']/1000:,.3f}",
                        f"{c['net_repair_value']:,.2f}",
                        (
                            "Safety"
                            if c["safety_critical"]
                            else (
                                "Selected"
                                if c["fault_id"] in d["selected_repairs"]
                                else "Deferred"
                            )
                        ),
                    ]
                    for c in d["candidates"]
                ],
                [145, 75, 90, 105, WIDTH - 415],
            )
        else:
            add(
                "No injected faults in this scenario. No repair benefit or diagnostic accuracy is inferred."
            )
        add(d["limitations"], "SmallSolar")
    else:
        add(
            "Diagnostics have not been executed for this run. No maintenance result is inferred."
        )
    heading("Cleaning schedule optimisation")
    c = analyses.get("cleaning")
    if c:
        table(
            ["Strategy", "Operations", "Recovered MWh", "Cost", "Net benefit"],
            [
                [
                    x["strategy"],
                    x["operations"],
                    f"{x['recovered_kwh']/1000:,.3f}",
                    f"{x['cleaning_cost']:,.2f}",
                    f"{x['net_benefit']:,.2f}",
                ]
                for x in c["strategies"]
            ],
            [130, 70, 100, 100, WIDTH - 400],
        )
        dates = [
            (run.frame.index[0] + pd.Timedelta(days=day)).strftime("%d %b")
            for day in c["recommended_days"]
        ]
        add(
            "Recommended dates: "
            + (
                ", ".join(dates)
                if dates
                else "No economic cleaning operation under these assumptions"
            )
        )
        add(
            f"Minimum interval {c['minimum_interval_days']} days; maximum {c['maximum_operations']} operations. Per-operation water assumption {run.scenario.finance.water_m3_per_clean} m³. Total operation cost {run.scenario.finance.cleaning_cost} {f['currency']}."
        )
        add(c["method"] + " " + c["limitations"], "SmallSolar")
    else:
        add(
            "Cleaning optimisation has not been executed for this run. No optimal schedule is inferred."
        )
    story.append(PageBreak())
    heading("Financial assessment")
    table(
        ["Indicator", "Result"],
        [
            [
                "Currency and boundary",
                f["currency"] + "; editable illustrative assumptions",
            ],
            ["Year-one gross value", f"{f['annual_gross_value']:,.2f}"],
            ["Year-one operating costs", f"{f['annual_opex']:,.2f}"],
            ["Year-one net operating cash", f"{f['annual_net_cash']:,.2f}"],
            ["NPV", f"{f['npv']:,.2f}"],
            [
                "LCOE",
                (
                    f"{f['lcoe_per_kwh']:.5f} per kWh"
                    if f["lcoe_per_kwh"] is not None
                    else "Undefined: no delivered electricity"
                ),
            ],
            [
                "Discounted payback",
                (
                    f"{f['discounted_payback_years']:.2f} years"
                    if f["discounted_payback_years"] is not None
                    else "Not reached"
                ),
            ],
            [
                "Lifetime degradation value reduction",
                f"{f['degradation_lifetime_value_loss']:,.2f}",
            ],
        ],
        [WIDTH - 185, 185],
    )
    cash_chart([x["cumulative_discounted_cash"] for x in f["cashflows"]])
    add(
        f"Horizon {run.scenario.finance.horizon_years} years; discount {run.scenario.finance.discount_rate*100:.2f}%; annual cost escalation {run.scenario.finance.cost_escalation*100:.2f}%; electricity value escalation {run.scenario.finance.price_escalation*100:.2f}%. Initial capex {run.scenario.finance.capex:,.2f}. Repeated TMY energy degrades at {p.annual_degradation*100:.2f}%/year. Repair costs occur in year one; specified inverter replacement occurs in year {run.scenario.finance.replacement_year}. No official tariff, subsidy or exchange rate is asserted.",
        "SmallSolar",
    )
    story.append(PageBreak())
    heading("Parameter uncertainty and sensitivity")
    u = analyses.get("uncertainty")
    if u:
        table(
            ["P50 MWh", "P90 MWh", "Central 90% interval MWh"],
            [
                [
                    f"{u['p50_energy_kwh']/1000:,.2f}",
                    f"{u['p90_energy_kwh']/1000:,.2f}",
                    f"{u['interval_90'][0]/1000:,.2f} - {u['interval_90'][1]/1000:,.2f}",
                ]
            ],
        )
        add(
            f"Seed {u['seed']}; {len(u['samples'])} physical samples. {u['distribution']}."
        )
        counts, edges = np.histogram(
            [x["energy_kwh"] / 1000 for x in u["samples"]],
            bins=min(8, max(4, int(np.sqrt(len(u["samples"]))))),
        )
        chart(
            counts.tolist(),
            [f"{(a+b)/2:,.0f}" for a, b in zip(edges[:-1], edges[1:])],
            "Energy distribution: count by annual MWh bin",
            colors.HexColor("#9982bc"),
        )
        table(
            ["Parameter", "Relative half-width", "Low-input MWh", "High-input MWh"],
            [
                [
                    x["parameter"],
                    f"+/- {u['ranges'][x['parameter']]*100:.2f}%",
                    f"{x['low_energy_kwh']/1000:,.2f}",
                    f"{x['high_energy_kwh']/1000:,.2f}",
                ]
                for x in u["sensitivity"]
            ],
            [160, 110, 120, WIDTH - 390],
        )
        add(u["limitations"], "SmallSolar")
    else:
        add(
            "Parameter uncertainty has not been executed for this run. No P50/P90 result is inferred."
        )
    story.append(PageBreak())
    heading("Model limitations and reproducibility")
    for assumption in run.metadata["assumptions"]:
        add("- " + assumption, "SmallSolar")
    add(
        "Complete configuration, source checksums and software versions are stored in metadata.json alongside the 8760-row CSV. Camera/playback state does not affect physical calculations. Software versions: "
        + str(run.metadata["software"]),
        "SmallSolar",
    )
    heading("References")
    for reference in [
        "IEC 61724-1:2021, Photovoltaic system performance - Part 1: Monitoring. Terminology used without compliance claim. https://webstore.iec.ch/en/publication/65561",
        "Sandia PVPMC: Performance Ratio. https://pvpmc.sandia.gov/modeling-guide/5-ac-system-output/pv-performance-metrics/performance-ratio/",
        "Dobos (2014). PVWatts Version 5 Manual. NREL/TP-6A20-62641. DOI 10.2172/1158421.",
        "De Soto, Klein and Beckman (2006). Improvement and validation of a model for photovoltaic array performance. Solar Energy 80(1), 78-88. DOI 10.1016/j.solener.2005.06.010.",
        "Faiman (2008). Assessing the outdoor operating temperature of photovoltaic modules. Progress in Photovoltaics 16(4), 307-315. DOI 10.1002/pip.813.",
        "Mikofski et al. (2019). Bifacial Performance Modeling in Large Arrays. IEEE PVSC. DOI 10.1109/PVSC40753.2019.8980572.",
        "Kimber et al. (2006). The Effect of Soiling on Large Grid-Connected Photovoltaic Systems in California and the Southwest Region of the United States. DOI 10.1109/WCPEC.2006.279690.",
        "IEA PVPS Task 13 (2024). Best practice guidelines for the use of economic and technical KPIs. T13-28:2024.",
        "IEA PVPS Task 13 (2026). Digitalisation and Digital Twins in Photovoltaic Systems. T13-34:2026.",
        "Climate.OneBuilding.Org. TMYx source data and methodology. https://climate.onebuilding.org/sources/default.html",
        "pvlib Python implementation documentation. https://pvlib-python.readthedocs.io/ See repository docs/references.md for model-specific links and verification details.",
    ]:
        add(reference, "SmallSolar")

    def page_frame(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.line(42, A4[1] - 28, A4[0] - 42, A4[1] - 28)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(
            42, A4[1] - 20, "SOLAR FIELD / TYPICAL-YEAR ENGINEERING REPORT"
        )
        canvas.drawString(
            42, 24, "MODELLED DATA - NO OPERATIONAL MEASUREMENTS | " + run.id[:12]
        )
        canvas.drawRightString(A4[0] - 42, 24, str(doc.page))
        canvas.restoreState()

    document = SimpleDocTemplate(
        stream,
        pagesize=A4,
        leftMargin=42,
        rightMargin=42,
        topMargin=48,
        bottomMargin=43,
        title="Solar Field - " + run.scenario.name,
        author="Solar Field Twin",
        allowSplitting=1,
    )
    document.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
    return stream.getvalue()
