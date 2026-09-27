import { useState } from 'react';
import { Icon } from '../Icon';
import type { SpeechState } from '../../hooks/useSpeech';

interface MicButtonProps {
  state: SpeechState;
  onClick: () => void;
  disabled?: boolean;
  reason?: 'not-enabled' | 'no-backend' | 'streaming';
}

export function MicButton({ state, onClick, disabled, reason }: MicButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const tooltipText =
    reason === 'not-enabled'
      ? 'Enable in Settings'
      : reason === 'no-backend'
        ? 'Speech backend not configured'
        : reason === 'streaming'
          ? 'Wait for response'
          : state === 'recording'
            ? 'Stop recording'
            : state === 'transcribing'
              ? 'Transcribing...'
              : 'Voice input';

  const isInactive = disabled || state === 'transcribing';

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        onClick={onClick}
        disabled={isInactive}
        className="composer-icon"
        data-recording={state === 'recording'}
        aria-label={tooltipText}
        title={tooltipText}
      >
        <Icon name={state === 'transcribing' ? 'refresh' : 'microphone'} size={20} className={state === 'transcribing' ? 'animate-spin' : undefined} />
      </button>
      {showTooltip && isInactive && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap pointer-events-none"
          style={{
            background: 'var(--color-text)',
            color: 'var(--color-bg)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {tooltipText}
        </div>
      )}
    </div>
  );
}
