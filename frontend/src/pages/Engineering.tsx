import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Upload, Download, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTwin } from '../state/store';
import { Card, Metric, Note, fmt } from '../components/UI';
import Chart, { line } from '../charts/Chart';
import SolarField from '../solar-field/SolarField';
import { api, download } from '../services/api';
export function FieldPage() {
  const { run, equipment, selection, set, focus } = useTwin();
  if (!run) return null;
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">ELECTRICAL TOPOLOGY · SPATIAL INTELLIGENCE</div>
          <h1>
            Interactive solar field<span className="title-dot">.</span>
          </h1>
          <p>Orbit, zoom and inspect every module, string and inverter.</p>
        </div>
      </div>
      <SolarField expanded />
      <div className="equipment-strip">
        <label>
          Inspect inverter
          <select
            aria-label="Select inverter"
            value={selection?.type === 'inverter' ? selection.index : ''}
            onChange={(e) => focus({ type: 'inverter', index: Number(e.target.value) })}
          >
            <option value="" disabled>
              Select equipment
            </option>
            {equipment?.inverters.map((x) => (
              <option key={x.id} value={x.index}>
                {x.id} · {fmt(x.ac_power_kw, 1)} kW AC
              </option>
            ))}
          </select>
        </label>
        <label>
          Inspect string
          <select
            aria-label="Select string"
            value={selection?.type === 'string' ? selection.index : ''}
            onChange={(e) => focus({ type: 'string', index: Number(e.target.value) })}
          >
            <option value="" disabled>
              Select equipment
            </option>
            {equipment?.strings.map((x) => (
              <option key={x.id} value={x.index}>
                {x.id} · {x.inverter_id}
              </option>
            ))}
          </select>
        </label>
        <span>
          Mouse: orbit · right drag: pan · scroll: zoom
          <br />
          Keyboard: arrows pan · + / − zoom · camera buttons reset and fit
        </span>
      </div>
      <Note>
        Modules are proportioned from the configured dimensions and tilt. Infinite-sheds electrical
        row shading is calculated in Python. Rendered lighting is illustrative; module values are
        allocated from the homogeneous string model. “DC gap” is an unconstrained diagnostic
        quantity, not saleable recoverable AC.
      </Note>
    </>
  );
}

