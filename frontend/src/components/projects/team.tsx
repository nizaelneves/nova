import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { type ManagedAgent, fetchManagedAgents } from '../../lib/api';
import { type Member, addMember, colorFor, initials, loadTeam, removeMember, saveTeam, updateMember } from '../../lib/team';

const EVERYONE = 'all';

const STATUS: Record<ManagedAgent['status'], { text: string; color: string }> = {
  idle: { text: 'Idle', color: '#8d96ab' },
  running: { text: 'Working', color: '#20e7aa' },
  paused: { text: 'Paused', color: '#ff9d4a' },
  error: { text: 'Error', color: '#ff6b6b' },
  archived: { text: 'Archived', color: '#8d96ab' },
  needs_attention: { text: 'Needs You', color: '#ff9d4a' },
  budget_exceeded: { text: 'Over Budget', color: '#ff6b6b' },
  stalled: { text: 'Stalled', color: '#ff9d4a' },
};

/** A person: a round, coloured avatar, a coloured frame and the HUMAN tag. */
function HumanCard({ member, onChange, onRemove }: { member: Member; onChange: (changes: Partial<Omit<Member, 'id'>>) => void; onRemove: () => void }) {
  const color = colorFor(member.name);
  return (
    <article className="pj-tcard pj-thuman" style={{ ['--c' as string]: color }}>
      <button type="button" className="pj-tx" aria-label={`Remove ${member.name}`} onClick={onRemove}><Icon name="trash-bin-minimalistic" size={15} /></button>
      <span className="pj-avatar">{initials(member.name)}</span>
      <em className="pj-tkind">Human</em>
      <b>{member.name}</b>
      <small>{member.role || 'No Role'}</small>
      <input className="pj-tnow" value={member.current} onChange={(e) => onChange({ current: e.target.value })} placeholder="No Active Task" aria-label={`Current task of ${member.name}`} />
    </article>
  );
}

/** An agent: a squared, glowing frame, a robot mark, the AGENT tag and a live state. */
function AgentCard({ name, kind, state, children, onRemove }: { name: string; kind: string; state?: { text: string; color: string }; children: React.ReactNode; onRemove?: () => void }) {
  return (
    <article className="pj-tcard pj-tagent">
      {onRemove && <button type="button" className="pj-tx" aria-label={`Remove ${name}`} onClick={onRemove}><Icon name="trash-bin-minimalistic" size={15} /></button>}
      <span className="pj-avatar"><Icon name="bot" size={24} /></span>
      <em className="pj-tkind">Agent</em>
      <b>{name}</b>
      <small>{kind}</small>
      {state && <span className="pj-tstate" style={{ color: state.color, borderColor: state.color }}>{state.text}</span>}
      {children}
    </article>
  );
}

/** Everyone who works on your projects in one grid: people and agents you add, plus the agents Phibe lists on its own. */
export function Team() {
  const [store, setStore] = useState(loadTeam);
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [kind, setKind] = useState<Member['kind']>('human');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const members = store[EVERYONE] ?? [];

  useEffect(() => { saveTeam(store); }, [store]);
  useEffect(() => {
    let alive = true;
    const load = () => fetchManagedAgents().then((a) => alive && setAgents(a.filter((x) => x.status !== 'archived'))).catch(() => alive && setAgents([]));
    void load();
    const id = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const put = (next: Member[]) => setStore((s) => ({ ...s, [EVERYONE]: next }));
  const add = () => { put(addMember(members, name, role, kind)); setName(''); setRole(''); };
  const listed = new Set(agents.map((a) => a.name.toLowerCase()));

  return (
    <div className="pj-tgrid">
      {members.filter((m) => m.kind !== 'agent').map((m) => <HumanCard key={m.id} member={m} onChange={(c) => put(updateMember(members, m.id, c))} onRemove={() => put(removeMember(members, m.id))} />)}
      {agents.map((a) => (
        <AgentCard key={a.id} name={a.name} kind={a.agent_type} state={STATUS[a.status] ?? STATUS.idle}>
          <p className="pj-tnow">{a.current_activity || 'No Active Task'}</p>
          <small>{a.total_runs ?? 0} Runs{a.last_run_at ? ` · ${new Date(a.last_run_at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</small>
        </AgentCard>
      ))}
      {members.filter((m) => m.kind === 'agent' && !listed.has(m.name.toLowerCase())).map((m) => (
        <AgentCard key={m.id} name={m.name} kind={m.role || 'No Role'} onRemove={() => put(removeMember(members, m.id))}>
          <input className="pj-tnow" value={m.current} onChange={(e) => put(updateMember(members, m.id, { current: e.target.value }))} placeholder="No Active Task" aria-label={`Current task of ${m.name}`} />
        </AgentCard>
      ))}
      <form className="pj-tcard pj-tnew" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="pj-tkinds" role="tablist" aria-label="Kind">
          {(['human', 'agent'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} data-on={kind === k} onClick={() => setKind(k)}>{k === 'human' ? 'Human' : 'Agent'}</button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Member Name" />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" aria-label="Member Role" />
        <button type="submit" className="pj-add" disabled={!name.trim()}><Icon name="add-circle" size={16} /> Add {kind === 'human' ? 'Person' : 'Agent'}</button>
      </form>
    </div>
  );
}
