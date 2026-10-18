import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { addFilesToKnowledge, KNOWLEDGE_FILE_TYPES } from '../../lib/api';
import { Icon } from '../Icon';
import { PickerModal, PickerRow } from '../PickerModal';

/** The "+" button: opens a pop-up to add files (spreadsheets, documents) so Phibe can use them. */
export function AttachMenu({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'files' | 'context'>('files');
  const fileRef = useRef<HTMLInputElement>(null);

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
          ? `Phibe read ${files.length} file${files.length > 1 ? 's' : ''} (${chunks} parts saved)`
          : 'The file had no text to read',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the file', { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="composer-icon"
        onClick={() => { setTab('files'); setOpen(true); }}
        disabled={disabled || busy}
        aria-label="Add"
        title="Add"
      >
        <Icon name={busy ? 'refresh' : 'add-circle'} size={20} className={busy ? 'animate-spin' : undefined} />
      </button>
      {open && (
        <PickerModal tabs={[{ id: 'files', label: 'Files or Photos' }, { id: 'context', label: 'Context @' }]} tab={tab} onTab={setTab}
          onClose={() => setOpen(false)}
          footer={<span>{tab === 'files' ? KNOWLEDGE_FILE_TYPES.join('  ') : 'Coming soon'}</span>}>
          {tab === 'files' ? (
            <PickerRow icon={<Icon name="paperclip" size={16} />} title="Add Files or Photos"
              onClick={() => fileRef.current?.click()} />
          ) : (
            <PickerRow icon={<Icon name="database" size={16} />} title="Add Context @" soon />
          )}
        </PickerModal>
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept={KNOWLEDGE_FILE_TYPES.join(',')}
        onChange={(e) => void upload(e.target.files)}
      />
    </>
  );
}
