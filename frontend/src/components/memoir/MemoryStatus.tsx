import { useEffect, useState } from 'react';
import { notesStatus, type NotesStatus } from '../../lib/notes-api';

/** Whether the memory behind the mentor is awake: the embedding model that reads the notes, and how much is indexed. */
export function MemoryStatus() {
  const [s, setS] = useState<NotesStatus | null | 'off'>(null);
  useEffect(() => {
    const load = () => notesStatus().then(setS).catch(() => setS('off'));
    load(); const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const on = s !== null && s !== 'off';
  const st = on ? s : null;
  const busy = !!st && st.pending > 0;
  return (
    <div className="mm-mem" data-state={!on ? 'off' : busy ? 'busy' : 'on'}>
      <i />
      <small>{st ? `${st.embedding_model || 'Embedding Model'} · ${st.indexed} Of ${st.indexed + st.pending}` : s === null ? 'Checking…' : 'Not Responding'}</small>
    </div>
  );
}
