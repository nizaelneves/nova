import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../components/Icon';
import { approveAction, denyAction, fetchPendingApprovals } from '../lib/api';
import type { PendingApproval } from '../lib/api';
import { timeAgo } from '../lib/time';

const TIER: Record<PendingApproval['tier'], { label: string; color: string }> = {
  trivial: { label: 'Trivial', color: 'var(--color-text-tertiary)' },
  low: { label: 'Low', color: '#60a5fa' },
  medium: { label: 'Medium', color: '#d9a441' },
  high: { label: 'High', color: 'var(--color-error)' },
};

/** Actions that agents want to take and that wait for your yes or no. */
export function ApprovalsPage() {
  const [approvals, setApprovals] = useState<PendingApproval[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    fetchPendingApprovals().then(setApprovals).catch(() => setApprovals([]));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const decide = async (id: string, action: 'approve' | 'deny') => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await (action === 'approve' ? approveAction(id) : denyAction(id));
      setApprovals((prev) => prev?.filter((a) => a.id !== id) ?? prev);
      toast.success(action === 'approve' ? 'Approved' : 'Denied');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your answer');
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  return (
    <div className="flex flex-col h-full px-6 py-5 gap-4 overflow-y-auto">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-heading)' }}>Approvals</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          Actions your agents want to take. Nothing runs until you say yes.
        </p>
      </div>

      {approvals === null && <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>}

      {approvals && approvals.length === 0 && (
        <div className="finance-card text-center py-10">
          <Icon name="shield-check" size={28} style={{ color: 'var(--color-accent-light)', margin: '0 auto 0.5rem' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nothing is waiting for you.</p>
        </div>
      )}

      <div className="flex flex-col gap-3 max-w-3xl">
        {approvals?.map((a) => {
          const tier = TIER[a.tier] ?? TIER.trivial;
          const isOpen = !!open[a.id];
          return (
            <div key={a.id} className="finance-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="task-tab-count" style={{ color: tier.color }}>{tier.label}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {a.action_type} · {timeAgo(a.created_at)}
                    </span>
                  </div>
                  <p className="text-sm break-words" style={{ color: 'var(--color-text)' }}>{a.description}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => void decide(a.id, 'deny')} disabled={busy[a.id]}
                    className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                    style={{ color: 'var(--color-error)', border: '1px solid var(--color-border)' }}>
                    Deny
                  </button>
                  <button type="button" onClick={() => void decide(a.id, 'approve')} disabled={busy[a.id]}
                    className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                    style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
                    Approve
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [a.id]: !isOpen }))}
                className="flex items-center gap-1 text-xs mt-2 cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
                <Icon name="alt-arrow-down" size={12} style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
                {isOpen ? 'Hide details' : 'Show details'}
              </button>
              {isOpen && (
                <pre className="text-xs mt-2 p-3 rounded-lg overflow-x-auto"
                  style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  {JSON.stringify(a.payload, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
