import { useState } from 'react';
import { toast } from 'sonner';
import { dateText } from '../memoir/SortControl';
import { VideoPlayer } from '../memoir/VideoPlayer';
import { Icon } from '../Icon';
import { getBase } from '../../lib/api';
import { getAutoPlay } from '../../lib/swipe-api';
import { deleteNoteFile, renameNoteFile, type Attachment } from '../../lib/notes-api';

const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'];
const VIDEOS = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
const AUDIOS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'];
// ?frame=1: an older answer for this address (cached for a year) may carry the header that forbids frames
const FRAMES = ['pdf', 'txt', 'md'];

const why = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** A file opened inside Memoir: pictures, videos, audio, PDFs and text play or show right here. It can be renamed or deleted from its bar. */
export function FileView({ file, onClose, onOpenNote, onChanged }: { file: Attachment; onClose: () => void; onOpenNote: (id: string) => void; onChanged: (gone: boolean, label?: string) => void }) {
  const ext = file.ext.toLowerCase();
  const src = `${getBase()}${file.url}`;
  const title = file.label || file.name.slice(0, 12);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const rename = () => {
    const label = (renaming ?? '').trim();
    setRenaming(null);
    if (!label || label === title) return;
    renameNoteFile(file.name, label).then(() => { toast.success('Renamed'); onChanged(false, label); }).catch((e) => toast.error(why(e)));
  };
  const remove = () => {
    if (!sure) { setSure(true); return; }
    deleteNoteFile(file.name).then(() => { toast.success('File Deleted'); onChanged(true); }).catch((e) => toast.error(why(e)));
  };
  return (
    <div className="nt-fileview">
      <div className="nt-fv-bar">
        <button type="button" className="nt-btn" onClick={onClose}>← Return</button>
        {renaming === null
          ? <b className="truncate">{title}</b>
          : <input autoFocus className="nt-add nt-fv-name" value={renaming} aria-label="File Name" onChange={(e) => setRenaming(e.target.value)} onBlur={rename}
              onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setRenaming(null); }} />}
        <span className="nt-grow" />
        <time className="mm-cdate">Created {dateText(file.created ?? file.modified)}</time>
        {file.notes.map((n) => <button key={n.id} type="button" className="nt-back" onClick={() => onOpenNote(n.id)}><Icon name="document-text" size={13} /> <span className="truncate">{n.title || 'Untitled'}</span></button>)}
        <button type="button" className="nt-btn" onClick={() => setRenaming(title)}><Icon name="lucide-file-pen" size={14} /> Rename</button>
        <button type="button" className="nt-btn nt-danger" onClick={remove} onBlur={() => setSure(false)}><Icon name="lucide-trash" size={14} /> {sure ? 'Sure?' : 'Trash'}</button>
      </div>
      <div className="nt-fv-stage">
        {IMAGES.includes(ext) ? <img src={src} alt={title} />
          : VIDEOS.includes(ext) ? <VideoPlayer key={src} src={src} autoPlay={getAutoPlay()} />
          : AUDIOS.includes(ext) ? <audio src={src} controls autoPlay />
          : FRAMES.includes(ext) ? <iframe title={title} src={ext === 'pdf' ? `${src}?frame=1#toolbar=0&navpanes=0&view=FitH` : `${src}?frame=1`} />
          : <div className="nt-fv-none"><p>This kind of file has no preview here.</p><a className="nt-btn" href={src} download>Download</a></div>}
      </div>
    </div>
  );
}
