import { useEffect, useState } from 'react';
import {
  Copy,
  Save,
  Download,
  FileText,
  ArrowUpRight,
  Play,
  Plus,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
} from 'lucide-react';
import { useTwin } from '../state/store';
import { Card, Metric, Note, EmptyAnalysis, NumberInput, fmt } from '../components/UI';
import Chart, { line } from '../charts/Chart';
import { api, download } from '../services/api';
import type { Scenario } from '../types';
export function FinancePage() {
  const { run } = useTwin();
  if (!run) return null;
  const f = run.finance;
  const cf = f.cashflows;
  const a = run.metadata.scenario.finance;
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">PHYSICAL GENERATION / FINANCIAL CONSEQUENCES</div>
          <h1>
            Financial performance<span className="title-dot">.</span>
          </h1>
          <p>Trace delivered electricity into transparent lifetime cash flows.</p>
        </div>
        <span className="status-pill amber">Illustrative financial assumptions</span>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Net present value"
          value={fmt(f.npv / 1e6, 3)}
          unit={`${f.currency} million`}
        />
        <Metric
          label="Levelised cost of electricity"
          value={f.lcoe_per_kwh === null ? 'Undefined' : fmt(f.lcoe_per_kwh, 4)}
          unit={`${f.currency}/kWh`}
        />
        <Metric
          label="Discounted payback"
          value={
            f.discounted_payback_years === null ? 'Not reached' : fmt(f.discounted_payback_years, 1)
          }
          unit={f.discounted_payback_years === null ? '' : 'years'}
        />
        <Metric
          label="Year-one gross electricity value"
          value={fmt(f.annual_gross_value)}
          unit={f.currency}
        />
      </div>
      <Card
        title="Discounted lifetime cash flows"
        eyebrow={`${a.horizon_years}-YEAR HORIZON · ${fmt(a.discount_rate * 100)}% DISCOUNT RATE`}
      >
        <Chart
          data={[
            {
              type: 'bar',
              x: cf.map((x: any) => x.year),
              y: cf.map((x: any) => x.discounted_cash / 1000),
              name: 'Discounted annual cash',
              marker: {
                color: cf.map((x: any) => (x.discounted_cash < 0 ? '#e6a18e' : '#85c8b5')),
              },
            },
            line(
              cf.map((x: any) => x.year),
              cf.map((x: any) => x.cumulative_discounted_cash / 1000),
              'Cumulative discounted cash',
              '#147e91',
            ),
          ]}
          layout={{
            yaxis: { title: { text: `Cash flow (${f.currency} thousand)` }, gridcolor: '#edf1f4' },
            xaxis: { title: { text: 'Operating year' } },
          }}
          height={370}
        />
      </Card>
      <div className="chart-grid">
        <Card title="Editable assumptions · current run">
          <dl className="detail-list">
            <dt>Electricity value</dt>
            <dd>
              {fmt(a.price_per_kwh, 3)} {f.currency}/kWh
              {a.hourly_prices ? ' · hourly schedule overrides flat price' : ''}
            </dd>
            <dt>Installation cost</dt>
            <dd>
              {fmt(a.capex)} {f.currency}
            </dd>
            <dt>Annual operating cost</dt>
            <dd>
              {fmt(a.annual_opex)} {f.currency}
            </dd>
            <dt>Cleaning cost per operation</dt>
            <dd>
              {fmt(a.cleaning_cost)} {f.currency}
            </dd>
            <dt>Cost escalation</dt>
            <dd>{fmt(a.cost_escalation * 100)}% / year</dd>
            <dt>Electricity value escalation</dt>
            <dd>{fmt(a.price_escalation * 100)}% / year</dd>
            <dt>Inverter replacement</dt>
            <dd>
              Year {a.replacement_year} · {fmt(a.replacement_cost)} {f.currency}
            </dd>
            <dt>Annual degradation</dt>
            <dd>{fmt(run.metadata.scenario.plant.annual_degradation * 100, 2)}%</dd>
          </dl>
          <p className="muted">
            Edit these in Plant configuration → Finance. All 8,760 hourly electricity values can be
            supplied in Advanced JSON.
          </p>
        </Card>
        <Card title="Energy and operating value">
          <dl className="detail-list">
            <dt>Year-one operating costs</dt>
            <dd>
              {fmt(f.annual_opex)} {f.currency}
            </dd>
            <dt>Year-one net cash flow</dt>
            <dd>
              {fmt(f.annual_net_cash)} {f.currency}
            </dd>
            <dt>Lifetime degradation value reduction</dt>
            <dd>
              {fmt(f.degradation_lifetime_value_loss)} {f.currency}
            </dd>
            <dt>LCOE cost boundary</dt>
            <dd>Capex + operating + cleaning + repairs + replacement</dd>
            <dt>LCOE energy boundary</dt>
            <dd>Discounted delivered AC</dd>
          </dl>
          <Note>
            Generation repeats the selected typical year with annual degradation. It does not
            forecast future weather. Faults in the scenario are assumed to persist in this repeated
            profile; repair costs are charged in year one.
          </Note>
        </Card>
      </div>
      <Card title="Annual cash-flow ledger">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Delivered energy</th>
                <th>Net cash</th>
                <th>Discounted cash</th>
                <th>Cumulative discounted cash</th>
              </tr>
            </thead>
            <tbody>
              {cf.map((x: any) => (
                <tr key={x.year}>
                  <td>{x.year}</td>
                  <td>{fmt(x.energy_kwh / 1000, 1)} MWh</td>
                  <td>{fmt(x.cash)}</td>
                  <td>{fmt(x.discounted_cash)}</td>
                  <td>
                    {fmt(x.cumulative_discounted_cash)} {f.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export function UncertaintyPage() {
  const { run, bootstrap, analyse, job, draft, set, simulate } = useTwin();
  const [samples, setSamples] = useState(40);
  const [ranges, setRanges] = useState<Record<string, number>>(
    bootstrap?.uncertainty_defaults ?? {},
  );
  if (!run || !draft) return null;
  const a = run.analyses.uncertainty;
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">REPRODUCIBLE PARAMETER EXPERIMENTS</div>
          <h1>
            Uncertainty & sensitivity<span className="title-dot">.</span>
          </h1>
          <p>Explore how explicit assumptions change the result.</p>
        </div>
        <button
          className="button primary"
          disabled={!!job}
          onClick={() => void analyse('uncertainty', { samples, ranges })}
        >
          <FlaskConical size={16} />
          Run Monte Carlo
        </button>
      </div>
      <Card title="Bounded uniform parameter ranges" eyebrow="INDEPENDENT RELATIVE HALF-WIDTHS">
        <div className="form-grid four">
          {Object.entries(ranges).map(([key, value]) => (
            <NumberInput
              key={key}
              label={key.replaceAll('_', ' ')}
              unit="± %"
              value={value * 100}
              min={0}
              max={50}
              step={0.5}
              onChange={(v) => setRanges({ ...ranges, [key]: v / 100 })}
            />
          ))}
          <NumberInput
            label="Monte Carlo samples"
            value={samples}
            min={5}
            max={200}
            onChange={setSamples}
          />
          <NumberInput
            label="Random seed · current draft"
            value={draft.seed}
            min={0}
            onChange={(v) => set({ draft: { ...draft, seed: v } })}
          />
        </div>
        <p className="muted small">
          Completed run seed: {run.metadata.scenario.seed}. To change it, edit the seed and run the
          physical scenario again.
        </p>
        <button className="button" disabled={!!job} onClick={() => void simulate()}>
          Apply seed & rerun scenario
        </button>
      </Card>
      {!a ? (
        <EmptyAnalysis
          title="Quantify the assumptions"
          description="Every sample reruns the Python physical engine. Outputs include energy, operating value and NPV, followed by one-at-a-time sensitivity cases."
          onRun={() => void analyse('uncertainty', { samples, ranges })}
          busy={!!job}
        />
      ) : (
        <>
          <div className="metrics-grid">
            <Metric
              label="P50 energy · parameter model"
              value={fmt(a.p50_energy_kwh / 1000)}
              unit="MWh"
            />
            <Metric
              label="P90 energy · parameter model"
              value={fmt(a.p90_energy_kwh / 1000)}
              unit="MWh"
              note="10th percentile · 90% exceedance"
            />
            <Metric
              label="Central 90% interval"
              value={`${fmt(a.interval_90[0] / 1000)}–${fmt(a.interval_90[1] / 1000)}`}
              unit="MWh"
            />
            <Metric
              label="Reproducibility seed"
              value={fmt(a.seed)}
              note={`${a.samples.length} physical reruns`}
            />
          </div>
          <div className="chart-grid">
            <Card title="Annual energy distribution">
              <Chart
                data={[
                  {
                    type: 'histogram',
                    x: a.samples.map((s: any) => s.energy_kwh / 1000),
                    nbinsx: Math.max(6, Math.round(Math.sqrt(a.samples.length))),
                    marker: { color: '#8d80bf', line: { color: 'white', width: 2 } },
                    hovertemplate: '%{x:,.0f} MWh · %{y} samples<extra></extra>',
                  },
                ]}
                layout={{
                  showlegend: false,
                  xaxis: { title: { text: 'Annual energy (MWh)' } },
                  yaxis: { title: { text: 'Sample count' }, gridcolor: '#edf1f4' },
                }}
                height={330}
              />
            </Card>
            <Card title="Energy sensitivity · one at a time">
              <Chart
                data={[
                  {
                    type: 'bar',
                    orientation: 'h',
                    y: a.sensitivity.map((s: any) => s.parameter.replaceAll('_', ' ')),
                    x: a.sensitivity.map(
                      (s: any) => (s.low_energy_kwh - run.summary.annual_energy_kwh) / 1000,
                    ),
                    name: 'Lower input',
                    marker: { color: '#a9b6d9' },
                  },
                  {
                    type: 'bar',
                    orientation: 'h',
                    y: a.sensitivity.map((s: any) => s.parameter.replaceAll('_', ' ')),
                    x: a.sensitivity.map(
                      (s: any) => (s.high_energy_kwh - run.summary.annual_energy_kwh) / 1000,
                    ),
                    name: 'Higher input',
                    marker: { color: '#28a5a6' },
                  },
                ]}
                layout={{
                  barmode: 'relative',
                  margin: { l: 125, r: 20, t: 15, b: 60 },
                  xaxis: { title: { text: 'Change from base (MWh)' } },
                  yaxis: { autorange: 'reversed' },
                }}
                height={330}
              />
            </Card>
          </div>
          <Card title="Financial sensitivity">
            <Chart
              data={[
                {
                  type: 'bar',
                  x: a.sensitivity.map((s: any) => s.parameter.replaceAll('_', ' ')),
                  y: a.sensitivity.map((s: any) => (s.low_npv - run.finance.npv) / 1000),
                  name: 'Lower input',
                  marker: { color: '#c2b5df' },
                },
                {
                  type: 'bar',
                  x: a.sensitivity.map((s: any) => s.parameter.replaceAll('_', ' ')),
                  y: a.sensitivity.map((s: any) => (s.high_npv - run.finance.npv) / 1000),
                  name: 'Higher input',
                  marker: { color: '#7abcae' },
                },
              ]}
              layout={{
                barmode: 'group',
                yaxis: {
                  title: { text: `NPV change (${run.finance.currency} thousand)` },
                  gridcolor: '#edf1f4',
                },
                xaxis: { tickangle: -20 },
                margin: { l: 70, r: 20, t: 20, b: 90 },
              }}
              height={330}
            />
          </Card>
          <Note tone="amber">
            {a.limitations} {a.distribution} Small sample sizes are demonstrations of the method,
            not precision estimates.
          </Note>
        </>
      )}
    </>
  );
}

export function ScenariosPage() {
  const { run, draft, scenarios, set, simulate, save, compare, job, hour } = useTwin();
  const [selected, setSelected] = useState<string[]>(['reference', 'inverter-fault', 'curtailed']);
  const [curves, setCurves] = useState<any[]>([]);
  const [comparing, setComparing] = useState(false);
  const [startName, setName] = useState('My engineering scenario');
  useEffect(() => {
    let active = true;
    const start = Math.floor(hour / 24) * 24;
    void Promise.all(
      compare.map(async (r, i) => {
        const data = await api(`/runs/${r.run_id}/series?start=${start}&end=${start + 24}`);
        return line(
          data.columns.timestamp_local,
          data.columns.ac_power_kw,
          r.metadata.scenario.name,
          ['#168e9b', '#e4a64e', '#9b7bc4', '#e59081', '#7faac4', '#75ba9a'][i % 6],
        );
      }),
    )
      .then((data) => {
        if (active) setCurves(data);
      })
      .catch((e) => set({ error: (e as Error).message }));
    return () => {
      active = false;
    };
  }, [compare, hour]);
  if (!run || !draft) return null;
  const runSelected = async () => {
    setComparing(true);
    try {
      for (const id of selected) {
        const scenario = scenarios.find((s) => s.id === id);
        if (scenario) await simulate(scenario);
      }
    } finally {
      setComparing(false);
    }
  };
  const duplicate = async () => {
    const next = {
      ...structuredClone(draft),
      id: 'scenario-' + Date.now().toString(36),
      name: startName,
    };
    set({ draft: next });
    await useTwin.getState().save();
  };
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">CONTROLLED, VERSIONED EXPERIMENTS</div>
          <h1>
            Scenario comparison<span className="title-dot">.</span>
          </h1>
          <p>Compare the physical and financial consequences of your decisions.</p>
        </div>
        <button
          className="button primary"
          disabled={!!job || comparing || !selected.length}
          onClick={() => void runSelected()}
        >
          <Play size={16} />
          {comparing ? 'Running comparison…' : 'Run selected scenarios'}
        </button>
      </div>
      <div className="scenario-cards">
        {scenarios.map((s) => (
          <label
            className={'scenario-option ' + (selected.includes(s.id) ? 'chosen' : '')}
            key={s.id}
          >
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, s.id] : selected.filter((id) => id !== s.id),
                )
              }
            />
            <b>{s.name}</b>
            <span>
              {s.faults.length
                ? `${s.faults.length} injected event(s)`
                : `${s.plant.module.bifacial ? 'Bifacial' : 'Monofacial'} · ${s.plant.tilt_deg}° tilt`}
            </span>
          </label>
        ))}
      </div>
      <Card title="Save a reusable scenario">
        <div className="inline-form">
          <label className="input-label">
            <span>Scenario name</span>
            <input value={startName} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="button" onClick={() => void duplicate()}>
            <Copy size={15} />
            Duplicate current configuration
          </button>
          <button className="button" onClick={() => void save()}>
            <Save size={15} />
            Save current draft
          </button>
        </div>
        <p className="muted small">
          Scenarios persist as versioned JSON files. Weather checksum, model version and
          configuration are recorded with every completed run.
        </p>
      </Card>
      <Card
        title="Completed scenario results"
        action={
          <button
            className="button"
            onClick={() =>
              window.open(
                '/api/compare/export?run_ids=' + compare.map((r) => r.run_id).join(','),
                '_blank',
                'noopener',
              )
            }
          >
            <Download size={15} />
            Export comparison ZIP
          </button>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Annual MWh</th>
                <th>PR · front reference</th>
                <th>Gross value</th>
                <th>NPV</th>
                <th>Run identifier</th>
              </tr>
            </thead>
            <tbody>
              {compare.map((r) => (
                <tr key={r.run_id}>
                  <td>
                    <b>{r.metadata.scenario.name}</b>
                  </td>
                  <td>{fmt(r.summary.annual_energy_kwh / 1000, 2)}</td>
                  <td>{fmt(r.summary.performance_ratio * 100, 2)}%</td>
                  <td>
                    {fmt(r.finance.annual_gross_value)} {r.finance.currency}
                  </td>
                  <td>
                    {fmt(r.finance.npv)} {r.finance.currency}
                  </td>
                  <td className="hash">{r.run_id.slice(0, 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Power curves · selected reference day">
        <Chart
          data={curves}
          layout={{ yaxis: { title: { text: 'Delivered AC (kW)' }, gridcolor: '#edf1f4' } }}
          height={340}
        />
      </Card>
      <Card title="Annual generation comparison">
        <Chart
          data={[
            {
              type: 'bar',
              x: compare.map((r) => r.metadata.scenario.name),
              y: compare.map((r) => r.summary.annual_energy_kwh / 1000),
              marker: { color: '#279ea3' },
              hovertemplate: '%{x}: %{y:,.1f} MWh<extra></extra>',
            },
          ]}
          layout={{
            showlegend: false,
            yaxis: { title: { text: 'Annual energy (MWh)' }, gridcolor: '#edf1f4' },
          }}
        />
      </Card>
      <Note>
        Comparisons retain each completed run’s weather and configuration. Check weather checksums
        and financial currencies before interpreting differences. Selecting scenarios updates the
        active run to the most recently calculated scenario.
      </Note>
    </>
  );
}

export function ExportsPage() {
  const { run, columns, analyse, job, set } = useTwin();
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(8760);
  const [aggregation, setAggregation] = useState('hourly');
  const [level, setLevel] = useState('inverter');
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [reporting, setReporting] = useState(false);
  if (!run || !columns) return null;
  const rowStart = Math.max(start, Math.min(end - 1, start + page * 50));
  const keys = [
    'timestamp_local',
    'ghi_w_m2',
    'effective_irradiance_w_m2',
    'cell_temp_c',
    'dc_power_kw',
    'ac_energy_kwh',
    'fault_status',
  ];
  const query = `start=${start}&end=${end}&aggregation=${aggregation}`;
  const fullReport = async () => {
    const target = window.open('about:blank', '_blank');
    setReporting(true);
    try {
      for (const kind of ['diagnostics', 'cleaning', 'uncertainty']) {
        if (!useTwin.getState().run?.analyses[kind]) await analyse(kind, { samples: 20 });
        if (useTwin.getState().error) throw new Error(useTwin.getState().error!);
      }
      if (target) target.location.href = `/api/runs/${run.run_id}/report`;
      else
        set({ error: 'Report ready. Use the direct report links below to open or download it.' });
    } catch (e) {
      target?.close();
      set({ error: (e as Error).message });
    } finally {
      setReporting(false);
    }
  };
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">OPEN DATA / REPRODUCIBLE ENGINEERING</div>
          <h1>
            Results & reporting<span className="title-dot">.</span>
          </h1>
          <p>The same numerical results, ready for independent inspection.</p>
        </div>
        <button className="button primary" onClick={() => download(run.run_id, 'dataset=zip')}>
          <Download size={16} />
          Complete output ZIP
        </button>
      </div>
      <div className="chart-grid">
        <Card title="Export numerical results">
          <div className="form-grid">
            <NumberInput
              label="Start interval · inclusive"
              value={start}
              min={0}
              max={8759}
              onChange={(v) => {
                setStart(v);
                setPage(0);
              }}
            />
            <NumberInput
              label="End interval · exclusive"
              value={end}
              min={1}
              max={8760}
              onChange={(v) => {
                setEnd(v);
                setPage(0);
              }}
            />
            <label className="input-label">
              <span>Aggregation</span>
              <select value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
                {['hourly', 'daily', 'monthly'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="input-label">
              <span>Equipment level</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                {['inverter', 'string', 'module'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <NumberInput
              label="Equipment index · zero based"
              value={index}
              min={0}
              max={
                level === 'module'
                  ? run.summary.module_count - 1
                  : level === 'string'
                    ? run.summary.string_count - 1
                    : run.summary.inverter_count - 1
              }
              onChange={setIndex}
            />
          </div>
          <div className="button-grid">
            <button
              className="button"
              onClick={() => download(run.run_id, 'dataset=plant&' + query)}
            >
              <Download size={15} />
              Plant CSV
            </button>
            <button
              className="button"
              onClick={() => download(run.run_id, 'dataset=weather&' + query)}
            >
              <Download size={15} />
              Weather CSV
            </button>
            <button
              className="button"
              onClick={() =>
                download(run.run_id, `dataset=equipment&level=${level}&index=${index}&${query}`)
              }
            >
              <Download size={15} />
              Equipment CSV
            </button>
            <button className="button" onClick={() => download(run.run_id, 'dataset=metadata')}>
              <Download size={15} />
              Metadata JSON
            </button>
            <button className="button" onClick={() => download(run.run_id, 'dataset=faults')}>
              <Download size={15} />
              Injected events CSV
            </button>
            <button
              className="button"
              disabled={!run.analyses.diagnostics}
              onClick={() => download(run.run_id, 'dataset=maintenance')}
            >
              <Download size={15} />
              Maintenance CSV
            </button>
            <button
              className="button"
              disabled={!run.analyses.cleaning}
              onClick={() => download(run.run_id, 'dataset=cleaning')}
            >
              <Download size={15} />
              Cleaning CSV
            </button>
          </div>
        </Card>
        <Card title="Engineering report" eyebrow="PRINTABLE TECHNICAL DOCUMENT">
          <div className="report-preview">
            <FileText size={36} />
            <h3>{run.metadata.scenario.name}</h3>
            <span>Run {run.run_id.slice(0, 12)}</span>
            <p>
              Plant configuration · weather provenance · scientific models · energy ledger ·
              diagnostics · cleaning · finance · uncertainty · references
            </p>
          </div>
          <button
            className="button primary full"
            disabled={!!job || reporting}
            onClick={() => void fullReport()}
          >
            <FileText size={16} />
            {reporting ? 'Completing report analyses…' : 'Calculate & open full report'}
          </button>
          <button
            className="text-button"
            onClick={() => window.open(`/api/runs/${run.run_id}/report`, '_blank', 'noopener')}
          >
            Open report with available analyses <ArrowUpRight size={14} />
          </button>
          <a
            className="button full"
            style={{ marginTop: 12 }}
            href={`/api/runs/${run.run_id}/report.pdf`}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={15} />
            Download PDF with available analyses
          </a>
          <p className="muted small">
            Use the report’s Print / save as PDF button. Full report generation runs missing
            analyses, including a 20-sample uncertainty demonstration. Unexecuted sections are
            explicitly identified.
          </p>
        </Card>
      </div>
      <Card
        title="Hourly numerical results"
        eyebrow={`${fmt(end - start)} SELECTED INTERVALS · ${run.metadata.scenario.name}`}
        action={
          <div className="pagination">
            <button
              aria-label="Previous results page"
              className="icon-button"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {rowStart + 1}–{Math.min(end, rowStart + 50)}
            </span>
            <button
              aria-label="Next results page"
              className="icon-button"
              disabled={rowStart + 50 >= end}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        }
      >
        <div className="table-scroll results-table">
          <table>
            <thead>
              <tr>
                {[
                  'Local timestamp',
                  'GHI W/m²',
                  'Effective W/m²',
                  'Cell °C',
                  'DC kW',
                  'AC kWh',
                  'Injected events',
                ].map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(
                { length: Math.max(0, Math.min(50, end - rowStart)) },
                (_, j) => rowStart + j,
              ).map((i) => (
                <tr key={i}>
                  {keys.map((k) => (
                    <td key={k}>
                      {typeof columns[k][i] === 'number'
                        ? fmt(Number(columns[k][i]), 3)
                        : String(columns[k][i]) || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Note>
        One-hour energy is average power × 1 h. Daily/monthly exports sum energy fields and average
        power/environmental fields. Module exports are explicitly allocated from strings. The ZIP
        contains plant, weather, inverter, event, metadata, finance and completed analysis outputs.
      </Note>
    </>
  );
}
