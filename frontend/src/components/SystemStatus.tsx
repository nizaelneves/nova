import { useEffect, useState } from 'react';
import { fetchSpeechHealth } from '../lib/api';
import { CloudProviderStatus, OllamaModelList } from './keys';

/** Which models and engines Phibe can use right now: local models, cloud keys and the transcription engine. */
export function SystemStatus() {
  const [speech, setSpeech] = useState<boolean | null>(null);
  useEffect(() => {
    fetchSpeechHealth().then((h) => setSpeech(h.available)).catch(() => setSpeech(false));
  }, []);

  return (
    <>
      <div className="hz-stat">
        <span>Local models</span>
        <OllamaModelList />
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
      <div className="hz-stat">
        <span>Transcription engine</span>
        <b className="hz-mono">{speech === null ? 'Checking…' : speech ? 'Available' : 'Not configured'}</b>
      </div>
    </>
  );
}
