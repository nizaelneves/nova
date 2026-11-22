import { useCallback, useEffect, useState } from 'react';
import { apiFetch, checkHealth, fetchSpeechHealth } from '../lib/api';
import { CloudProviderStatus, EmbeddingModelList, OllamaModelList } from './keys';

/** A green dot when something works, a red one when it does not, grey while it is being checked. */
function Dot({ on }: { on: boolean | null }) {
  return <i className="hz-dot" data-on={on === null ? undefined : String(on)} aria-hidden="true" />;
}

const Row = ({ label, on, tip, children }: { label: string; on?: boolean | null; tip?: string; children?: React.ReactNode }) => (
  <div className="hz-stat hz-stat-row" title={tip}>
    <span>{label}</span>
    <span className="hz-stat-end">{children}<Dot on={on ?? null} /></span>
  </div>
);

interface VoiceModel { model: string; installed: boolean; downloading: boolean; size_mb: number }

/** Which parts of Phibe work right now: the server, the models and the voice. */
export function SystemStatus() {
  const [server, setServer] = useState<boolean | null>(null);
  const [speech, setSpeech] = useState<boolean | null>(null);
  const [voice, setVoice] = useState<VoiceModel | null>(null);

  const loadVoice = useCallback(() => {
    apiFetch('/v1/speech/model').then((r) => (r.ok ? r.json() : null)).then(setVoice).catch(() => setVoice(null));
  }, []);

  useEffect(() => {
    checkHealth().then(setServer);
    fetchSpeechHealth().then((h) => setSpeech(h.available)).catch(() => setSpeech(false));
    loadVoice();
  }, [loadVoice]);

  // Follow the voice model's download while it runs.
  useEffect(() => {
    if (!voice?.downloading) return undefined;
    const id = setInterval(loadVoice, 2500);
    return () => clearInterval(id);
  }, [voice?.downloading, loadVoice]);

  const download = async () => {
    const res = await apiFetch('/v1/speech/model/download', { method: 'POST' });
    if (res.ok) setVoice(await res.json());
  };

  return (
    <>
      <Row label="Server" on={server} />
      <div className="hz-stat">
        <span>Local models</span>
        <OllamaModelList />
      </div>
      <div className="hz-stat">
        <span>Embedding models</span>
        <EmbeddingModelList />
      </div>
      <div className="hz-stat">
        <span>Cloud models</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <CloudProviderStatus label="OpenAI" keyName="OPENAI_API_KEY" toolName="openai" />
          <CloudProviderStatus label="Anthropic" keyName="ANTHROPIC_API_KEY" toolName="anthropic" />
          <CloudProviderStatus label="Google" keyName="GEMINI_API_KEY" toolName="gemini" />
          <CloudProviderStatus label="OpenRouter" keyName="OPENROUTER_API_KEY" toolName="openrouter" />
          <CloudProviderStatus label="TypeSafe" keyName="TYPESAFE_API_KEY" toolName="jev" />
        </div>
      </div>
      <Row label="Voice model" on={voice ? voice.installed : null} tip={voice ? `${voice.model}${voice.installed ? '' : `, ${voice.size_mb} MB`}` : undefined}>
        {voice && !voice.installed ? (
          <button type="button" className="set-btn" disabled={voice.downloading} onClick={() => void download()}>
            {voice.downloading ? 'Downloading…' : `Download (${voice.size_mb} MB)`}
          </button>
        ) : undefined}
      </Row>
      <Row label="Transcription engine" on={speech} />
    </>
  );
}
