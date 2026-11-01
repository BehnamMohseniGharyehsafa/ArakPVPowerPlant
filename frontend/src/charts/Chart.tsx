import { useEffect, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
export default function Chart({
  data,
  layout = {},
  height = 280,
}: {
  data: any[];
  layout?: any;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const revision = useRef(0);
  const queue = useRef<Promise<any>>(Promise.resolve());
  const [error, setError] = useState('');
  useEffect(() => {
    const node = ref.current!;
    active.current = true;
    const observer = new ResizeObserver(() => {
      if (active.current && node.isConnected)
        queue.current = queue.current
          .then(() => (active.current && node.isConnected ? Plotly.Plots.resize(node) : undefined))
          .catch(() => undefined);
    });
    observer.observe(node);
    return () => {
      active.current = false;
      observer.disconnect();
      queue.current = queue.current.then(() => Plotly.purge(node)).catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    const node = ref.current!;
    const current = ++revision.current;
    // Plotly updates are asynchronous. Serialise updates and defer purge until drawing finishes.
    queue.current = queue.current
      .then(async () => {
        if (!active.current || current !== revision.current) return;
        await Plotly.react(
          node,
          data,
          {
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { family: 'Inter, Segoe UI, sans-serif', size: 11, color: '#71818f' },
            margin: { l: 55, r: 22, t: 18, b: 48 },
            hovermode: 'x unified',
            showlegend: true,
            legend: { orientation: 'h', y: -0.24, x: 0 },
            xaxis: { gridcolor: '#edf1f4', zeroline: false },
            yaxis: { gridcolor: '#edf1f4', zeroline: false, rangemode: 'tozero' },
            ...layout,
            height,
            autosize: true,
          },
          {
            responsive: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            toImageButtonOptions: { format: 'svg', filename: 'solar-field-chart' },
          },
        );
      })
      .catch((e) => {
        if (active.current) setError('Chart could not render: ' + (e as Error).message);
      });
  }, [data, layout, height]);
  return (
    <>
      {error && <p className="error-text">{error}</p>}
      <div className="plot" ref={ref} style={{ height }} />
    </>
  );
}
export const line = (x: any[], y: any[], name: string, color: string, fill = false) => ({
  x,
  y,
  name,
  type: 'scatter',
  mode: 'lines',
  line: { color, width: 2.4 },
  fill: fill ? 'tozeroy' : undefined,
  fillcolor: fill ? color + '15' : undefined,
  hovertemplate: '%{y:,.2f}<extra>' + name + '</extra>',
});
