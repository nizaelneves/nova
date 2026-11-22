import { Icon } from '../Icon';
import { getBase } from '../../lib/api';
import type { Attachment } from '../../lib/notes-api';

const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'];
const VIDEOS = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
const AUDIOS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'];
// ?frame=1: an older answer for this address (cached for a year) may carry the header that forbids frames
const FRAMES = ['pdf', 'txt', 'md'];

/** A file opened inside Memoir: pictures, videos, audio, PDFs and text play or show right here. */
export function FileView({ file, onClose, onOpenNote }: { file: Attachment; onClose: () => void; onOpenNote: (id: string) => void }) {
  const ext = file.ext.toLowerCase();
  const src = `${getBase()}${file.url}`;
  const title = file.label || file.name.slice(0, 12);
  return (
    <div className="nt-fileview">
      <div className="nt-fv-bar">
        <button type="button" className="nt-btn" onClick={onClose}>← Return</button>
        <b className="truncate">{title}</b>
        <span className="nt-grow" />
        {file.notes.map((n) => <button key={n.id} type="button" className="nt-back" onClick={() => onOpenNote(n.id)}><Icon name="document-text" size={13} /> <span className="truncate">{n.title || 'Untitled'}</span></button>)}
      </div>
      <div className="nt-fv-stage">
        {IMAGES.includes(ext) ? <img src={src} alt={title} />
          : VIDEOS.includes(ext) ? <video src={src} controls autoPlay playsInline />
          : AUDIOS.includes(ext) ? <audio src={src} controls autoPlay />
          : FRAMES.includes(ext) ? <iframe title={title} src={ext === 'pdf' ? `${src}?frame=1#toolbar=0&navpanes=0&view=FitH` : `${src}?frame=1`} />
          : <div className="nt-fv-none"><p>This kind of file has no preview here.</p><a className="nt-btn" href={src} download>Download</a></div>}
      </div>
    </div>
  );
}
