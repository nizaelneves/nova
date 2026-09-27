import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { addFilesToKnowledge, KNOWLEDGE_FILE_TYPES } from '../../lib/api';
import { useDismiss } from '../../hooks/useDismiss';
import { Icon } from '../Icon';

/** The "+" button: add files (spreadsheets, documents) so Nova can use them. */
export function AttachMenu({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, boxRef);

  const upload = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (fileRef.current) fileRef.current.value = '';
    if (files.length === 0) return;
    setOpen(false);
    setBusy(true);
    try {
      const chunks = await addFilesToKnowledge(files);
      toast.success(
        chunks > 0
          ? `Nova read ${files.length} file${files.length > 1 ? 's' : ''} (${chunks} parts saved)`
          : 'The file had no text to read',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the file', { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className="composer-icon"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        aria-label="Add"
        aria-expanded={open}
        title="Add"
      >
        <Icon name={busy ? 'refresh' : 'add-circle'} size={20} className={busy ? 'animate-spin' : undefined} />
      </button>
      {open && (
        <div className="menu" style={{ left: 0, width: '17rem' }}>
          <button type="button" className="menu-item" onClick={() => fileRef.current?.click()}>
            <Icon name="paperclip" size={18} />
            <span>
              <span className="menu-title">Add files</span>
              <span className="menu-note">{KNOWLEDGE_FILE_TYPES.join('  ')}</span>
            </span>
          </button>
          <div className="menu-item menu-soon" aria-disabled="true">
            <Icon name="document-text" size={18} />
            <span>
              <span className="menu-title">Spreadsheets (.xlsx)</span>
              <span className="menu-note">Coming soon</span>
            </span>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept={KNOWLEDGE_FILE_TYPES.join(',')}
        onChange={(e) => void upload(e.target.files)}
      />
    </div>
  );
}
