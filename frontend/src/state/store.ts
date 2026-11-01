import { create } from 'zustand';
import { api, pollJob } from '../services/api';
import { arakTmyTime } from '../services/siteTime';
import type {
  Page,
  Scenario,
  RunData,
  Columns,
  Equipment,
  Selection,
  Heatmap,
  CameraMode,
} from '../types';
interface TwinStore {
  page: Page;
  scenarios: Scenario[];
  draft: Scenario | null;
  run: RunData | null;
  columns: Columns | null;
  equipment: Equipment | null;
  bootstrap: any;
  hour: number;
  timeMode: 'manual' | 'arak';
  selection: Selection | null;
  heatmap: Heatmap;
  camera: { mode: CameraMode; nonce: number };
  job: any;
  error: string | null;
  compare: RunData[];
  set: (patch: Partial<TwinStore>) => void;
  init: () => Promise<void>;
  simulate: (scenario?: Scenario) => Promise<void>;
  analyse: (kind: string, options?: any) => Promise<void>;
  save: () => Promise<void>;
  setHour: (hour: number) => void;
  followArakTime: (instant?: Date) => void;
  loadEquipment: () => Promise<void>;
  focus: (selection: Selection) => void;
}
let equipmentRequest = 0;
let equipmentAbort: AbortController | undefined;
const snapshots = new Map<string, Equipment>();
export const useTwin = create<TwinStore>((set, get) => ({
  page: 'overview',
  scenarios: [],
  draft: null,
  run: null,
  columns: null,
  equipment: null,
  bootstrap: null,
  hour: 4116,
  timeMode: 'manual',
  selection: null,
  heatmap: 'natural',
  camera: { mode: 'isometric', nonce: 0 },
  job: null,
  error: null,
  compare: [],
  set,
  init: async () => {
    try {
      const data = await api('/bootstrap');
      set({ bootstrap: data, scenarios: data.scenarios, draft: data.scenarios[0] });
      await get().simulate(data.scenarios[0]);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  simulate: async (scenario) => {
    const s = scenario ?? get().draft;
    if (!s) return;
    try {
      set({ error: null, job: { message: 'Starting annual simulation', progress: 0 }, draft: s });
      const { job_id } = await api('/runs', { method: 'POST', body: JSON.stringify(s) });
      const result = await pollJob(job_id, (job) => set({ job }));
      const [run, series] = await Promise.all([
        api<RunData>('/runs/' + result.run_id),
        api('/runs/' + result.run_id + '/series'),
      ]);
      set({
        run,
        columns: series.columns,
        equipment: null,
        selection: null,
        job: null,
        compare: [
          ...get().compare.filter((r) => r.metadata.scenario.id !== run.metadata.scenario.id),
          run,
        ],
      });
      await get().loadEquipment();
    } catch (e) {
      set({ error: (e as Error).message, job: null });
    }
  },
  analyse: async (kind, options = {}) => {
    const run = get().run;
    if (!run) return;
    try {
      set({ error: null, job: { message: 'Starting ' + kind, progress: 0 } });
      const { job_id } = await api('/runs/' + run.run_id + '/analysis', {
        method: 'POST',
        body: JSON.stringify({ kind, ...options }),
      });
      const result = await pollJob(job_id, (job) => set({ job }));
      // An analysis is attached only to the run that produced it.
      if (get().run?.run_id === run.run_id)
        set({
          run: { ...get().run!, analyses: { ...get().run!.analyses, [kind]: result.analysis } },
        });
      set({ job: null });
    } catch (e) {
      set({ error: (e as Error).message, job: null });
    }
  },
  save: async () => {
    const s = get().draft;
    if (!s) return;
    try {
      await api('/scenarios/' + s.id, { method: 'PUT', body: JSON.stringify(s) });
      set({ scenarios: [...get().scenarios.filter((x) => x.id !== s.id), s], error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  setHour: (hour) => {
    const next = Math.max(0, Math.min(8759, Math.round(hour)));
    set({ hour: next, timeMode: 'manual', ...(next !== get().hour ? { equipment: null } : {}) });
    void get().loadEquipment();
  },
  followArakTime: (instant = new Date()) => {
    const hour = arakTmyTime(instant).hourOfYear;
    if (hour !== get().hour) {
      set({ hour, timeMode: 'arak', equipment: null });
      void get().loadEquipment();
    } else if (get().timeMode !== 'arak') set({ timeMode: 'arak' });
  },
  loadEquipment: async () => {
    const run = get().run;
    if (!run) return;
    const request = ++equipmentRequest;
    const hour = get().hour;
    equipmentAbort?.abort();
    const controller = new AbortController();
    equipmentAbort = controller;
    const key = `${run.run_id}:${hour}`;
    const cached = snapshots.get(key);
    if (cached) {
      set({ equipment: cached });
      return;
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 45));
      if (controller.signal.aborted) return;
      const data = await api<Equipment>(`/runs/${run.run_id}/equipment?hour=${hour}`, {
        signal: controller.signal,
      });
      snapshots.set(key, data);
      if (snapshots.size > 96) snapshots.delete(snapshots.keys().next().value!);
      if (request === equipmentRequest && get().run?.run_id === run.run_id)
        set({ equipment: data });
    } catch (e) {
      if (controller.signal.aborted) return;
      if (request === equipmentRequest) set({ error: (e as Error).message });
    }
  },
  focus: (selection) =>
    set({ selection, page: 'field', camera: { mode: 'focus', nonce: get().camera.nonce + 1 } }),
}));
