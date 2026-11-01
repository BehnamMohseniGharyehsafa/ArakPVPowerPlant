import {
  ArrowUpRight,
  Sun,
  Zap,
  Activity,
  Leaf,
  ChevronRight,
  MapPin,
  CloudSun,
} from 'lucide-react';
import { useTwin } from '../state/store';
import { Card, Metric, fmt, Note } from '../components/UI';
import Chart, { line } from '../charts/Chart';
import SolarField from '../solar-field/SolarField';
export default function Overview() {
  const { run, columns, hour, set } = useTwin();
  if (!run || !columns) return null;
  const s = run.summary;
  const get = (k: string) => Number(columns[k][hour]);
  const start = Math.floor(hour / 24) * 24;
  const x = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const day = columns.ac_power_kw.slice(start, start + 24).map(Number);
  const p = run.metadata.scenario.plant;
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">THE COMPLETE ENERGY PICTURE</div>
          <h1>
            Plant overview<span className="title-dot">.</span>
          </h1>
          <p>Explore your solar field. Understand every kilowatt-hour.</p>
        </div>
        <div className="resource-chip">
          <CloudSun size={25} />
          <div>
            <b>{fmt(get('ambient_temp_c'), 1)} °C</b>
            <span>{fmt(get('ghi_w_m2'))} W/m² GHI · selected hour</span>
          </div>
        </div>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Annual delivered energy"
          value={fmt(s.annual_energy_kwh / 1e6, 3)}
          unit="GWh"
          note="8,760 hourly intervals · TMY reference"
          icon={<Zap size={18} />}
          tone="amber"
        />
        <Metric
          label="Specific energy yield"
          value={fmt(s.specific_yield_kwh_kwp)}
          unit="kWh/kWp"
          note={`${fmt(s.dc_capacity_kw / 1000, 3)} MWp installed DC`}
          icon={<Sun size={18} />}
          tone="cyan"
        />
        <Metric
          label="Performance ratio"
          value={fmt(s.performance_ratio * 100, 2)}
          unit="%"
          note="Front POA reference · includes bifacial gain"
          icon={<Activity size={18} />}
          tone="violet"
        />
        <Metric
          label="Capacity factor"
          value={fmt(s.capacity_factor * 100, 2)}
          unit="%"
          note={`${fmt(s.ac_capacity_kw / 1000, 2)} MW AC export boundary`}
          icon={<Leaf size={18} />}
          tone="green"
        />
      </div>
      <div className="overview-main">
        <Card
          className="field-card"
          title="A living view of your solar field"
          eyebrow="INTERACTIVE DIGITAL MODEL"
          action={
            <button className="text-button" onClick={() => set({ page: 'field' })}>
              Explore field <ArrowUpRight size={15} />
            </button>
          }
        >
          <SolarField />
          <div className="field-card-foot">
            <span>
              <MapPin size={14} /> {run.metadata.station.city} weather reference ·{' '}
              {run.metadata.station.country}
            </span>
            <span>
              Click a module to inspect <ChevronRight size={14} />
            </span>
          </div>
        </Card>
        <Card title="At this hour" eyebrow="SIMULATED TELEMETRY" className="hour-card">
          <div className="current-power">
            <span>Delivered AC output</span>
            <div>
              {fmt(get('ac_power_kw') / 1000, 3)} <small>MW</small>
            </div>
            <span className="status-pill green">
              <span className="status-dot" />
              {get('ac_power_kw') > 0 ? 'Generating' : 'Night / zero output'}
            </span>
          </div>
          <div className="capacity-track">
            <span
              style={{ width: `${Math.min(100, (get('ac_power_kw') / s.ac_capacity_kw) * 100)}%` }}
            />
          </div>
          <div className="track-label">
            <span>0 MW</span>
            <span>{fmt(s.ac_capacity_kw / 1000, 2)} MW AC</span>
          </div>
          <dl className="detail-list">
            <dt>DC output</dt>
            <dd>{fmt(get('dc_power_kw') / 1000, 3)} MW</dd>
            <dt>Effective irradiance</dt>
            <dd>{fmt(get('effective_irradiance_w_m2'))} W/m²</dd>
            <dt>Cell temperature</dt>
            <dd>{fmt(get('cell_temp_c'), 1)} °C</dd>
            <dt>Wind speed</dt>
            <dd>{fmt(get('wind_speed_m_s'), 1)} m/s</dd>
            <dt>Solar elevation</dt>
            <dd>{fmt(get('solar_elevation_deg'), 1)}°</dd>
            <dt>Active injected events</dt>
            <dd>{String(columns.fault_status[hour]).split(';').filter(Boolean).length}</dd>
          </dl>
          <div className="healthy-callout">
            <Activity size={18} />
            <div>
              <b>Energy accounting verified</b>
              <span>Maximum residual {s.max_accounting_residual_kwh.toExponential(1)} kWh</span>
            </div>
          </div>
        </Card>
      </div>
      <div className="chart-grid">
        <Card
          title="A year of solar energy"
          eyebrow="MONTHLY DELIVERED GENERATION"
          action={<span className="subtle-badge">MWh</span>}
        >
          <Chart
            data={[
              {
                type: 'bar',
                x: s.monthly.map((m: any) => m.label),
                y: s.monthly.map((m: any) => m.ac_energy_kwh / 1000),
                marker: {
                  color: s.monthly.map((_: any, i: number) =>
                    i === Math.floor(hour / 24 / 30.5) ? '#f4bd4a' : '#28a7a3',
                  ),
                  cornerradius: 5,
                },
                hovertemplate: '%{x}: %{y:,.1f} MWh<extra></extra>',
              },
            ]}
            layout={{
              showlegend: false,
              yaxis: { title: { text: 'Delivered energy (MWh)' }, gridcolor: '#edf1f4' },
            }}
            height={255}
          />
        </Card>
        <Card
          title="The shape of today"
          eyebrow="HOURLY POWER PROFILE"
          action={<span className="subtle-badge">kW</span>}
        >
          <Chart
            data={[
              line(x, day, 'Delivered AC', '#168f9c', true),
              line(x, columns.dc_power_kw.slice(start, start + 24), 'DC output', '#deb54a'),
            ]}
            layout={{
              yaxis: { title: { text: 'Power (kW)' }, gridcolor: '#edf1f4' },
              shapes: [
                {
                  type: 'line',
                  x0: x[hour % 24],
                  x1: x[hour % 24],
                  y0: 0,
                  y1: 1,
                  yref: 'paper',
                  line: { color: '#f1a34b', width: 1.5, dash: 'dot' },
                },
              ],
            }}
            height={255}
          />
        </Card>
      </div>
      <Note>
        Typical meteorological year simulation, not historical plant production. Plant location is
        separately configurable. Module data, operating assumptions and financial inputs are
        illustrative and exported with every run.
      </Note>
    </>
  );
}
