import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { fetchPings, type Ping } from '../lib/api';
import { fetchCalendarEvents, type CalendarEvent } from '../lib/connectors-api';
import { holidaysBR } from '../lib/holidaysBR';
import { fetchKanban, type Task } from '../lib/tasks-api';
import { SidePanel } from './SidePanel';
import { eventsByDay, isoDay, monthGrid } from './lib/calendar';

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A small month calendar: every task, every reminder, the events of Google Calendar and the holidays of Brazil. Press a day to read what is on it.
 */
export function CalendarPanel({ open }: { open: boolean }) {
  const today = useMemo(() => new Date(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [picked, setPicked] = useState(() => isoDay(today));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pings, setPings] = useState<Ping[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsError, setEventsError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setPicked(isoDay(today));
    fetchKanban().then((columns) => setTasks(Object.values(columns).flat())).catch(() => setTasks([]));
    fetchPings().then(setPings).catch(() => setPings([]));
  }, [open, today]);

  const year = cursor.getFullYear();
  const grid = useMemo(() => monthGrid(year, cursor.getMonth()), [year, cursor]);
  const [gridFrom, gridTo] = [isoDay(grid[0]), isoDay(grid[grid.length - 1])];

  // The events of the month on show (the six weeks of the grid), asked again for each month.
  useEffect(() => {
    if (!open) return;
    let current = true;
    fetchCalendarEvents(gridFrom, gridTo)
      .then((r) => { if (current) { setEvents(r.events); setEventsError(r.error ?? ''); } })
      .catch(() => { if (current) { setEvents([]); setEventsError(''); } });
    return () => { current = false; };
  }, [open, gridFrom, gridTo]);

  const holidays = useMemo(() => [year - 1, year, year + 1].flatMap(holidaysBR), [year]);
  const days = useMemo(() => eventsByDay(tasks, pings, holidays, events), [tasks, pings, holidays, events]);
  const todayIso = isoDay(today);
  const shown = days.get(picked);
  const step = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <SidePanel open={open} label="Calendar">
      <div className="cal-nav">
        <button type="button" aria-label="Previous month" onClick={() => step(-1)}><Icon name="alt-arrow-down" size={16} style={{ transform: 'rotate(90deg)' }} /></button>
        <b>{cursor.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</b>
        <button type="button" aria-label="Next month" onClick={() => step(1)}><Icon name="alt-arrow-down" size={16} style={{ transform: 'rotate(-90deg)' }} /></button>
        <button type="button" className="cal-today" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setPicked(todayIso); }}>Today</button>
      </div>

      <div className="cal-grid" role="grid" aria-label="Month">
        {WEEK.map((w, i) => <span key={i} className="cal-wd">{w}</span>)}
        {grid.map((d) => {
          const key = isoDay(d);
          const e = days.get(key);
          return (
            <button
              key={key}
              type="button"
              className="cal-day"
              data-out={d.getMonth() !== cursor.getMonth() || undefined}
              data-today={key === todayIso || undefined}
              data-picked={key === picked || undefined}
              data-holiday={!!e?.holiday || undefined}
              aria-label={`${key}${e?.holiday ? `, ${e.holiday}` : ''}`}
              onClick={() => setPicked(key)}
            >
              {d.getDate()}
              <span className="cal-dots">
                {e && e.events.length > 0 && <i data-k="event" />}
                {e && e.tasks.length > 0 && <i data-k="task" />}
                {e && e.pings.length > 0 && <i data-k="ping" />}
                {e?.holiday && <i data-k="holiday" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-key"><span><i data-k="event" />Events</span><span><i data-k="holiday" />Holidays</span><span><i data-k="ping" />Pings</span><span><i data-k="task" />Tasks</span></div>

      <ul className="cal-list">
        {shown?.holiday && <li><i data-k="holiday" /><span>{shown.holiday}</span><small>Holiday</small></li>}
        {shown?.events.map((e) => <li key={e.id}><i data-k="event" /><span>{e.title}</span><small>{e.all_day ? 'All day' : e.time}</small></li>)}
        {shown?.tasks.map((t) => <li key={t.id}><i data-k="task" /><span data-done={t.status === 'done' || undefined}>{t.title}</span><small>{t.all_day ? 'All day' : t.due.slice(11, 16)}</small></li>)}
        {shown?.pings.map((p) => <li key={p.id}><i data-k="ping" /><span>{p.text}</span><small>{p.time}</small></li>)}
        {!shown?.holiday && !shown?.tasks.length && !shown?.pings.length && !shown?.events.length && <li className="cal-none">Nothing On This Day.</li>}
        {eventsError && <li className="cal-none">Google Calendar: {eventsError}</li>}
      </ul>
    </SidePanel>
  );
}
