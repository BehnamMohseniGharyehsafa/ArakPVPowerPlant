import type { ReactNode } from 'react';
import { ArrowUpRight, Info, LoaderCircle } from 'lucide-react';
export const fmt = (n: number, d = 0) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }).format(
        n,
      )
    : '—';
export function Card({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'card ' + className}>
      {title && (
        <div className="card-heading">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h3>{title}</h3>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Metric({
  label,
  value,
  unit,
  note,
  icon,
  tone = 'teal',
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  icon?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <span className={'metric-icon ' + tone}>{icon ?? <ArrowUpRight size={17} />}</span>
      </div>
      <div className="metric-value">
        {value}
        <span>{unit}</span>
      </div>
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}
export function Note({ children, tone = 'blue' }: { children: ReactNode; tone?: string }) {
  return (
    <div className={'note ' + tone}>
      <Info size={16} />
      <div>{children}</div>
    </div>
  );
}
export function EmptyAnalysis({
  title,
  description,
  onRun,
  busy,
}: {
  title: string;
  description: string;
  onRun: () => void;
  busy: boolean;
}) {
  return (
    <div className="analysis-start">
      <div className="analysis-symbol">✳</div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="button primary" disabled={busy} onClick={onRun}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <ArrowUpRight size={16} />}Run
        calculation
      </button>
    </div>
  );
}
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string;
  value: number | string | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="input-label">
      <span>
        {label}
        {unit && <small>{unit}</small>}
      </span>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}
