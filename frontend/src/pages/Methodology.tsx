import { BookOpen, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { useTwin } from '../state/store';
import { Card, Note } from '../components/UI';
const models = [
  [
    '01',
    'Weather & time',
    'pvlib EPW importer',
    '8760 one-hour intervals, coerced to 2001. EPW interval-end radiation is labelled by interval start; geometry is evaluated 30 minutes into each interval. Local standard time is fixed, without DST.',
  ],
  [
    '02',
    'Solar geometry',
    'NREL Solar Position Algorithm',
    'Apparent zenith, azimuth, elevation and incidence angle from configurable plant coordinates. Night-time irradiance is excluded from generation, while original weather inputs remain available.',
  ],
  [
    '03',
    'Irradiance & row shading',
    'Hay-Davies + infinite sheds',
    'Unshaded POA components are inspected separately. Infinite sheds supplies shaded front/rear irradiance, including restricted sky and ground view factors. Effective irradiance includes bifaciality and rear structure loss once.',
  ],
  [
    '04',
    'Thermal response',
    'Faiman or Sandia',
    'Faiman estimates module temperature using U₀ and U₁. The SAPM cell correction adds ΔT × incident irradiance / 1000. Sandia uses documented open-rack parameters. Wind-height and thermal coefficients are not calibrated to this site.',
  ],
  [
    '05',
    'DC electricity',
    'pvlib PVWatts / optional De Soto',
    'PVWatts uses effective irradiance, rated power and the cell-temperature coefficient. The selected v5 model has a linear irradiance dependence; no unsupported low-light coefficient is invented. De Soto is accepted only with all reference parameters and provenance.',
  ],
  [
    '06',
    'AC electricity',
    'Per-inverter PVWatts',
    'Strings aggregate into their configured inverter. Conversion, clipping, explicit outages, expected availability, AC wiring and export caps determine delivered electricity. Conversion losses are counted once.',
  ],
  [
    '07',
    'Soiling & interventions',
    'Kimber + dynamic programming',
    'Kimber accumulation, a rainfall threshold, 14-day rain grace period and manual resets produce the hourly soiling profile. Daily finite-horizon optimisation evaluates recoverable constrained AC rather than a fixed annual percentage.',
  ],
  [
    '08',
    'Diagnostics & maintenance',
    'Residual evidence + HiGHS',
    'Three consecutive daylight residuals above 3% form a power anomaly. Peer-string medians supplement evidence. Physical event-removal counterfactuals quantify repair value; binary HiGHS selection enforces the budget, with declared safety items mandatory.',
  ],
  [
    '09',
    'Economics & uncertainty',
    'Discounted cash flows + seeded sampling',
    'NPV discounts annual net cash; LCOE discounts both eligible costs and delivered AC energy. Monte Carlo samples independent bounded uniform parameter factors and reruns the physical model. P90 is the 10th percentile under that assumed model.',
  ],
];
const references = [
  [
    'IEC 61724-1:2021',
    'Photovoltaic system performance — Part 1: Monitoring. Terminology only; no compliance claim.',
    'https://webstore.iec.ch/en/publication/65561',
  ],
  [
    'Sandia PVPMC · Performance ratio',
    'Reference yield, final yield and front-irradiance PR convention.',
    'https://pvpmc.sandia.gov/modeling-guide/5-ac-system-output/pv-performance-metrics/performance-ratio/',
  ],
  [
    'Dobos (2014) · PVWatts v5 Manual',
    'DC and inverter model used by the pvlib implementations.',
    'https://doi.org/10.2172/1158421',
  ],
  [
    'De Soto, Klein & Beckman (2006)',
    'Improvement and validation of a model for photovoltaic array performance.',
    'https://doi.org/10.1016/j.solener.2005.06.010',
  ],
  [
    'Faiman (2008)',
    'Assessing the outdoor operating temperature of photovoltaic modules.',
    'https://doi.org/10.1002/pip.813',
  ],
  [
    'Mikofski et al. (2019)',
    'Bifacial Performance Modeling in Large Arrays.',
    'https://doi.org/10.1109/PVSC40753.2019.8980572',
  ],
  [
    'Kimber et al. (2006)',
    'The Effect of Soiling on Large Grid-Connected Photovoltaic Systems in California and the Southwest Region of the United States.',
    'https://doi.org/10.1109/WCPEC.2006.279690',
  ],
  [
    'IEA PVPS Task 13 (2024)',
    'Best practice guidelines for the use of economic and technical KPIs. T13-28:2024.',
    'https://iea-pvps.org/wp-content/uploads/2024/12/IEA-PVPS-T13-28-2024-REPORT-Technical-and-Economic-KPIs.pdf',
  ],
  [
    'IEA PVPS Task 13 (2026)',
    'Digitalisation and Digital Twins in Photovoltaic Systems. T13-34:2026.',
    'https://iea-pvps.org/key-topics/t13-digitalisation-twins-pv-systems-2026/',
  ],
  [
    'Climate.OneBuilding.Org',
    'TMYx methodology, source data and typical-year limitations.',
    'https://climate.onebuilding.org/sources/default.html',
  ],
  [
    'pvlib Python documentation',
    'Implementation equations, input definitions and model assumptions.',
    'https://pvlib-python.readthedocs.io/en/stable/',
  ],
];
export default function Methodology() {
  const { run } = useTwin();
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">OPEN MODELS / EXPLICIT ASSUMPTIONS</div>
          <h1>
            Science you can inspect<span className="title-dot">.</span>
          </h1>
          <p>Established methods, documented boundaries and reproducible results.</p>
        </div>
        <BookOpen className="intro-icon" size={38} />
      </div>
      <div className="method-chain">
        {[
          'EPW',
          'Solar geometry',
          'Front + rear POA',
          'Temperature',
          'String DC',
          'Inverter AC',
          'Delivered energy',
        ].map((m, i) => (
          <div key={m}>
            <small>0{i + 1}</small>
            <b>{m}</b>
            {i < 6 && <ArrowUpRight size={16} />}
          </div>
        ))}
      </div>
      <div className="method-grid">
        {models.map(([number, title, model, description]) => (
          <Card key={number}>
            <div className="method-number">{number}</div>
            <h3>{title}</h3>
            <span className="method-model">{model}</span>
            <p>{description}</p>
          </Card>
        ))}
      </div>
      <Card title="Governing quantities">
        <div className="equation-grid">
          <div>
            <span>PVWatts v5 DC</span>
            <code>Pdc = Pstc × Geff / 1000 × [1 + γ × (Tc − 25)]</code>
            <p>Power in W; irradiance in W/m²; temperature in °C; γ in °C⁻¹.</p>
          </div>
          <div>
            <span>Faiman module temperature</span>
            <code>Tmodule = Tambient + Gincident / (U₀ + U₁ × wind)</code>
            <p>
              Module temperature is corrected to cell temperature using the configurable SAPM ΔT
              term.
            </p>
          </div>
          <div>
            <span>Performance ratio</span>
            <code>PR = (Eac / Pdc,STC) / (Hfront / 1 kW/m²)</code>
            <p>
              One-hour integration. Delivered AC boundary; conventional front-irradiance reference.
            </p>
          </div>
          <div>
            <span>Cleaning value</span>
            <code>Net benefit = Σ(ΔEdelivered,t × price,t) − cleaning costs</code>
            <p>
              Future recovery is evaluated through conversion, clipping, outages and grid
              constraints.
            </p>
          </div>
          <div>
            <span>Discounted economics</span>
            <code>NPV = Σ CFy / (1 + r)ʸ</code>
            <p>LCOE = discounted lifetime eligible costs / discounted lifetime delivered kWh.</p>
          </div>
          <div>
            <span>Energy accounting</span>
            <code>Reference + bifacial gain − sequential losses = delivered AC</code>
            <p>
              Signed thermal effects and clipping as a subset of conversion losses are retained.
            </p>
          </div>
        </div>
      </Card>
      <Card title="Run-specific assumptions">
        {run?.metadata.assumptions.map((a: string) => (
          <div className="assumption-row" key={a}>
            <CheckCircle2 size={16} />
            <span>{a}</span>
          </div>
        ))}
      </Card>
      <Card title="Scientific & technical references">
        <div className="reference-list">
          {references.map(([title, description, url], i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <span>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <b>{title}</b>
                <p>{description}</p>
              </div>
              <ArrowUpRight size={17} />
            </a>
          ))}
        </div>
      </Card>
      <Note tone="amber">
        This is a simulation platform and digital-twin foundation. No real plant telemetry,
        validated predictive diagnosis or live SCADA connection is supplied. Agreement with pvlib
        verifies integration; it is not independent experimental validation. A single TMY cannot
        establish interannual site-specific P90.
      </Note>
    </>
  );
}
