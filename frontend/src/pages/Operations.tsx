import { useState } from 'react';
import {
  Plus,
  Trash2,
  RotateCcw,
  ArrowUpRight,
  ShieldAlert,
  Wrench,
  CalendarDays,
  Check,
} from 'lucide-react';
import { useTwin } from '../state/store';
import { Card, Metric, Note, EmptyAnalysis, NumberInput, fmt } from '../components/UI';
import Chart, { line } from '../charts/Chart';
export const faultNames: Record<string, string> = {
  string_disconnect: 'String disconnection',
  string_underperformance: 'String underperformance',
  inverter_outage: 'Inverter outage',
  inverter_efficiency: 'Inverter efficiency degradation',
  local_soiling: 'Localised soiling',
  uniform_soiling: 'Uniform plant soiling',
  partial_shading: 'Partial shading · reduced order',
  temperature: 'Abnormal temperature',
  curtailment: 'Grid export curtailment',
  sensor_bias: 'Plant sensor bias',
  degradation: 'Additional degradation derate',
};
export function FaultsPage() {
  const { run, draft, set, simulate, job, analyse, columns, focus } = useTwin();
  const [kind, setKind] = useState('inverter_outage');
  const [target, setTarget] = useState('inverter');
  const [index, setIndex] = useState(0);
  const [severity, setSeverity] = useState(1);
  const [start, setStart] = useState(0);
  const [duration, setDuration] = useState(8760);
  const [cost, setCost] = useState(300);
  const [safety, setSafety] = useState(false);
  if (!run || !draft || !columns) return null;
  const a = run.analyses.diagnostics;
  const p = draft.plant;
  const apply = (faults: any[]) => {
    const next = {
      ...draft,
      id: draft.id === 'reference' ? 'custom-faults' : draft.id,
      name: draft.id === 'reference' ? 'Fault laboratory' : draft.name,
      faults,
    };
    set({ draft: next });
    void simulate(next);
  };
  const add = () =>
    apply([
      ...draft.faults,
      {
        id: 'event-' + Date.now().toString(36),
        kind,
        target,
        target_index: index,
        severity,
        start_hour: start,
        duration_hours: duration,
        repair_cost: cost,
        safety_critical: safety,
      },
    ]);
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">CONTROLLED EXPERIMENTS / TRANSPARENT EVIDENCE</div>
          <h1>
            Fault laboratory<span className="title-dot">.</span>
          </h1>
          <p>Inject timed equipment events and examine their physical consequences.</p>
        </div>
        <button className="button" disabled={!!job} onClick={() => apply([])}>
          <RotateCcw size={15} />
          Restore healthy operation
        </button>
      </div>
      <div className="operations-grid">
        <Card title="Create an injected event" eyebrow="SYNTHETIC SCENARIO">
          <label className="input-label">
            <span>Fault category</span>
            <select
              aria-label="Fault category"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                if (['curtailment', 'sensor_bias', 'uniform_soiling'].includes(e.target.value)) {
                  setTarget('plant');
                  setIndex(0);
                } else if (['inverter_outage', 'inverter_efficiency'].includes(e.target.value)) {
                  setTarget('inverter');
                  setIndex(0);
                }
              }}
            >
              {Object.entries(faultNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label className="input-label">
              <span>Target level</span>
              <select
                aria-label="Fault target level"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setIndex(0);
                }}
              >
                <option value="plant">Whole plant</option>
                {!['curtailment', 'sensor_bias'].includes(kind) && (
                  <option value="inverter">Inverter</option>
                )}
                {!['inverter_outage', 'inverter_efficiency', 'curtailment', 'sensor_bias'].includes(
                  kind,
                ) && <option value="string">String</option>}
              </select>
            </label>
            <label className="input-label">
              <span>Equipment</span>
              <select
                aria-label="Fault equipment"
                disabled={target === 'plant'}
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
              >
                {Array.from(
                  {
                    length:
                      target === 'plant'
                        ? 1
                        : target === 'inverter'
                          ? p.inverter_count
                          : p.inverter_count * p.strings_per_inverter,
                  },
                  (_, i) => (
                    <option key={i} value={i}>
                      {target === 'plant'
                        ? 'All equipment'
                        : `${target === 'inverter' ? 'INV' : 'S'}-${String(i + 1).padStart(target === 'inverter' ? 2 : 3, '0')}`}
                    </option>
                  ),
                )}
              </select>
            </label>
            <NumberInput label="Start hour" value={start} min={0} max={8759} onChange={setStart} />
            <NumberInput
              label="Duration"
              unit="hours"
              value={duration}
              min={1}
              max={8760}
              onChange={setDuration}
            />
            <NumberInput
              label="Repair cost"
              unit={draft.finance.currency}
              value={cost}
              onChange={setCost}
            />
            <label className="input-label">
              <span>Recovery hour</span>
              <input readOnly value={Math.min(8760, start + duration)} />
            </label>
          </div>
          <label className="slider-label">
            Severity <b>{fmt(severity * 100)}%</b>
            <input
              aria-label="Fault severity"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
            />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} />
            Prioritise as safety-critical
          </label>
          <button className="button primary full" disabled={!!job} onClick={add}>
            <Plus size={16} />
            Inject event & rerun physics
          </button>
          <p className="muted small">
            Disconnect/outage events are complete. Temperature severity maps to +0–40 °C; sensor
            bias to +0–50%; inverter efficiency to a 0–50% relative reduction. Other derates use the
            selected fraction. Grid curtailment constrains rated AC export.
          </p>
        </Card>
        <Card
          title="Event register"
          eyebrow={`${run.metadata.scenario.faults.length} INJECTED EVENTS`}
          action={
            <button
              className="text-button"
              disabled={!!job}
              onClick={() => void analyse('diagnostics')}
            >
              Analyse residuals <ArrowUpRight size={14} />
            </button>
          }
        >
          {run.metadata.scenario.faults.length ? (
            run.metadata.scenario.faults.map((f: any) => (
              <div className="fault-event" key={f.id}>
                <div className="fault-event-icon">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <b>{faultNames[f.kind]}</b>
                  <span>
                    {f.target === 'plant'
                      ? 'Whole plant'
                      : `${f.target === 'inverter' ? 'INV' : 'S'}-${f.target_index + 1}`}{' '}
                    · {fmt(f.severity * 100)}% severity
                  </span>
                  <small>
                    Hours {f.start_hour}–{Math.min(8760, f.start_hour + f.duration_hours)} ·{' '}
                    {f.safety_critical ? 'Safety priority' : 'Economic inspection'}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Remove ${f.id}`}
                  disabled={!!job}
                  onClick={() => apply(draft.faults.filter((x) => x.id !== f.id))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="empty-events">
              <Check size={30} />
              <h3>A healthy starting point</h3>
              <p>
                Inject an event to explore output changes, energy losses and diagnostic evidence.
              </p>
            </div>
          )}
          <Note tone="amber">
            Partial shading and localised faults are explicit string power derates. This
            reduced-order model does not resolve bypass diodes, hot spots or module mismatch.
          </Note>
        </Card>
      </div>
      {a && (
        <>
          <div className="metrics-grid">
            <Metric
              label="Delivered energy lost"
              value={fmt(a.total_lost_kwh / 1000, 2)}
              unit="MWh"
            />
            <Metric
              label="Residual episodes"
              value={fmt(a.episodes.length)}
              note="3 consecutive daylight hours above 3%"
            />
            <Metric
              label="Injected equipment events"
              value={fmt(a.candidates.length)}
              note="Known synthetic ground truth"
            />
            <Metric
              label="Economic repair candidates"
              value={fmt(a.selected_repairs.length)}
              note="HiGHS binary selection under budget"
            />
          </div>
          <Card title="Healthy vs faulty power">
            <Chart
              data={[
                line(columns.timestamp_local, a.healthy_ac_kw, 'Healthy counterfactual', '#99b9bc'),
                line(
                  columns.timestamp_local,
                  columns.ac_power_kw,
                  'Physical delivered AC',
                  '#168e9d',
                ),
                line(
                  columns.timestamp_local,
                  columns.observed_ac_kw,
                  'Biased sensor demonstration',
                  '#edac52',
                ),
              ]}
              layout={{ yaxis: { title: { text: 'Power (kW)' }, gridcolor: '#edf1f4' } }}
              height={330}
            />
          </Card>
          <Card title="Residual evidence">
            <Chart
              data={[
                line(
                  columns.timestamp_local,
                  a.normalised_residual.map((v: number) => v * 100),
                  'Normalised residual',
                  '#e28d80',
                ),
              ]}
              layout={{
                yaxis: { title: { text: 'Observed − expected (%)' }, gridcolor: '#edf1f4' },
                shapes: [
                  {
                    type: 'line',
                    x0: 0,
                    x1: 1,
                    xref: 'paper',
                    y0: -3,
                    y1: -3,
                    line: { color: '#b6c9cd', dash: 'dot' },
                  },
                ],
              }}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Equipment</th>
                    <th>Injected event</th>
                    <th>Lost electricity</th>
                    <th>Evidence status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {a.candidates.map((c: any) => (
                    <tr key={c.fault_id}>
                      <td>{c.target}</td>
                      <td>{faultNames[c.kind]}</td>
                      <td>{fmt(c.lost_energy_kwh / 1000, 2)} MWh</td>
                      <td>
                        <span className="status-pill amber">Synthetic ground truth</span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            focus({
                              type: c.target_type === 'plant' ? 'inverter' : c.target_type,
                              index: c.target_index,
                            })
                          }
                        >
                          Locate <ArrowUpRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Note>{a.limitations}</Note>
        </>
      )}
    </>
  );
}

export function MaintenancePage() {
  const { run, draft, set, analyse, simulate, job, focus, columns } = useTwin();
  if (!run || !draft || !columns) return null;
  const a = run.analyses.diagnostics;
  const update = (key: string, value: number) =>
    set({ draft: { ...draft, finance: { ...draft.finance, [key]: value } } });
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">INTERVENTIONS THAT MAKE A DIFFERENCE</div>
          <h1>
            Maintenance decisions<span className="title-dot">.</span>
          </h1>
          <p>Rank recoverable delivered energy and choose repairs under resource limits.</p>
        </div>
        <button
          className="button primary"
          disabled={!!job}
          onClick={() => void analyse('diagnostics')}
        >
          <Wrench size={16} />
          Evaluate current run
        </button>
      </div>
      <Card title="Response and resource assumptions">
        <div className="form-grid four">
          <NumberInput
            label="Response delay"
            value={draft.finance.repair_delay_days}
            unit="days"
            onChange={(v) => update('repair_delay_days', v)}
          />
          <NumberInput
            label="Repair budget"
            value={draft.finance.repair_budget}
            unit={draft.finance.currency}
            onChange={(v) => update('repair_budget', v)}
          />
          <NumberInput
            label="Maximum repairs"
            value={draft.finance.max_repairs}
            onChange={(v) => update('max_repairs', v)}
          />
          <div className="form-action">
            <button className="button" disabled={!!job} onClick={() => void simulate()}>
              Apply assumptions & rerun
            </button>
          </div>
        </div>
        <p className="muted small">
          Per-event repair cost and safety priority are editable in the fault laboratory.
          Calculations below use the completed run’s assumptions.
        </p>
      </Card>
      {!a ? (
        <EmptyAnalysis
          title="Calculate the value of intervention"
          description="The engine removes each injected event in a physical counterfactual, accounts for response delay and evaluates saleable energy. SciPy/HiGHS selects economic repairs within your budget."
          onRun={() => void analyse('diagnostics')}
          busy={!!job}
        />
      ) : (
        <>
          <div className="metrics-grid">
            <Metric
              label="Lost delivered energy"
              value={fmt(a.total_lost_kwh / 1000, 2)}
              unit="MWh"
            />
            <Metric
              label="Recoverable value · individual sums"
              value={fmt(a.candidates.reduce((v: number, c: any) => v + c.recoverable_value, 0))}
              unit={run.finance.currency}
            />
            <Metric
              label="Selected interventions"
              value={fmt(a.selected_repairs.length)}
              note="Safety items are mandatory"
            />
            <Metric
              label="Safety-critical items"
              value={fmt(a.candidates.filter((c: any) => c.safety_critical).length)}
              tone="coral"
            />
          </div>
          <Card title="Prioritised maintenance candidates">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Priority / equipment</th>
                    <th>Recoverable energy</th>
                    <th>Repair cost</th>
                    <th>Net repair value</th>
                    <th>Decision</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {a.candidates.length ? (
                    a.candidates.map((c: any, i: number) => (
                      <tr key={c.fault_id}>
                        <td>
                          <b>
                            {i + 1}. {c.target}
                          </b>
                          <small>{faultNames[c.kind]}</small>
                        </td>
                        <td>{fmt(c.recoverable_energy_kwh / 1000, 2)} MWh</td>
                        <td>
                          {fmt(c.repair_cost)} {run.finance.currency}
                        </td>
                        <td>
                          {fmt(c.net_repair_value)} {run.finance.currency}
                        </td>
                        <td>
                          <span
                            className={
                              'status-pill ' +
                              (c.safety_critical
                                ? 'coral'
                                : a.selected_repairs.includes(c.fault_id)
                                  ? 'green'
                                  : 'amber')
                            }
                          >
                            {c.safety_critical
                              ? 'Safety priority'
                              : a.selected_repairs.includes(c.fault_id)
                                ? 'Schedule'
                                : 'Defer / inspect'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() =>
                              focus({
                                type: c.target_type === 'plant' ? 'inverter' : c.target_type,
                                index: c.target_index,
                              })
                            }
                          >
                            Locate <ArrowUpRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        No injected events in this scenario. Add an event in the fault laboratory to
                        assess a repair.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          {a.candidates.length > 0 && (
            <Card title="Generation with and without individual repairs">
              <Chart
                data={[
                  line(
                    Array.from({ length: 365 }, (_, i) => i + 1),
                    Array.from(
                      { length: 365 },
                      (_, d) =>
                        columns.ac_energy_kwh
                          .slice(d * 24, d * 24 + 24)
                          .map(Number)
                          .reduce((a, b) => a + b, 0) / 1000,
                    ),
                    'Current scenario',
                    '#e7a28c',
                  ),
                  ...a.candidates.slice(0, 5).map((c: any, i: number) =>
                    line(
                      Array.from({ length: 365 }, (_, d) => d + 1),
                      c.repaired_daily_kwh.map((v: number) => v / 1000),
                      `Remove ${c.target} event`,
                      ['#188f9d', '#79bda5', '#9a7ac5', '#d8ac4b', '#6f9ed4'][i],
                    ),
                  ),
                ]}
                layout={{
                  yaxis: { title: { text: 'Daily energy (MWh)' }, gridcolor: '#edf1f4' },
                  xaxis: { title: { text: 'Reference day' } },
                }}
                height={340}
              />
            </Card>
          )}
          <Note tone="amber">
            Safety-critical labels override the economic budget. Individual counterfactual benefits
            may interact and must not be added as a validated joint repair value. Diagnostic
            confidence is uncalibrated; all causes shown here are known injected events. Qualified
            electrical inspection is required.
          </Note>
        </>
      )}
    </>
  );
}

export function CleaningPage() {
  const { run, draft, set, analyse, simulate, job } = useTwin();
  const [minInterval, setMin] = useState(14);
  const [maxOps, setMax] = useState(12);
  if (!run || !draft) return null;
  const a = run.analyses.cleaning;
  const optimal = a?.strategies.find((s: any) => s.strategy === 'Economic optimum');
  const apply = () => {
    const next = {
      ...draft,
      id: 'optimised-cleaning',
      name: 'Optimised cleaning schedule',
      soiling: { ...draft.soiling, strategy: 'manual', cleaning_days: a.recommended_days },
    };
    set({ draft: next });
    void simulate(next);
  };
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">SOILING → RECOVERY → VALUE</div>
          <h1>
            Cleaning optimisation<span className="title-dot">.</span>
          </h1>
          <p>Choose when to clean using the electricity you can actually deliver.</p>
        </div>
        <button
          className="button primary"
          disabled={!!job}
          onClick={() =>
            void analyse('cleaning', { min_interval: minInterval, max_operations: maxOps })
          }
        >
          <CalendarDays size={16} />
          Optimise schedule
        </button>
      </div>
      <Card title="Scheduling constraints">
        <div className="form-grid four">
          <NumberInput
            label="Minimum cleaning interval"
            value={minInterval}
            min={1}
            max={120}
            unit="days"
            onChange={setMin}
          />
          <NumberInput
            label="Maximum operations"
            value={maxOps}
            min={1}
            max={30}
            onChange={setMax}
          />
          <div className="assumption-stat">
            <span>Total cost / operation</span>
            <b>
              {fmt(run.metadata.scenario.finance.cleaning_cost)} {run.finance.currency}
            </b>
          </div>
          <div className="assumption-stat">
            <span>Soiling accumulation</span>
            <b>{fmt(run.metadata.scenario.soiling.daily_rate * 100, 3)}% / day</b>
          </div>
        </div>
      </Card>
      {!a ? (
        <EmptyAnalysis
          title="Find the economic cleaning schedule"
          description="A finite-horizon dynamic programme evaluates daily cleaning dates against rainfall assumptions, future irradiation, inverter clipping, grid limits, costs and hourly electricity value."
          onRun={() =>
            void analyse('cleaning', { min_interval: minInterval, max_operations: maxOps })
          }
          busy={!!job}
        />
      ) : (
        <>
          <div className="metrics-grid">
            <Metric
              label="Recommended operations"
              value={fmt(optimal.operations)}
              note={`At least ${a.minimum_interval_days} days apart`}
            />
            <Metric
              label="Recovered deliverable energy"
              value={fmt(optimal.recovered_kwh / 1000, 2)}
              unit="MWh"
            />
            <Metric
              label="Net cleaning benefit"
              value={fmt(optimal.net_benefit)}
              unit={run.finance.currency}
            />
            <Metric label="Water requirement" value={fmt(optimal.water_m3)} unit="m³" />
          </div>
          <Card
            title="Strategy comparison"
            action={
              <button className="button" disabled={!!job} onClick={apply}>
                Apply optimal dates <ArrowUpRight size={14} />
              </button>
            }
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Operations</th>
                    <th>Recovered MWh</th>
                    <th>Cleaning cost</th>
                    <th>Incremental value</th>
                    <th>Net benefit</th>
                  </tr>
                </thead>
                <tbody>
                  {a.strategies.map((s: any) => (
                    <tr
                      className={s.strategy === 'Economic optimum' ? 'highlight-row' : ''}
                      key={s.strategy}
                    >
                      <td>
                        <b>{s.strategy}</b>
                      </td>
                      <td>{s.operations}</td>
                      <td>{fmt(s.recovered_kwh / 1000, 2)}</td>
                      <td>{fmt(s.cleaning_cost)}</td>
                      <td>{fmt(s.incremental_value)}</td>
                      <td>
                        {fmt(s.net_benefit)} {run.finance.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Soiling accumulation and cleaning resets">
            <Chart
              data={a.strategies.map((s: any, i: number) =>
                line(
                  Array.from({ length: 365 }, (_, d) => d + 1),
                  s.daily_soiling.map((v: number) => v * 100),
                  s.strategy,
                  ['#e19a83', '#7fa9c9', '#a589bf', '#168f9b'][i],
                ),
              )}
              layout={{
                yaxis: { title: { text: 'Soiling loss (%)' }, gridcolor: '#edf1f4' },
                xaxis: { title: { text: 'Reference day of year' } },
              }}
              height={330}
            />
          </Card>
          <Card title="Recommended cleaning calendar">
            <div className="cleaning-calendar">
              {Array.from({ length: 12 }, (_, month) => {
                const dates = a.recommended_days.filter(
                  (d: number) => new Date(Date.UTC(2001, 0, d + 1)).getUTCMonth() === month,
                );
                return (
                  <div
                    className={'calendar-month ' + (dates.length ? 'scheduled' : '')}
                    key={month}
                  >
                    <b>{new Date(2001, month, 1).toLocaleDateString('en-GB', { month: 'long' })}</b>
                    {dates.length ? (
                      dates.map((d: number) => (
                        <span key={d}>
                          <CalendarDays size={14} />
                          {new Date(Date.UTC(2001, 0, d + 1)).getUTCDate()}{' '}
                          {new Date(2001, month, 1).toLocaleDateString('en-GB', { month: 'short' })}
                        </span>
                      ))
                    ) : (
                      <small>No intervention</small>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          <Note>
            {a.method} {a.limitations}
          </Note>
        </>
      )}
    </>
  );
}
