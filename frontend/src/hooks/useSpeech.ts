import { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeAudio, fetchSpeechHealth } from '../lib/api';

export type SpeechState = 'idle' | 'recording' | 'transcribing';

export function useSpeech() {
  const [state, setState] = useState<SpeechState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  /** How loud the voice is right now, 0 to 1 (for the voice card's bars). */
  const levelRef = useRef(0);
  const meterRef = useRef<{ stop: () => void } | null>(null);

  const stopMeter = useCallback(() => {
    meterRef.current?.stop();
    meterRef.current = null;
    levelRef.current = 0;
  }, []);

  // Check if speech backend is available on mount
  useEffect(() => {
    fetchSpeechHealth()
      .then((health) => setAvailable(health.available))
      .catch(() => setAvailable(false));
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;

      // Measure the loudness while recording, only for the voice card.
      const audio = new AudioContext();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 512;
      audio.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let frame = 0;
      const measure = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += ((v - 128) / 128) ** 2;
        levelRef.current = Math.min(1, Math.sqrt(sum / samples.length) * 4);
        frame = requestAnimationFrame(measure);
      };
      measure();
      meterRef.current = { stop: () => { cancelAnimationFrame(frame); void audio.close(); } };
      setState('recording');
    } catch (err) {
      const name = err instanceof DOMException ? err.name : 'Error';
      const reasons: Record<string, string> = {
        NotAllowedError: 'Microphone blocked (browser or Windows privacy setting)',
        NotFoundError: 'No microphone found',
        NotReadableError: 'Microphone is in use by another app or unavailable',
        OverconstrainedError: 'Microphone does not support the requested settings',
      };
      setError(`${reasons[name] ?? 'Could not start the microphone'} [${name}]`);
      setState('idle');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== 'recording') {
        reject(new Error('Not recording'));
        return;
      }

      recorder.onstop = async () => {
        stopMeter();
        setState('transcribing');

        // Stop all audio tracks
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];

        try {
          const result = await transcribeAudio(blob);
          setState('idle');
          resolve(result.text);
        } catch (err) {
          setState('idle');
          const msg = err instanceof Error ? err.message : 'Transcription failed';
          setError(msg);
          reject(err);
        }
      };

      recorder.stop();
    });
  }, [stopMeter]);

  /** Stops without keeping or transcribing anything. */
  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
    stopMeter();
    setState('idle');
  }, [stopMeter]);

  return {
    state,
    error,
    available,
    startRecording,
    stopRecording,
    cancelRecording,
    levelRef,
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
  };
}
