import { useEffect, useRef } from 'react';
import { ClapPatternTracker, peakVolume } from '../lib/clapDetector';

/**
 * Listens for a double-clap on the microphone and fires `onDoubleClap` —
 * foreground-only: a dedicated low-overhead audio stream that lives only as
 * long as this component is mounted and `enabled` is true (e.g. paused while
 * a voice recording is already in progress, torn down when the chat page
 * unmounts or the setting is switched off). Never requests the microphone at
 * all unless `enabled` is true, so there's no silent background listening.
 */
export function useClapToActivate(enabled: boolean, onDoubleClap: () => void): void {
  const onDoubleClapRef = useRef(onDoubleClap);
  onDoubleClapRef.current = onDoubleClap;

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let rafId = 0;

    // How long to just listen before arming detection, to measure this
    // room's actual ambient level. Without this, the tracker's floor starts
    // at 0 and a merely-present room hum would look like a permanent "clap"
    // it can never recover from (everything above silence reads as loud).
    const CALIBRATION_MS = 300;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ctx = new AudioContext();
        // Browsers create a new AudioContext suspended unless resumed from a
        // direct user gesture; this one starts from a useEffect, so without
        // an explicit resume() the analyser would silently read all zeros.
        await ctx.resume();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);

        const sampleVolume = () => {
          analyser.getByteTimeDomainData(buf);
          return peakVolume(buf);
        };

        // Calibration pass: average the room's ambient level for a moment
        // before arming the tracker with it as the starting floor.
        const calibrationStart = performance.now();
        let floorSum = 0;
        let floorSamples = 0;
        await new Promise<void>((resolve) => {
          const sample = () => {
            if (cancelled) { resolve(); return; }
            floorSum += sampleVolume();
            floorSamples += 1;
            if (performance.now() - calibrationStart < CALIBRATION_MS) {
              requestAnimationFrame(sample);
            } else {
              resolve();
            }
          };
          sample();
        });
        if (cancelled) return;
        const tracker = new ClapPatternTracker(undefined, floorSamples > 0 ? floorSum / floorSamples : 0);

        // An instant, zero-latency chime the moment a double-clap is heard —
        // played locally with an oscillator, not fetched from anywhere — so
        // there's immediate proof the gesture registered, independent of how
        // long the greeting takes to come back from the speech backend.
        const chime = () => {
          if (!ctx) return;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        };

        const loop = () => {
          if (tracker.feed(sampleVolume(), performance.now())) {
            chime();
            onDoubleClapRef.current();
          }
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        // Mic denied/unavailable/in use — fail silently; the setting stays on
        // but simply has no effect until the mic becomes available.
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [enabled]);
}
