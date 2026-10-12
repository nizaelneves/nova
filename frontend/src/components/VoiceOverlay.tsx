import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../lib/api';
import { VoiceCardView, useVoiceEvents } from '../voice/VoiceCard';
import '../voice/voice.css';

/**
 * The voice card inside the app (desktop): while Phibe is open and in front, the recording
 * shows as the card alone. The avatar with its ring only shows in the floating window,
 * when the user is in another app.
 */
function DesktopVoiceCard() {
  const { state, levelRef } = useVoiceEvents();
  if (state.phase === 'idle' || state.floating) return null;
  return (
    <div className="vc-inapp">
      <VoiceCardView state={state} levelRef={levelRef} avatar={false} onAction={(action) => void invoke('voice_action', { action })} />
    </div>
  );
}

export function VoiceOverlay() {
  return isTauri() ? <DesktopVoiceCard /> : null;
}
