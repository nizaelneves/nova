import '../lib/legacyStorage';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import './voice.css';
import './voiceWindow.css';
import { VoiceCard } from './VoiceCard';

// The voice card is its own tiny window: it loads none of the main app (no store,
// no router, no polling), only what it draws.
createRoot(document.getElementById('voice-root')!).render(
  <StrictMode>
    <VoiceCard />
  </StrictMode>,
);
