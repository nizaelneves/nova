import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { convertFileToMarkdown, KNOWLEDGE_FILE_TYPES } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { Icon } from '../Icon';
import { PickerModal, PickerRow } from '../PickerModal';

/** The "+" button: adds files (documents, spreadsheets) to this conversation only. They are kept with it, as Markdown, until you remove them. */
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
      const app = useAppStore.getState();
      const convId = app.activeId ?? app.createConversation(app.selectedModel);
      for (const file of files) {
        const done = await convertFileToMarkdown(file);
        useAppStore.getState().addConversationFile(convId, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: done.name, markdown: done.markdown, addedAt: Date.now() });
      }
      toast.success(`Phibe read ${files.length} file${files.length > 1 ? 's' : ''}; ${files.length > 1 ? 'they stay' : 'it stays'} with this chat`);
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
