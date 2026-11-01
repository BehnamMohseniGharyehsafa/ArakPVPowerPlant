import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr } from '@react-three/drei';
import PlantScene from './PlantScene';

import { Maximize, RotateCcw, Layers, Grid2X2, Move, Box, Focus, Network } from 'lucide-react';
import { useTwin } from '../state/store';
import { fmt } from '../components/UI';
import { topology, selectionPosition, heatmaps, heatValue, heatRange } from './geometry';
import type { Heatmap } from '../types';

class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Fallback() {
  const { run, equipment, set } = useTwin();
  if (!run) return null;
  const p = run.metadata.scenario.plant;
  return (
    <div className="field-fallback">
      <p>2D equipment map · string labels and individual module cells are selectable</p>
      <div className="fallback-inverters">
        {Array.from({ length: p.inverter_count }, (_, i) => (
          <div key={i}>
            <button onClick={() => set({ selection: { type: 'inverter', index: i } })}>
              INV-{String(i + 1).padStart(2, '0')}
            </button>
            {Array.from({ length: p.strings_per_inverter }, (_, j) => {
              const index = i * p.strings_per_inverter + j;
              return (
                <div
                  className={
                    'string-row ' + (equipment?.strings[index]?.faults.length ? 'faulty' : '')
                  }
                  key={j}
                >
                  <button
                    className="string-select"
                    aria-label={`Select string ${index + 1}`}
                    onClick={() => set({ selection: { type: 'string', index } })}
                  >
                    {String(index + 1).padStart(3, '0')}
                  </button>
                  {Array.from({ length: p.modules_per_string }, (_, m) => (
                    <button
                      className="module-cell"
                      aria-label={`Select module ${index * p.modules_per_string + m + 1}`}
                      key={m}
                      onClick={() =>
                        set({
                          selection: { type: 'module', index: index * p.modules_per_string + m },
                        })
                      }
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
export default function SolarField({ expanded = false }: { expanded?: boolean }) {
  const { run, heatmap, set, camera, equipment, hour, columns } = useTwin();
  const [connections, setConnections] = useState(false);
  const [flat, setFlat] = useState(false);
  const [context, setContext] = useState(true);
  const [quality, setQuality] = useState<'balanced' | 'high'>('balanced');
  const [moving, setMoving] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ index: number; x: number; y: number } | null>(null);
  if (!run) return null;
  const span = Math.max(
    run.metadata.scenario.plant.inverter_count > 5 ? 240 : 120,
    run.metadata.scenario.plant.inverter_count * 8,
  );
  const cameraButton = (mode: any) => set({ camera: { mode, nonce: camera.nonce + 1 } });
  const legend = heatmaps[heatmap];
  const row = Object.fromEntries(Object.entries(columns ?? {}).map(([k, v]) => [k, v[hour]]));
  const legendRange = heatRange(heatmap, equipment?.strings, row, run.metadata.scenario.plant);
  const hovered = tooltip
    ? equipment?.strings[Math.floor(tooltip.index / run.metadata.scenario.plant.modules_per_string)]
    : null;
  const elevation = 90 - Number(columns?.solar_zenith_deg[hour] ?? 90),
    azimuth = Number(columns?.solar_azimuth_deg[hour] ?? 0);
  return (
    <div
      ref={fieldRef}
      className={
        'solar-field terrain-field ' + (expanded ? 'expanded' : '') + (moving ? ' navigating' : '')
      }
    >
      <div className="field-top">
        <span className="field-badge">
          <span className="status-dot" />
          ARAK / SYMBOLIC SITE MODEL
        </span>
        <select
          aria-label="Field heatmap"
          value={heatmap}
          onChange={(e) => set({ heatmap: e.target.value as Heatmap })}
        >
          {Object.entries(heatmaps).map(([key, x]) => (
            <option key={key} value={key}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-canvas">
        {flat ? (
          <Fallback />
        ) : (
          <Boundary fallback={<Fallback />}>
            <Suspense fallback={<div className="field-loading">Initialising solar field…</div>}>
              <Canvas
                frameloop="demand"
                shadows
                camera={{
                  position: [span * 0.95, span * 0.95, span * 1.15],
                  fov: 38,
                  near: 0.1,
                  far: span * 8,
                }}
                dpr={quality === 'high' ? [1, 1.8] : [1, 1.25]}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
                onCreated={({ gl }) => {
                  gl.domElement.addEventListener('webglcontextlost', () => setFlat(true));
                }}
              >
                <AdaptiveDpr pixelated />
                <PlantScene
                  moving={moving}
                  context={context}
                  quality={quality}
                  onMotion={setMoving}
                  connections={connections}
                  onHover={(index, x, y) => setTooltip(index === null ? null : { index, x, y })}
                />
              </Canvas>
            </Suspense>
          </Boundary>
        )}
      </div>
      <div className="field-quality-controls">
        <label>
          Detail
          <select
            aria-label="Rendering quality"
            value={quality}
            onChange={(e) => setQuality(e.target.value as 'balanced' | 'high')}
          >
            <option value="balanced">Balanced</option>
            <option value="high">High detail</option>
          </select>
        </label>
        <button onClick={() => setContext(!context)} aria-pressed={context}>
          Site context {context ? 'on' : 'off'}
        </button>
        <button
          aria-label="Fullscreen solar field"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void fieldRef.current?.requestFullscreen();
          }}
        >
          Fullscreen
        </button>
      </div>
      <div className="field-sun">
        <span style={{ transform: `rotate(${azimuth}deg)` }}>☀</span>Sun {fmt(elevation, 1)}°
        elevation · {fmt(azimuth)}° azimuth
      </div>
      {tooltip && hovered && !flat && (
        <div
          className="module-tooltip-host"
          style={{
            left: Math.min(tooltip.x + 12, Math.max(15, window.innerWidth - 520)),
            top: Math.max(80, tooltip.y - 120),
          }}
        >
          <div className="module-tooltip">
            <b>M-{String(tooltip.index + 1).padStart(5, '0')}</b>
            <span>
              {hovered.id} · {hovered.inverter_id}
            </span>
            <dl>
              <dt>DC potential · allocated</dt>
              <dd>{fmt(hovered.module_dc_w, 1)} W</dd>
              <dt>Delivered AC · allocated</dt>
              <dd>
                {fmt(
                  (hovered.allocated_ac_kw * 1000) / run.metadata.scenario.plant.modules_per_string,
                  1,
                )}{' '}
                W
              </dd>
              <dt>Cell temperature</dt>
              <dd>{fmt(hovered.cell_temp_c, 1)} °C</dd>
              <dt>Common effective irradiance</dt>
              <dd>{fmt(hovered.effective_irradiance_w_m2)} W/m²</dd>
              <dt>Relative DC performance</dt>
              <dd>{fmt(hovered.relative_performance * 100, 1)}%</dd>
              <dt>Rated capacity</dt>
              <dd>{run.metadata.scenario.plant.module.rated_power_w} Wp</dd>
              <dt>Fault status</dt>
              <dd>{hovered.faults.join(', ') || 'Healthy'}</dd>
            </dl>
            <small>
              {equipment?.hour === hour ? 'String model · module allocated' : 'Updating timestep…'}
            </small>
          </div>
        </div>
      )}
      <div className="field-toolbar">
        {[
          [RotateCcw, 'reset', 'Reset camera'],
          [Maximize, 'fit', 'Fit complete plant'],
          [Grid2X2, 'top', 'Top view'],
          [Box, 'isometric', 'Isometric view'],
          [Move, 'oblique', 'Inspection view'],
          [Focus, 'focus', 'Focus selection'],
        ].map(([Icon, mode, label]: any) => (
          <button
            key={mode}
            title={label}
            aria-label={label}
            onClick={() => {
              setFlat(false);
              cameraButton(mode);
            }}
          >
            <Icon size={17} />
          </button>
        ))}
        <span />
        <button
          title="Electrical connections"
          aria-label="Toggle electrical connections"
          className={connections ? 'active' : ''}
          onClick={() => setConnections(!connections)}
        >
          <Network size={17} />
        </button>
        <button
          title="2D fallback"
          aria-label="Toggle 2D field"
          className={flat ? 'active' : ''}
          onClick={() => setFlat(!flat)}
        >
          <Layers size={17} />
        </button>
      </div>
      <div className="compass">
        <b>N</b>
        <span>↑</span>
        <small>Orbit · scroll to zoom</small>
      </div>
      <div className="site-model-caption">
        Limestone-grey soil · dry terrain · symbolic roads and orchard
      </div>
      <div className="field-legend">
        <span>{legend.label}</span>
        {heatmap === 'natural' ? (
          <p className="natural-key">
            Dark silicon cells
            <br />
            Aluminium frames · modelled topology
          </p>
        ) : (
          <>
            <div className={'legend-gradient ' + (heatmap === 'temperature' ? 'thermal' : '')} />
            <div>
              <b>{fmt(legendRange[0], heatmap === 'soiling' ? 1 : 0)}</b>
              <small>{legend.unit}</small>
              <b>{fmt(legendRange[1], heatmap === 'soiling' ? 1 : 0)}</b>
            </div>
          </>
        )}
      </div>
      <div className="field-count">
        {fmt(run.summary.module_count)} modules <span>·</span> {run.summary.inverter_count} inverter
        blocks
      </div>
    </div>
  );
}
