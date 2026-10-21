import { useEffect, useState } from 'react';
import { Card } from '../Card';
import { bytes, percent, sparkline } from '../lib/computer';
import { useComputer, watchComputer } from '../lib/computerFeed';
import { SystemStatus } from '../../components/SystemStatus';

const Section = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <section className="hz-sec">
    <h4>{title}{note && <span>{note}</span>}</h4>
    {children}
  </section>
);

/** The colour of a bar that fills up as something gets busy: calm, then warm, then red. */
const load = (value: number) => (value > 90 ? '#ff6b6b' : value > 75 ? '#ffe3bd' : undefined);

const Meter = ({ label, value, detail, color = load(value) }: { label: string; value: number; detail: string; color?: string }) => (
  <div className="hz-meter">
    <span>{label}</span>
    <b>{detail}</b>
    <i><u style={{ width: `${Math.min(100, value)}%`, background: color }} /></i>
  </div>
);

const Spark = ({ history, max }: { history: number[]; max?: number }) => (
  <svg className="hz-spark" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">
    <polyline points={sparkline(history, 120, 28, max)} fill="none" stroke="#20e7aa" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>
);

/** Everything about this machine, live: processor, memory, graphics card, disks, network, battery, the busiest programs and Ollama. Reads at full speed while it is on screen; the app keeps the last reading so it opens already full. */
export function ComputerWidget() {
  const report = useComputer((s) => s.report);
  const failed = useComputer((s) => s.failed);
  const cpuHistory = useComputer((s) => s.cpuHistory);
  const [rank, setRank] = useState<'cpu' | 'memory'>('cpu');

  useEffect(() => watchComputer(), []);

  if (!report) return <Card><p className="hz-note">{failed ? 'The Phibe backend is not answering.' : 'Reading the system…'}</p></Card>;

  const { cpu, memory, gpus, programs, ollama } = report;
  const list = rank === 'cpu' ? programs.by_cpu : programs.by_memory;
  return (
    <Card note={report.os}>
      <Section title="Processor" note={cpu.name.replace(/\s+with .*$/i, '').replace(/\s+\d+-Core Processor$/i, '')}>
        <div className="hz-split"><p className="hz-big">{Math.round(cpu.usage)}%<small>{cpu.cores} cores · {cpu.threads} threads{cpu.mhz ? ` · ${(cpu.mhz / 1000).toFixed(1)} GHz` : ''}</small></p><Spark history={cpuHistory} max={100} /></div>
        <div className="hz-cores" aria-label="Use of each processor thread">
          {cpu.each.map((u, i) => <i key={i} title={`Thread ${i + 1}: ${Math.round(u)}%`}><u style={{ height: `${Math.max(4, u)}%` }} /></i>)}
        </div>
      </Section>

      <Section title="Memory">
        <Meter label="In use" value={percent(memory.used, memory.total)} detail={`${bytes(memory.used)} of ${bytes(memory.total)}`} />
        {memory.swap_total > 0 && <Meter label="Swap" value={percent(memory.swap_used, memory.swap_total)} detail={`${bytes(memory.swap_used)} of ${bytes(memory.swap_total)}`} />}
      </Section>

      {gpus.map((g) => (
        <Section key={g.name} title="Graphics card" note={g.name.replace(/^NVIDIA\s+(GeForce\s+)?/i, '')}>
          <Meter label="Use" value={g.usage} detail={`${g.usage}% · ${g.temperature}°C`} />
          <Meter label="Video memory" value={percent(g.memory_used, g.memory_total)} detail={`${bytes(g.memory_used)} of ${bytes(g.memory_total)}`} />
        </Section>
      ))}

      <Section title="Busiest programs">
        <div className="hz-tabs2" role="tablist">
          <button type="button" role="tab" aria-selected={rank === 'cpu'} data-on={rank === 'cpu'} onClick={() => setRank('cpu')}>Processor</button>
          <button type="button" role="tab" aria-selected={rank === 'memory'} data-on={rank === 'memory'} onClick={() => setRank('memory')}>Memory</button>
        </div>
        <ul className="hz-list">
          {list.map((p) => <li key={p.name}><span>{p.name.replace(/\.exe$/i, '')}</span><b className="hz-mono">{rank === 'cpu' ? `${p.cpu.toFixed(1)}%` : bytes(p.memory)}</b></li>)}
        </ul>
        <p className="hz-note">Phibe is Using {bytes(report.phibe.memory)} Of Memory</p>
      </Section>

      <Section title="Ollama" note={ollama.running ? `Version ${ollama.version}` : undefined}>
        {ollama.running ? (
          <ul className="hz-list">
            <li><span>Models Installed</span><b>{ollama.installed}</b></li>
          </ul>
        ) : <p className="hz-note">Ollama is not running.</p>}
      </Section>

      <Section title="Status">
        <SystemStatus />
      </Section>
    </Card>
  );
}
