import { X, Focus, ArrowUpRight } from 'lucide-react';
import { useTwin } from '../state/store';
import { fmt, Note } from './UI';
export default function Inspection() {
  const { selection, set, run, equipment, focus, hour } = useTwin();
  if (!selection || !run || !equipment) return null;
  const p = run.metadata.scenario.plant;
  const stringIndex =
    selection.type === 'module'
      ? Math.floor(selection.index / p.modules_per_string)
      : selection.type === 'string'
        ? selection.index
        : selection.index * p.strings_per_inverter;
  const string = equipment.strings[stringIndex];
  if (!string) return null;
  const inverter = equipment.inverters[string.inverter_index];
  const isModule = selection.type === 'module',
    isInv = selection.type === 'inverter';
  const id = isModule
    ? `M-${String(selection.index + 1).padStart(5, '0')}`
    : isInv
      ? inverter.id
      : string.id;
  const faults = run.metadata.scenario.faults.filter(
    (f: any) =>
      f.target === 'plant' ||
      (f.target === 'inverter' && f.target_index === string.inverter_index) ||
      (f.target === 'string' && f.target_index === stringIndex),
  );
  return (
    <aside className="inspection">
      <div className="panel-header">
        <div>
          <div className="eyebrow">EQUIPMENT INSPECTOR</div>
          <h2>{id}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close inspector"
          onClick={() => set({ selection: null })}
        >
          <X size={18} />
        </button>
      </div>
      <span className={'status-pill ' + (string.faults.length ? 'coral' : 'green')}>
        {string.faults.length ? 'Injected event active' : 'Healthy modelled operation'}
      </span>
      <div className="inspection-power">
        <strong>
          {fmt(
            isInv ? inverter.ac_power_kw : isModule ? string.module_dc_w : string.dc_power_kw,
            2,
          )}
        </strong>
        <span>
          {isModule ? 'W DC · allocated' : isInv ? 'kW AC · modelled' : 'kW DC · modelled'}
        </span>
      </div>
      <dl className="detail-list">
        <dt>Connected string</dt>
        <dd>
          <button onClick={() => set({ selection: { type: 'string', index: stringIndex } })}>
            {string.id}
          </button>
        </dd>
        <dt>Connected inverter</dt>
        <dd>
          <button
            onClick={() => set({ selection: { type: 'inverter', index: string.inverter_index } })}
          >
            {inverter.id}
          </button>
        </dd>
        <dt>Cell temperature</dt>
        <dd>{fmt(string.cell_temp_c, 1)} °C</dd>
        <dt>Effective irradiance</dt>
        <dd>{fmt(string.effective_irradiance_w_m2)} W/m²</dd>
        <dt>DC relative performance</dt>
        <dd>{fmt(string.relative_performance * 100, 1)}%</dd>
        <dt>Rated capacity</dt>
        <dd>
          {fmt(
            isModule
              ? p.module.rated_power_w
              : isInv
                ? p.inverter_ac_kw * 1000
                : p.module.rated_power_w * p.modules_per_string,
          )}{' '}
          {isInv ? 'W AC' : 'Wp'}
        </dd>
        <dt>STC string Vmp</dt>
        <dd>{fmt(p.module.vmp_v * p.modules_per_string, 1)} V</dd>
        <dt>Simulation hour</dt>
        <dd>{hour} / 8759</dd>
      </dl>
      <button className="button full" onClick={() => focus(selection)}>
        <Focus size={16} />
        Focus camera
      </button>
      <Note>
        String-homogeneous model. Module power is allocated uniformly. Independent module
        measurements and I–V curves are unavailable.
      </Note>
      <h4>Event history</h4>
      {faults.length ? (
        faults.map((f: any) => (
          <div key={f.id} className="event-history">
            <b>{f.kind.replaceAll('_', ' ')}</b>
            <span>
              Hours {f.start_hour}–{Math.min(8760, f.start_hour + f.duration_hours)} ·{' '}
              {fmt(f.severity * 100)}%
            </span>
          </div>
        ))
      ) : (
        <p className="muted">No injected events affect this equipment.</p>
      )}
      <button className="text-button" onClick={() => set({ page: 'faults' })}>
        Open fault laboratory <ArrowUpRight size={14} />
      </button>
    </aside>
  );
}