export function WeatherPage() {
  const { run, columns, draft, set, simulate, job } = useTwin();
  const [view, setView] = useState('monthly');
  const [uploading, setUploading] = useState(false);
  if (!run || !columns) return null;
  const meta = run.metadata.station;
  const q = run.metadata.weather_quality;
  const s = run.summary;
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const w = await api('/weather/upload', { method: 'POST', body: data });
      if (draft) await simulate({ ...draft, weather_id: w.weather_id });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };
  const hourly = view === 'hourly';
  const x = hourly ? columns.timestamp_local : s.monthly.map((m: any) => m.label);
  const daily = view === 'daily';
  const dailyData = (key: string) =>
    Array.from(
      { length: 365 },
      (_, d) =>
        columns[key]
          .slice(d * 24, d * 24 + 24)
          .map(Number)
          .reduce((a, b) => a + b, 0) / 1000,
    );
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">CLIMATE.ONEBUILDING.ORG / EPW</div>
          <h1>
            Weather & solar resource<span className="title-dot">.</span>
          </h1>
          <p>Understand the climate behind the calculation.</p>
        </div>
        <label className="button upload-button">
          <Upload size={16} />
          {uploading ? 'Validating EPW…' : 'Upload alternative EPW'}
          <input
            type="file"
            accept=".epw"
            disabled={uploading || !!job}
            onChange={(e) => {
              if (e.target.files?.[0]) void upload(e.target.files[0]);
            }}
          />
        </label>
      </div>
      <div className="metrics-grid">
        <Metric label="Annual GHI" value={fmt(s.annual_ghi_kwh_m2)} unit="kWh/m²" />
        <Metric
          label="Front POA irradiation"
          value={fmt(s.annual_poa_front_kwh_m2)}
          unit="kWh/m²"
        />
        <Metric label="Rear POA irradiation" value={fmt(s.annual_poa_rear_kwh_m2)} unit="kWh/m²" />
        <Metric
          label="Weather intervals"
          value="8,760"
          unit="hours"
          note={`${q.flagged_hours} flagged hours · no imputation`}
        />
      </div>
      <div className="chart-grid">
        <Card title="Weather station" eyebrow="COORDINATES FROM EPW METADATA">
          <div className="station-map">
            <MapContainer
              key={`${meta.latitude},${meta.longitude}`}
              center={[meta.latitude, meta.longitude]}
              zoom={7}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              <CircleMarker
                center={[meta.latitude, meta.longitude]}
                radius={9}
                pathOptions={{ color: '#138f92', fillColor: '#2cbdad', fillOpacity: 1 }}
              >
                <Popup>
                  {meta.city} weather station · WMO {meta.WMO_code}
                </Popup>
              </CircleMarker>
              <CircleMarker
                center={[
                  run.metadata.plant_location.latitude,
                  run.metadata.plant_location.longitude,
                ]}
                radius={15}
                pathOptions={{ color: '#e7ad33', fillOpacity: 0 }}
              >
                <Popup>Configured plant reference location</Popup>
              </CircleMarker>
            </MapContainer>
          </div>
          <dl className="detail-list two-columns">
            <dt>Station</dt>
            <dd>
              {meta.city} · {meta.WMO_code}
            </dd>
            <dt>Latitude / longitude</dt>
            <dd>
              {meta.latitude}° / {meta.longitude}°
            </dd>
            <dt>Elevation</dt>
            <dd>{fmt(meta.altitude)} m</dd>
            <dt>Standard-time offset</dt>
            <dd>UTC+{meta.TZ}</dd>
          </dl>
        </Card>
        <Card title="Data quality & provenance" eyebrow="TRACEABLE WEATHER INPUT">
          <span className="status-pill amber">
            <AlertCircle size={14} />
            Passed with explicit caveats
          </span>
          <p className="body-copy">
            A coherent 365-day reference calendar retains the original hourly data. Solar geometry
            uses interval midpoints.
          </p>
          {q.issues.map((x: string) => (
            <Note key={x} tone="amber">
              {x}
            </Note>
          ))}
          <p className="muted">{q.timestamp_convention}</p>
          <dl className="detail-list">
            <dt>Downloaded</dt>
            <dd>{run.metadata.weather.downloaded_at_utc.slice(0, 10)}</dd>
            <dt>EPW SHA-256</dt>
            <dd className="hash">{run.metadata.weather.epw_sha256}</dd>
          </dl>
          <button className="button" onClick={() => download(run.run_id, 'dataset=weather')}>
            <Download size={15} />
            Weather CSV
          </button>
        </Card>
      </div>
      <Card
        title="Solar resource through the year"
        action={
          <div className="tabs compact">
            {['monthly', 'daily', 'hourly'].map((v) => (
              <button key={v} className={view === v ? 'selected' : ''} onClick={() => setView(v)}>
                {v}
              </button>
            ))}
          </div>
        }
      >
        <Chart
          data={
            hourly
              ? [
                  line(x, columns.ghi_w_m2, 'GHI', '#e7af37'),
                  line(x, columns.dni_w_m2, 'DNI', '#178c9c'),
                  line(x, columns.dhi_w_m2, 'DHI', '#9d7bc4'),
                ]
              : daily
                ? [
                    line(
                      Array.from({ length: 365 }, (_, i) => i + 1),
                      dailyData('ghi_w_m2'),
                      'Daily GHI',
                      '#e7af37',
                    ),
                    line(
                      Array.from({ length: 365 }, (_, i) => i + 1),
                      dailyData('poa_front_w_m2'),
                      'Daily front POA',
                      '#178c9c',
                    ),
                  ]
                : [
                    {
                      type: 'bar',
                      x,
                      y: s.monthly.map((m: any) => m.ghi_w_m2 / 1000),
                      name: 'GHI',
                      marker: { color: '#edbc50' },
                    },
                    {
                      type: 'bar',
                      x,
                      y: s.monthly.map((m: any) => m.poa_front_w_m2 / 1000),
                      name: 'Front POA',
                      marker: { color: '#239fa4' },
                    },
                  ]
          }
          layout={{
            barmode: 'group',
            yaxis: {
              title: { text: hourly ? 'Irradiance (W/m²)' : 'Irradiation (kWh/m²)' },
              gridcolor: '#edf1f4',
            },
          }}
          height={330}
        />
      </Card>
      <Card title="Ambient conditions">
        <Chart
          data={[
            line(columns.timestamp_local, columns.ambient_temp_c, 'Ambient temperature', '#ed997b'),
            {
              ...line(columns.timestamp_local, columns.wind_speed_m_s, 'Wind speed', '#448eb9'),
              yaxis: 'y2',
            },
          ]}
          layout={{
            yaxis: { title: { text: 'Temperature (°C)' }, gridcolor: '#edf1f4' },
            yaxis2: {
              title: { text: 'Wind (m/s)' },
              overlaying: 'y',
              side: 'right',
              showgrid: false,
            },
            margin: { l: 55, r: 60, t: 18, b: 60 },
          }}
        />
      </Card>
      <Note>
        The station location is a meteorological reference. It is not evidence of the plant’s exact
        location or local resource. Map tiles require internet; cached meteorology and simulation
        work offline.
      </Note>
    </>
  );
}

