import { useEffect, useRef, useState } from 'react';
import { type Task } from '../../lib/tasks-api';
import { layoutDay } from '../../lib/projects';

const HH = 52; // pixels per hour

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const clock = (h: number) => `${Math.floor(h) % 12 || 12}:${pad(Math.round((h % 1) * 60))} ${h < 12 ? 'AM' : 'PM'}`;

/** A Google-Calendar style week: all-day row on top, hours down the side, tasks as one-hour blocks. */
export function WeekCalendar({ tasks, colorOf, onOpen }: { tasks: Task[]; colorOf: (areaId: string | null) => string; onOpen: (task: Task) => void }) {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => { if (body.current) body.current.scrollTop = 7 * HH; }, []);
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t); }, []);

  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i));
  const today = isoDay(now);
  const nowHour = now.getHours() + now.getMinutes() / 60;

  const on = (day: Date) => tasks.filter((t) => t.due.slice(0, 10) === isoDay(day));

  return (
    <div className="flex flex-col gap-2">
      <div className="pj-cnav">
        <button type="button" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>‹</button>
        <button type="button" onClick={() => setOffset(0)}>Today</button>
        <button type="button" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>›</button>
        <b>{sunday.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
      </div>
      <div className="pj-cal">
        <div className="pj-cal-head">
          <div />
          {days.map((d) => (
            <div key={d.getTime()} data-today={isoDay(d) === today}>
              {d.toLocaleDateString('en', { weekday: 'short' }).toUpperCase()}
              <b>{d.getDate()}</b>
            </div>
          ))}
        </div>
        <div className="pj-cal-allday">
          <div />
          {days.map((d) => (
            <div key={d.getTime()}>
              {on(d).filter((t) => t.all_day).map((t) => (
                <button key={t.id} type="button" className="pj-ev pj-ev-allday" data-done={t.status === 'done'} style={{ ['--c' as string]: colorOf(t.area_id) }} onClick={() => onOpen(t)}>{t.title}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="pj-cal-body" ref={body}>
          <div className="pj-cal-grid" style={{ height: 24 * HH }}>
            <div className="pj-cal-col">
              {Array.from({ length: 23 }, (_, k) => <span key={k} className="pj-cal-hour" style={{ top: (k + 1) * HH }}>{hourLabel(k + 1)}</span>)}
            </div>
            {days.map((d) => {
              const timed = on(d).filter((t) => !t.all_day).map((t) => {
                const start = Number(t.due.slice(11, 13)) + Number(t.due.slice(14, 16)) / 60;
                return { task: t, start, end: start + 1 };
              });
              return (
                <div key={d.getTime()} className="pj-cal-col">
                  {Array.from({ length: 24 }, (_, k) => <div key={k} className="pj-cal-line" style={{ top: k * HH }} />)}
                  {isoDay(d) === today && <div className="pj-cal-now" style={{ top: nowHour * HH }} />}
                  {layoutDay(timed).map(({ item, lane, lanes }) => (
                    <button
                      key={item.task.id}
                      type="button"
                      className="pj-ev"
                      data-done={item.task.status === 'done'}
                      style={{ ['--c' as string]: colorOf(item.task.area_id), top: item.start * HH + 1, height: HH - 3, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 8px)` }}
                      onClick={() => onOpen(item.task)}
                    >
                      {item.task.title}
                      <small>{clock(item.start)}</small>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
