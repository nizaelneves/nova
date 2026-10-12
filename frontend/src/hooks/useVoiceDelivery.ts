import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { isTauri } from '../lib/api';
import { notifyPhibe } from '../lib/phibePresence';
import { useAppStore } from '../lib/store';

interface VoiceResult {
  id: number;
  text: string;
  mode: 'send' | 'draft';
}

/**
 * Takes what the desktop app heard with the global voice shortcut and hands it to the chat.
 *
 * - "send": if the window is hidden (Phibe is in the tray) it quietly moves to the chat page so
 *   the message goes out; if the user is looking at another page it does not pull them away:
 *   a notice offers the chat and the message goes out when they open it.
 * - "draft": nothing opens by itself. The text waits in the message box of the chat and a
 *   notice (the badge on the avatar) says so; the user decides whether to send it.
 */
export function useVoiceDelivery() {
  const navigate = useNavigate();
  const location = useLocation();
  const setPendingVoice = useAppStore((s) => s.setPendingVoice);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<VoiceResult>('voice:result', (event) => {
        const { text, mode } = event.payload;
        setPendingVoice(event.payload);
        if (mode === 'draft') {
          notifyPhibe('draft', text);
          return;
        }
        if (location.pathname === '/') return;
        if (document.hidden) {
          navigate('/');
        } else {
          toast('Voice message ready', { description: text, action: { label: 'Open chat', onClick: () => navigate('/') } });
        }
      }).then((off) => {
        if (cancelled) off();
        else unlisten = off;
      }),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [location.pathname, navigate, setPendingVoice]);
}
