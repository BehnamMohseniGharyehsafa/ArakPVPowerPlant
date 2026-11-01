import { useEffect, useState } from 'react';
import {
  Sun,
  LayoutDashboard,
  Box,
  CloudSun,
  Activity,
  ChartNoAxesCombined,
  TriangleAlert,
  Wrench,
  CalendarDays,
  Wallet,
  FlaskConical,
  GitCompareArrows,
  Download,
  BookOpen,
  SlidersHorizontal,
  Play,
  LoaderCircle,
  X,
  ArrowUpRight,
  MapPin,
  Menu,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { useTwin } from './state/store';
import type { Page } from './types';
import { api } from './services/api';
import { fmt } from './components/UI';
import { Timeline } from './components/Timeline';
import Configuration from './components/Configuration';
import Inspection from './components/Inspection';
import Overview from './pages/Overview';
import { FieldPage, WeatherPage, PerformancePage, LossesPage } from './pages/Engineering';
import { FaultsPage, MaintenancePage, CleaningPage } from './pages/Operations';
import { FinancePage, UncertaintyPage, ScenariosPage, ExportsPage } from './pages/Intelligence';
import Methodology from './pages/Methodology';
const navigation: { id: Page; label: string; icon: any; group?: string }[] = [
  { id: 'overview', label: 'Plant overview', icon: LayoutDashboard, group: 'WORKSPACE' },
  { id: 'field', label: 'Interactive solar field', icon: Box },
  { id: 'weather', label: 'Weather & resource', icon: CloudSun },
  { id: 'performance', label: 'Physical simulation', icon: Activity, group: 'PERFORMANCE' },
  { id: 'losses', label: 'Energy losses', icon: ChartNoAxesCombined },
  { id: 'faults', label: 'Fault laboratory', icon: TriangleAlert },
  { id: 'maintenance', label: 'Predictive maintenance', icon: Wrench, group: 'DECISION SUPPORT' },
  { id: 'cleaning', label: 'Cleaning optimisation', icon: CalendarDays },
  { id: 'finance', label: 'Financial performance', icon: Wallet },
  { id: 'uncertainty', label: 'Uncertainty & sensitivity', icon: FlaskConical },
  {
    id: 'scenarios',
    label: 'Scenario comparison',
    icon: GitCompareArrows,
    group: 'RESEARCH & OUTPUTS',
  },
  { id: 'exports', label: 'Results & reporting', icon: Download },
  { id: 'methodology', label: 'Scientific methodology', icon: BookOpen },
];
export default function App() {
  const { page, set, init, run, draft, scenarios, simulate, job, error, columns, bootstrap } =
    useTwin();
  const [config, setConfig] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    void init();
  }, []);
  const dirty = run && draft && JSON.stringify(draft) !== JSON.stringify(run.metadata.scenario);
  const pages: Record<Page, any> = {
    overview: Overview,
    field: FieldPage,
    weather: WeatherPage,
    performance: PerformancePage,
    losses: LossesPage,
    faults: FaultsPage,
    maintenance: MaintenancePage,
    cleaning: CleaningPage,
    finance: FinancePage,
    uncertainty: UncertaintyPage,
    scenarios: ScenariosPage,
    exports: ExportsPage,
    methodology: Methodology,
  };
  const Current = pages[page];
  return (
    <div className="app-shell">
      <header className="developer-credit" aria-label="Developer information">
        <strong>Developer: Behnam Mohseni Gharyehsafa</strong>
        <span>PhD in Electronic Engineering</span>
        <a href="mailto:Mohseni.Gharyehsafa.Behnam@gmail.com">
          Mohseni.Gharyehsafa.Behnam@gmail.com
        </a>
      </header>
      <aside className={'sidebar ' + (mobile ? 'mobile-open' : '')}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            set({ page: 'overview' });
          }}
        >
          <span className="brand-mark">
            <Sun size={25} />
          </span>
          <div>
            solar field<span>PHOTOVOLTAIC INTELLIGENCE</span>
          </div>
        </a>
        <div className="workspace-label">
          <span className="status-dot" />
          Engineering workspace<span>01</span>
        </div>
        <nav>
          {navigation.map(({ id, label, icon: Icon, group }) => (
            <div key={id}>
              {group && <div className="nav-group">{group}</div>}
              <button
                aria-label={label}
                className={page === id ? 'nav-item active' : 'nav-item'}
                onClick={() => {
                  set({ page: id });
                  setMobile(false);
                }}
              >
                <Icon size={17} />
                <span>{label}</span>
                {page === id && <span className="nav-active-dot" />}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="science-card">
            <span className="science-symbol">✳</span>
            <b>Built on open science.</b>
            <p>
              Every result has a model.
              <br />
              Every model has a source.
            </p>
            <button onClick={() => set({ page: 'methodology' })}>
              Explore the methodology <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="sidebar-version">
            <span className="status-dot" />
            Python engine · pvlib<span>v1.0</span>
          </div>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <div className="plant-breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span className="plant-avatar">
              <Sun size={21} />
            </span>
            <div>
              <b>
                {run?.metadata.station.city ?? 'Arak'} reference plant <ChevronRight size={12} />
              </b>
              <span>
                <MapPin size={11} />
                {run?.metadata.station.city === 'Arak'
                  ? 'Markazi Province, Iran'
                  : `${run?.metadata.station.country ?? 'Iran'} · EPW reference`}{' '}
                · {run ? fmt(run.summary.dc_capacity_kw / 1000, 3) : '—'} MWp
              </span>
            </div>
          </div>
          <div className="topbar-right">
            <span className={'engine-status ' + (job ? 'calculating' : '')}>
              <span className="status-dot" />
              {job ? 'Calculating' : 'TMY simulation'}
            </span>
            <span className="topbar-divider" />
            <button className="button small" onClick={() => setConfig(true)} disabled={!draft}>
              <SlidersHorizontal size={15} />
              Plant configuration
            </button>
            <span className="user-avatar">SF</span>
          </div>
        </header>
        <div className="scenario-bar">
          <div>
            <span className="eyebrow">SCENARIO</span>
            <select
              aria-label="Active scenario"
              value={draft?.id ?? ''}
              disabled={!!job}
              onChange={(e) => {
                const next = scenarios.find((s) => s.id === e.target.value);
                if (next) void simulate(next);
              }}
            >
              {draft && !scenarios.some((s) => s.id === draft.id) && (
                <option value={draft.id}>{draft.name}</option>
              )}
              {scenarios.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="scenario-description">
              {dirty
                ? 'Configuration changed · run to apply'
                : run
                  ? `${run.summary.inverter_count} inverters · ${fmt(run.summary.module_count)} modules · hourly model`
                  : 'Preparing scientific engine'}
            </span>
          </div>
          <button
            className="button primary small"
            disabled={!!job || !draft}
            onClick={() => void simulate()}
          >
            {job ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}Run simulation
          </button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <TriangleAlert size={18} />
            <span>{error}</span>
            {!run && (
              <button className="button small" onClick={() => void init()}>
                Retry connection
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => set({ error: null })}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="main-content">
          {run && columns ? (
            <Current />
          ) : (
            <div className="initial-loading">
              <div className="loading-sun">
                <Sun size={45} />
              </div>
              <div className="eyebrow">PHYSICS FIRST</div>
              <h1>Bringing the solar field to life.</h1>
              <p>
                Validating Arak meteorology and calculating
                <br />a complete 8,760-hour reference simulation.
              </p>
              {job && (
                <>
                  <div className="loading-track">
                    <span style={{ width: job.progress + '%' }} />
                  </div>
                  <small>{job.message}</small>
                </>
              )}
            </div>
          )}
        </div>
        {run && columns && (
          <div className="timeline-container">
            <Timeline />
            <div className="run-footer">
              <span>
                <CheckCircle2 size={12} />
                Modelled data · no operational measurements
                {bootstrap?.hosting?.public && ' · Temporary session: export your studies'}
              </span>
              <span>
                RUN {run.run_id.slice(0, 10)} <b>·</b> pvlib {run.metadata.software.pvlib} <b>·</b>{' '}
                2001 reference calendar
              </span>
            </div>
          </div>
        )}
      </main>
      {job && run && (
        <div className="job-toast">
          <LoaderCircle size={20} className="spin" />
          <div>
            <b>{job.message}</b>
            <div className="job-track">
              <span style={{ width: job.progress + '%' }} />
            </div>
          </div>
          <strong>{job.progress}%</strong>
          {job.id && (
            <button
              className="icon-button"
              aria-label="Cancel calculation"
              onClick={() => void api('/jobs/' + job.id, { method: 'DELETE' })}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
      {config && <Configuration close={() => setConfig(false)} />}
      <Inspection />
    </div>
  );
}
