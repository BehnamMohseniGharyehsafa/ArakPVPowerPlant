import type { Selection, Heatmap } from '../types';
export function topology(p: any) {
  const columns = Math.min(5, Math.ceil(Math.sqrt(p.inverter_count)));
  const rows = Math.ceil(p.inverter_count / columns);
  const modulePitch = p.module.width_m + 0.045;
  const blockWidth = p.modules_per_string * modulePitch + 6;
  const blockDepth = p.strings_per_inverter * p.row_pitch_m + 8;
  const width = columns * blockWidth,
    depth = rows * blockDepth;
  const angle = ((p.azimuth_deg - 180) * Math.PI) / 180;
  const transform = (x: number, z: number): [number, number] => [
    x * Math.cos(angle) + z * Math.sin(angle),
    -x * Math.sin(angle) + z * Math.cos(angle),
  ];
  const positions = Array.from(
    { length: p.inverter_count * p.strings_per_inverter * p.modules_per_string },
    (_, i) => {
      const string = Math.floor(i / p.modules_per_string),
        inv = Math.floor(string / p.strings_per_inverter);
      const x =
        (inv % columns) * blockWidth + (i % p.modules_per_string) * modulePitch - width / 2 + 3;
      const z =
        Math.floor(inv / columns) * blockDepth +
        (string % p.strings_per_inverter) * p.row_pitch_m -
        depth / 2 +
        5;
      const [rx, rz] = transform(x, z);
      return {
        x: rx,
        y: p.clearance_m + (p.module.length_m * Math.sin((p.tilt_deg * Math.PI) / 180)) / 2,
        z: rz,
        string,
        inv,
      };
    },
  );
  const inverters = Array.from({ length: p.inverter_count }, (_, i) => {
    const [x, z] = transform(
      (i % columns) * blockWidth + blockWidth / 2 - width / 2 - 1,
      Math.floor(i / columns) * blockDepth - depth / 2 + 1,
    );
    return { x, y: 0.9, z };
  });
  return {
    positions,
    inverters,
    width,
    depth,
    angle,
    span: Math.max(width, depth),
    columns,
    blockWidth,
    blockDepth,
  };
}
export function selectionPosition(p: any, selection: Selection | null) {
  const layout = topology(p);
  if (!selection) return { x: 0, y: 0, z: 0 };
  if (selection.type === 'inverter')
    return layout.inverters[selection.index] ?? layout.inverters[0];
  return (
    layout.positions[
      selection.type === 'module'
        ? selection.index
        : selection.index * p.modules_per_string + Math.floor(p.modules_per_string / 2)
    ] ?? layout.positions[0]
  );
}
export function heatValue(mode: Heatmap, string: any, row: any, p: any): number {
  if (!string) return 0;
  switch (mode) {
    case 'natural':
      return 0;
    case 'output':
      return string.module_dc_w;
    case 'performance':
      return string.relative_performance * 100;
    case 'temperature':
      return string.cell_temp_c;
    case 'irradiance':
      return string.effective_irradiance_w_m2;
    case 'soiling':
      return Number(string.soiling_fraction ?? row.soiling_fraction) * 100;
    case 'shading':
      return Number(string.shading_fraction ?? row.shading_fraction) * 100;
    case 'electrical':
      return Math.max(0, (1 - string.relative_performance) * 100);
    case 'fault':
      return (string.fault_severity ?? 0) * 100;
    case 'recoverable':
      return string.dc_gap_to_clean_potential_w ?? 0;
  }
}
export const heatmaps: Record<Heatmap, { label: string; unit: string; range: [number, number] }> = {
  natural: { label: 'Natural appearance', unit: '', range: [0, 1] },
  output: { label: 'DC output', unit: 'W / module', range: [0, 850] },
  performance: { label: 'Relative performance', unit: '%', range: [0, 100] },
  temperature: { label: 'Cell temperature', unit: '°C', range: [-10, 75] },
  irradiance: { label: 'Effective irradiance', unit: 'W/m²', range: [0, 1200] },
  soiling: { label: 'Soiling loss', unit: '%', range: [0, 30] },
  shading: { label: 'Row shading', unit: '%', range: [0, 100] },
  electrical: { label: 'Electrical underperformance', unit: '%', range: [0, 100] },
  fault: { label: 'Injected fault severity', unit: '% · configured event', range: [0, 100] },
  recoverable: { label: 'DC gap to clean potential', unit: 'W / module', range: [0, 300] },
};

export function heatRange(
  mode: Heatmap,
  strings: any[] | undefined,
  row: any,
  plant: any,
): [number, number] {
  if (!strings?.length) return heatmaps[mode].range;
  const values = strings.map((s) => heatValue(mode, s, row, plant)).filter(Number.isFinite);
  const high = Math.max(0, ...values);
  if (mode === 'temperature')
    return [Math.floor(Math.min(...values) / 5) * 5 - 5, Math.ceil(high / 5) * 5 + 5];
  if (mode === 'output' || mode === 'recoverable')
    return [0, Math.max(50, Math.ceil(high / 50) * 50)];
  if (mode === 'irradiance') return [0, Math.max(100, Math.ceil(high / 100) * 100)];
  if (mode === 'soiling') return [0, Math.max(0.1, Math.ceil(high * 10) / 10)];
  if (mode === 'shading') return [0, Math.max(1, Math.ceil(high))];
  return [0, Math.max(100, Math.ceil(high))];
}
