import { ComposedChart } from '../charts/composed-chart';
import { Grid } from '../charts/grid';
import { SeriesBar } from '../charts/series-bar';
import { ChartTooltip } from '../charts/tooltip';
import { results } from '../../lib/projects';
import { type Task } from '../../lib/tasks-api';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** What a project has delivered: the numbers, the last eight weeks and every finished task. */
export function Results({ tasks, color }: { tasks: Task[]; color: string }) {
  const r = results(tasks, new Date());
  if (r.done === 0) return <div className="pj-soon">Nothing delivered yet. Finished tasks show up here.</div>;
  const tiles = [
    { label: 'Delivered', value: String(r.done) },
    { label: 'Completion', value: `${r.rate}%` },
    { label: 'On Time', value: `${r.onTime}%` },
    { label: 'Days To Finish', value: String(r.avgDays) },
  ];
  return (
    <div className="pj-results" style={{ ['--c' as string]: color }}>
      <div className="pj-rtiles">
        {tiles.map((t) => <div key={t.label}><b>{t.value}</b><small>{t.label}</small></div>)}
      </div>
      <div className="pj-rchart">
        <h4>Delivered Per Week</h4>
        <ComposedChart data={r.weeks} xDataKey="date" aspectRatio="16 / 5" barGap={2} maxBarSize={28} margin={{ top: 8, right: 6, bottom: 4, left: 6 }}>
          <Grid horizontal numTicksRows={3} />
          <SeriesBar dataKey="done" fill={color} radius={4} />
          <ChartTooltip showCrosshair={false} dotSize={6} rows={(p) => [{ color, label: 'Delivered', value: String(p.done) }]} />
        </ComposedChart>
        <div className="pj-rweeks">{r.weeks.map((w) => <span key={w.date.getTime()}>{w.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>)}</div>
      </div>
      <ul className="pj-rlist">
        {r.delivered.map((t) => {
          const late = t.completed_at!.slice(0, 10) > t.due.slice(0, 10);
          return (
            <li key={t.id}>
              <span>{t.title}</span>
              <small>{t.area || 'Personal'}</small>
              <em data-late={late}>{late ? 'Late' : 'On Time'}</em>
              <b>{day(t.completed_at!)}</b>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