export function PerformancePage() {
  const { run, columns, hour } = useTwin();
  const [period, setPeriod] = useState('daily');
  const [metric, setMetric] = useState('power');
  if (!run || !columns) return null;
  const s = run.summary;
  const start = Math.floor(hour / 24) * 24;
  let x: any[], dc: any[], ac: any[];
  if (period === 'hourly') {
    x = columns.timestamp_local.slice(start, start + 24);
    dc = columns.dc_power_kw.slice(start, start + 24);
    ac = columns.ac_power_kw.slice(start, start + 24);
  } else if (period === 'monthly') {
    x = s.monthly.map((m: any) => m.label);
    dc = s.monthly.map((m: any) => m.dc_power_kw / 1000);
    ac = s.monthly.map((m: any) => m.ac_energy_kwh / 1000);
  } else {
    x = Array.from({ length: 365 }, (_, i) => i + 1);
    dc = x.map(
      (_, d) =>
        columns.dc_power_kw
          .slice(d * 24, d * 24 + 24)
          .map(Number)
          .reduce((a, b) => a + b, 0) / 1000,
    );
    ac = x.map(
      (_, d) =>
        columns.ac_power_kw
          .slice(d * 24, d * 24 + 24)
          .map(Number)
          .reduce((a, b) => a + b, 0) / 1000,
    );
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">PHYSICS → PERFORMANCE</div>
          <h1>
            Physical simulation<span className="title-dot">.</span>
          </h1>
          <p>A traceable calculation from sunlight to delivered electricity.</p>
        </div>
        <div className="tabs">
          {['hourly', 'daily', 'monthly'].map((v) => (
            <button key={v} className={v === period ? 'selected' : ''} onClick={() => setPeriod(v)}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="metrics-grid">
        <Metric label="Annual DC energy" value={fmt(s.annual_dc_energy_kwh / 1000)} unit="MWh" />
        <Metric label="Final yield" value={fmt(s.specific_yield_kwh_kwp, 1)} unit="h" />
        <Metric label="Reference yield" value={fmt(s.reference_yield_h, 1)} unit="h" />
        <Metric
          label="DC / AC sizing ratio"
          value={fmt(s.dc_ac_ratio, 3)}
          note="Calculated from integer module topology"
        />
      </div>
      <Card title="DC and delivered AC">
        <Chart
          data={[
            line(x, dc, period === 'hourly' ? 'DC power' : 'DC energy', '#e5b144'),
            line(
              x,
              ac,
              period === 'hourly' ? 'Delivered AC power' : 'Delivered AC energy',
              '#128f9a',
              true,
            ),
          ]}
          layout={{
            yaxis: {
              title: { text: period === 'hourly' ? 'Power (kW)' : 'Energy (MWh)' },
              gridcolor: '#edf1f4',
            },
            xaxis: {
              title: { text: period === 'daily' ? 'Reference day of year' : '' },
              gridcolor: '#edf1f4',
            },
          }}
          height={360}
        />
      </Card>
      <div className="chart-grid">
        <Card title="Front & rear incident irradiance">
          <Chart
            data={[
              line(
                columns.timestamp_local.slice(start, start + 24),
                columns.poa_front_w_m2.slice(start, start + 24),
                'Front POA',
                '#e9b642',
              ),
              line(
                columns.timestamp_local.slice(start, start + 24),
                columns.poa_rear_w_m2.slice(start, start + 24),
                'Rear POA',
                '#218fa0',
              ),
              line(
                columns.timestamp_local.slice(start, start + 24),
                columns.effective_irradiance_w_m2.slice(start, start + 24),
                'Effective · after soiling',
                '#9478be',
              ),
            ]}
            layout={{ yaxis: { title: { text: 'Irradiance (W/m²)' }, gridcolor: '#edf1f4' } }}
          />
        </Card>
        <Card title="Module & cell temperature">
          <Chart
            data={[
              line(
                columns.timestamp_local.slice(start, start + 24),
                columns.ambient_temp_c.slice(start, start + 24),
                'Ambient',
                '#9bb7c0',
              ),
              line(
                columns.timestamp_local.slice(start, start + 24),
                columns.module_temp_c.slice(start, start + 24),
                'Module',
                '#e6b144',
              ),
              line(
                columns.timestamp_local.slice(start, start + 24),
                columns.cell_temp_c.slice(start, start + 24),
                'Cell',
                '#e98072',
              ),
            ]}
            layout={{ yaxis: { title: { text: 'Temperature (°C)' }, gridcolor: '#edf1f4' } }}
          />
        </Card>
      </div>
      <div className="chart-grid">
        <Card title="Solar geometry · selected day">
          <Chart
            data={[
              line(
                columns.timestamp_local.slice(start, start + 24),
                columns.solar_elevation_deg.slice(start, start + 24),
                'Elevation',
                '#e9b642',
              ),
              line(
                columns.timestamp_local.slice(start, start + 24),
                columns.incidence_angle_deg.slice(start, start + 24),
                'Incidence angle',
                '#168f9c',
              ),
              line(
                columns.timestamp_local.slice(start, start + 24),
                columns.solar_azimuth_deg.slice(start, start + 24),
                'Azimuth',
                '#9b7ac5',
              ),
            ]}
            layout={{ yaxis: { title: { text: 'Angle (°)' }, gridcolor: '#edf1f4' } }}
          />
        </Card>
        <Card title="Electrical constraint checks">
          {s.constraints.map((c: any) => (
            <div className="constraint" key={c.name}>
              {c.status === 'verified' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <div>
                <b>{c.name}</b>
                <span>{c.detail}</span>
              </div>
              <span className={'status-pill ' + (c.status === 'verified' ? 'green' : 'amber')}>
                {c.status}
              </span>
            </div>
          ))}
        </Card>
      </div>
      <Note>
        PR = (delivered AC energy / installed DC nameplate) / (front POA irradiation / 1 kW/m²).
        This conventional front-reference PR includes bifacial production; it is not directly
        comparable with an effective-irradiance bifacial PR. Module and inverter assumptions are
        recorded in run metadata.
      </Note>
    </>
  );
}

const lossLabels: Record<string, string> = {
  shading_loss_kwh: 'Row shading',
  bifacial_gain_kwh: 'Bifacial gain',
  dc_model_response_loss_kwh: 'DC model response',
  temperature_loss_kwh: 'Temperature',
  soiling_loss_kwh: 'Soiling',
  fault_loss_kwh: 'Injected DC faults',
  dc_electrical_loss_kwh: 'DC wiring',
  degradation_loss_kwh: 'Degradation',
  inverter_loss_kwh: 'Inverter + clipping',
  availability_loss_kwh: 'Availability',
  ac_electrical_loss_kwh: 'AC wiring',
  curtailment_loss_kwh: 'Grid curtailment',
};
export function LossesPage() {
  const { run } = useTwin();
  if (!run) return null;
  const s = run.summary;
  const entries = Object.entries(s.losses_kwh) as [string, number][];
  const values = entries.map(([k, v]) => (k === 'bifacial_gain_kwh' ? v : -v) / 1000);
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">EVERY KILOWATT-HOUR, EXPLAINED</div>
          <h1>
            Energy loss decomposition<span className="title-dot">.</span>
          </h1>
          <p>A sequential counterfactual from reference irradiance to delivered AC.</p>
        </div>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Reference production"
          value={fmt(s.reference_energy_kwh / 1000)}
          unit="MWh"
        />
        <Metric
          label="Bifacial contribution · DC basis"
          value={fmt(s.losses_kwh.bifacial_gain_kwh / 1000)}
          unit="MWh"
        />
        <Metric label="Delivered AC" value={fmt(s.annual_energy_kwh / 1000)} unit="MWh" />
        <Metric
          label="Maximum hourly residual"
          value={s.max_accounting_residual_kwh.toExponential(2)}
          unit="kWh"
          note="Accounting closure checked numerically"
        />
      </div>
      <Card title="From solar resource to the grid">
        <Chart
          data={[
            {
              type: 'waterfall',
              x: ['Reference', ...entries.map(([k]) => lossLabels[k]), 'Delivered AC'],
              y: [s.reference_energy_kwh / 1000, ...values, 0],
              measure: ['absolute', ...entries.map(() => 'relative'), 'total'],
              connector: { line: { color: '#c7d5db' } },
              increasing: { marker: { color: '#3daf9f' } },
              decreasing: { marker: { color: '#e99a80' } },
              totals: { marker: { color: '#237b92' } },
              textposition: 'outside',
              text: [
                fmt(s.reference_energy_kwh / 1000),
                ...values.map((v) => fmt(v)),
                fmt(s.annual_energy_kwh / 1000),
              ],
              hovertemplate: '%{x}: %{y:,.2f} MWh<extra></extra>',
            },
          ]}
          layout={{
            showlegend: false,
            yaxis: { title: { text: 'Energy (MWh)' }, gridcolor: '#edf1f4' },
            xaxis: { tickangle: -25 },
            margin: { l: 65, r: 25, t: 40, b: 100 },
          }}
          height={450}
        />
      </Card>
      <Card title="Numerical energy ledger">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Calculation stage</th>
                <th>Energy effect</th>
                <th>Share of reference</th>
                <th>Attribution convention</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <span
                      className={'table-dot ' + (k === 'bifacial_gain_kwh' ? 'green' : 'coral')}
                    />
                    {lossLabels[k]}
                  </td>
                  <td>
                    {k === 'bifacial_gain_kwh' ? '+' : '−'}
                    {fmt(Math.abs(v) / 1000, 3)} MWh
                  </td>
                  <td>{fmt((v / s.reference_energy_kwh) * 100, 2)}%</td>
                  <td>
                    {k === 'inverter_loss_kwh'
                      ? `Includes ${fmt(s.clipping_loss_kwh / 1000, 2)} MWh clipping`
                      : 'Difference between adjacent model stages'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Note>
        Reference + bifacial gain − signed sequential reductions = delivered energy. Temperature can
        produce a gain in cold conditions. Attribution depends on the stated ordering; it is not an
        independent additive estimate of each mechanism. Clipping is already included in inverter
        losses.
      </Note>
    </>
  );
}
