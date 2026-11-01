import { useState } from 'react';
import { X, Save, Play, SlidersHorizontal } from 'lucide-react';
import { useTwin } from '../state/store';
import { NumberInput, Note, fmt } from './UI';
export default function Configuration({ close }: { close: () => void }) {
  const { draft, set, simulate, save, job } = useTwin();
  const [tab, setTab] = useState('Plant');
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  if (!draft) return null;
  const update = (group: string, key: string, value: any) => {
    const next = structuredClone(draft);
    if (group === 'module') next.plant.module[key] = value;
    else (next as any)[group][key] = value;
    set({ draft: next });
  };
  const field = (
    group: string,
    key: string,
    label: string,
    unit?: string,
    step = 1,
    min?: number,
    max?: number,
  ) => (
    <NumberInput
      key={key}
      label={label}
      unit={unit}
      value={group === 'module' ? draft.plant.module[key] : (draft as any)[group][key]}
      step={step}
      min={min}
      max={max}
      onChange={(value) => update(group, key, value)}
    />
  );
  const p = draft.plant;
  const count = p.modules_per_string * p.strings_per_inverter * p.inverter_count;
  return (
    <div className="modal-backdrop" onClick={close}>
      <aside className="configuration" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <div className="eyebrow">ENGINEERING INPUTS</div>
            <h2>Configure the plant</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close configuration">
            <X />
          </button>
        </div>
        <div className="tabs">
          {['Plant', 'Physics', 'Operations', 'Finance', 'Advanced'].map((t) => (
            <button
              key={t}
              className={tab === t ? 'selected' : ''}
              onClick={() => {
                setTab(t);
                if (t === 'Advanced') setJson(JSON.stringify(draft, null, 2));
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="configuration-body">
          {tab === 'Plant' && (
            <>
              <div className="derived-capacity">
                <span>Installed nameplate</span>
                <strong>
                  {fmt((count * p.module.rated_power_w) / 1e6, 4)} <small>MWp</small>
                </strong>
                <p>{fmt(count)} modules · integer electrical topology</p>
              </div>
              <div className="form-grid">
                {field('module', 'rated_power_w', 'Module power', 'Wp', 1, 1)}
                {field('plant', 'modules_per_string', 'Modules per string', undefined, 1, 1, 60)}
                {field(
                  'plant',
                  'strings_per_inverter',
                  'Strings per inverter',
                  undefined,
                  1,
                  1,
                  40,
                )}
                {field('plant', 'inverter_count', 'Inverter count', undefined, 1, 1, 50)}
                <NumberInput
                  label="Target DC capacity"
                  unit="kWp · rounds inverter count"
                  value={(count * p.module.rated_power_w) / 1000}
                  step={100}
                  onChange={(v) =>
                    update(
                      'plant',
                      'inverter_count',
                      Math.max(
                        1,
                        Math.round(
                          (v * 1000) /
                            (p.modules_per_string *
                              p.strings_per_inverter *
                              p.module.rated_power_w),
                        ),
                      ),
                    )
                  }
                />
                {field('plant', 'inverter_ac_kw', 'Inverter rating', 'kW', 1, 1)}
                {field('module', 'width_m', 'Module width', 'm', 0.001)}
                {field('module', 'length_m', 'Module length', 'm', 0.001)}
                {field('plant', 'tilt_deg', 'Tilt', '°', 1, 0, 75)}
                {field('plant', 'azimuth_deg', 'Azimuth · north = 0°', '°', 1, 0, 359)}
                {field('plant', 'row_pitch_m', 'Row pitch', 'm', 0.1)}
                {field('plant', 'clearance_m', 'Lower-edge clearance', 'm', 0.1)}
                <label className="input-label">
                  <span>Module technology</span>
                  <select
                    value={p.module.bifacial ? 'bifacial' : 'monofacial'}
                    onChange={(e) => update('module', 'bifacial', e.target.value === 'bifacial')}
                  >
                    <option value="bifacial">Bifacial</option>
                    <option value="monofacial">Monofacial</option>
                  </select>
                </label>
                {field('module', 'bifaciality', 'Bifaciality', 'fraction', 0.01, 0, 1)}
                {field('plant', 'albedo', 'Ground albedo', 'fraction', 0.01, 0, 0.95)}
              </div>
              <Note>
                GCR is derived as module slope length / row pitch:{' '}
                {fmt(p.module.length_m / p.row_pitch_m, 3)}. DC/AC ratio:{' '}
                {fmt(
                  (count * p.module.rated_power_w) / 1000 / (p.inverter_count * p.inverter_ac_kw),
                  3,
                )}
                . The 3D layout uses this same topology.
              </Note>
            </>
          )}
          {tab === 'Physics' && (
            <>
              <Note>
                Illustrative module inputs are not a complete manufacturer specification. Supply a
                documented datasheet through the advanced configuration for voltage/current checks
                or the single-diode model.
              </Note>
              <div className="form-grid">
                {field('module', 'efficiency', 'STC efficiency', 'fraction', 0.0001)}
                {field('module', 'gamma_pdc', 'Power temperature coefficient', '1/°C', 0.0001)}
                {field('module', 'vmp_v', 'STC Vmp', 'V', 0.01)}
                {field(
                  'plant',
                  'inverter_efficiency',
                  'Nominal inverter efficiency',
                  'fraction',
                  0.001,
                )}
                {field('plant', 'dc_loss', 'DC wiring loss', 'fraction', 0.001)}
                {field('plant', 'ac_loss', 'AC wiring loss', 'fraction', 0.001)}
                {field('plant', 'rear_structure_loss', 'Rear structure loss', 'fraction', 0.01)}
                <label className="input-label">
                  <span>Temperature model</span>
                  <select
                    value={p.temperature_model}
                    onChange={(e) => update('plant', 'temperature_model', e.target.value)}
                  >
                    <option value="faiman">Faiman + cell correction</option>
                    <option value="sandia">Sandia open-rack</option>
                  </select>
                </label>
                {field('plant', 'faiman_u0', 'Faiman U₀', 'W/m²K', 0.1)}
                {field('plant', 'faiman_u1', 'Faiman U₁', 'W·s/m³K', 0.01)}
                {field('plant', 'cell_delta_t_c', 'Cell / module ΔT at 1000 W/m²', '°C', 0.1)}
                {field('plant', 'latitude', 'Plant latitude · null uses EPW', '°', 0.0001)}
                {field('plant', 'longitude', 'Plant longitude · null uses EPW', '°', 0.0001)}
              </div>
            </>
          )}
          {tab === 'Operations' && (
            <div className="form-grid">
              {field('plant', 'availability', 'Expected availability', 'fraction', 0.001, 0, 1)}
              <NumberInput
                label="Export limit"
                unit="kW · blank = no limit"
                value={p.export_limit_kw ?? ''}
                onChange={(v) => update('plant', 'export_limit_kw', Number.isFinite(v) ? v : null)}
              />
              {field('plant', 'annual_degradation', 'Annual degradation', 'fraction', 0.001)}
              {field('plant', 'operating_year', 'Operating year')}
              {field('soiling', 'initial_loss', 'Initial soiling', 'fraction', 0.001)}
              {field('soiling', 'daily_rate', 'Daily soiling accumulation', 'fraction/day', 0.0001)}
              <label className="input-label">
                <span>Cleaning strategy</span>
                <select
                  value={draft.soiling.strategy}
                  onChange={(e) => update('soiling', 'strategy', e.target.value)}
                >
                  {['none', 'fixed', 'threshold', 'manual'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              {field('soiling', 'interval_days', 'Fixed interval', 'days')}
              {field('soiling', 'threshold', 'Cleaning threshold', 'fraction', 0.01)}
              <label className="input-label">
                <span>Natural rain cleaning</span>
                <select
                  value={draft.soiling.rain_mode}
                  onChange={(e) => update('soiling', 'rain_mode', e.target.value)}
                >
                  <option value="none">Assumed no rainfall</option>
                  <option value="epw">Use EPW rainfall · requires valid data</option>
                  <option value="illustrative">Illustrative rain days · set in JSON</option>
                </select>
              </label>
              <NumberInput
                label="Ambient offset"
                unit="°C"
                value={draft.ambient_offset_c}
                onChange={(v) => set({ draft: { ...draft, ambient_offset_c: v } })}
              />
              <NumberInput
                label="Resource multiplier"
                unit="fraction"
                step={0.01}
                value={draft.resource_factor}
                onChange={(v) => set({ draft: { ...draft, resource_factor: v } })}
              />
            </div>
          )}
          {tab === 'Finance' && (
            <>
              <Note>
                All prices and costs are editable illustrative assumptions. Currency is a label; no
                exchange rates are applied.
              </Note>
              <div className="form-grid">
                <label className="input-label">
                  <span>Currency</span>
                  <input
                    value={draft.finance.currency}
                    onChange={(e) => update('finance', 'currency', e.target.value)}
                  />
                </label>
                {[
                  ['price_per_kwh', 'Electricity value', '/kWh', 0.001],
                  ['capex', 'Installation cost', '', 1000],
                  ['annual_opex', 'Annual operating cost', '/year', 100],
                  ['cleaning_cost', 'Total cleaning cost', '/operation', 10],
                  ['cleaning_labour_cost', 'Cleaning labour assumption', '', 10],
                  ['cleaning_equipment_cost', 'Cleaning equipment assumption', '', 10],
                  ['water_m3_per_clean', 'Water use', 'm³/operation', 1],
                  ['discount_rate', 'Discount rate', 'fraction', 0.01],
                  ['horizon_years', 'Analysis horizon', 'years', 1],
                  ['replacement_cost', 'Inverter replacement cost', '', 100],
                  ['replacement_year', 'Replacement year', '', 1],
                  ['cost_escalation', 'Cost escalation', 'fraction', 0.01],
                  ['price_escalation', 'Electricity value escalation', 'fraction', 0.01],
                  ['repair_delay_days', 'Repair response time', 'days', 1],
                  ['repair_budget', 'Repair budget', '', 100],
                ].map(([key, label, unit, step]) =>
                  field('finance', String(key), String(label), String(unit), Number(step)),
                )}
              </div>
            </>
          )}
          {tab === 'Advanced' && (
            <>
              <Note>
                Full versioned scenario JSON, including custom module parameters, electrical limits,
                hourly prices, cleaning dates and timed faults. Backend validation applies when you
                run.
              </Note>
              <textarea
                className="json-editor"
                spellCheck={false}
                value={json}
                onChange={(e) => setJson(e.target.value)}
              />
              {jsonError && <p className="error-text">{jsonError}</p>}
              <button
                className="button"
                onClick={() => {
                  try {
                    const next = JSON.parse(json);
                    if (!next.plant?.module || !next.finance || !next.soiling)
                      throw new Error('A complete scenario is required');
                    set({ draft: next });
                    setJsonError('');
                  } catch (e) {
                    setJsonError((e as Error).message);
                  }
                }}
              >
                Apply JSON to configuration
              </button>
            </>
          )}
        </div>
        <div className="panel-footer">
          <button className="button" onClick={() => void save()}>
            <Save size={16} />
            Save scenario
          </button>
          <button
            className="button primary"
            disabled={!!job}
            onClick={() => {
              void simulate();
              close();
            }}
          >
            <Play size={16} />
            Run simulation
          </button>
        </div>
      </aside>
    </div>
  );
}
