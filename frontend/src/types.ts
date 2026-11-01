export type Page =
  | 'overview'
  | 'field'
  | 'weather'
  | 'performance'
  | 'losses'
  | 'faults'
  | 'maintenance'
  | 'cleaning'
  | 'finance'
  | 'uncertainty'
  | 'scenarios'
  | 'exports'
  | 'methodology';
export interface Scenario {
  id: string;
  name: string;
  schema_version: number;
  weather_id: string;
  plant: any;
  soiling: any;
  finance: any;
  faults: any[];
  ambient_offset_c: number;
  resource_factor: number;
  seed: number;
}
export interface RunData {
  run_id: string;
  summary: any;
  metadata: any;
  finance: any;
  analyses: Record<string, any>;
}
export type Columns = Record<string, (number | string)[]>;
export interface Equipment {
  hour: number;
  strings: any[];
  inverters: any[];
}
export interface Selection {
  type: 'module' | 'string' | 'inverter';
  index: number;
}
export type Heatmap =
  | 'natural'
  | 'output'
  | 'performance'
  | 'temperature'
  | 'irradiance'
  | 'soiling'
  | 'shading'
  | 'electrical'
  | 'fault'
  | 'recoverable';
export type CameraMode = 'isometric' | 'top' | 'oblique' | 'fit' | 'reset' | 'focus';
