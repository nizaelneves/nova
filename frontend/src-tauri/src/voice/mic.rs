//! Microphone capture with `cpal`.
//!
//! The stream is opened only while the user is listening and dropped right after,
//! so an idle Phibe never holds the microphone (and Windows' "mic in use" icon stays
//! honest). The audio callback keeps the work tiny: downmix, resample to 16 kHz, update
//! the level and the speech/silence clock, keep the samples for transcription.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample};

use super::audio::{to_mono, LevelMeter, Resampler, SpeechDetector, TARGET_RATE};
use super::problem::Problem;

/// More than the longest recording we allow (30 s) plus slack, so memory stays bounded.
const MAX_SAMPLES: usize = TARGET_RATE as usize * 35;

/// What the audio thread shares with the coordinator.
pub struct Shared {
    level_bits: AtomicU32,
    ready: AtomicBool,
    quiet_ms: AtomicU64,
    elapsed_ms: AtomicU64,
    speech_seen: AtomicBool,
    problem: Mutex<Option<Problem>>,
    samples: Mutex<Vec<f32>>,
}

impl Shared {
    fn new() -> Self {
        Self {
            level_bits: AtomicU32::new(0f32.to_bits()),
            ready: AtomicBool::new(false),
            quiet_ms: AtomicU64::new(0),
            elapsed_ms: AtomicU64::new(0),
            speech_seen: AtomicBool::new(false),
            problem: Mutex::new(None),
            samples: Mutex::new(Vec::new()),
        }
    }

    pub fn level(&self) -> f32 {
        f32::from_bits(self.level_bits.load(Ordering::Relaxed))
    }

    /// True once the first real samples have arrived (the card shows "arming" until then).
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Relaxed)
    }

    /// Milliseconds since speech was last heard.
    pub fn quiet_ms(&self) -> u64 {
        self.quiet_ms.load(Ordering::Relaxed)
    }

    /// Length of the recording so far.
    pub fn elapsed_ms(&self) -> u64 {
        self.elapsed_ms.load(Ordering::Relaxed)
    }

    /// Something real was said (not just a click or a cough).
    pub fn speech_seen(&self) -> bool {
        self.speech_seen.load(Ordering::Relaxed)
    }

    pub fn take_problem(&self) -> Option<Problem> {
        self.problem.lock().ok().and_then(|mut e| e.take())
    }

    /// Everything recorded so far, 16 kHz mono.
    pub fn take_samples(&self) -> Vec<f32> {
        self.samples.lock().map(|mut s| std::mem::take(&mut *s)).unwrap_or_default()
    }
}

/// Turns each chunk of 16 kHz mono audio into the shared level, clock and samples.
struct Processor {
    meter: LevelMeter,
    detector: SpeechDetector,
    shared: Arc<Shared>,
}

impl Processor {
    fn new(shared: Arc<Shared>) -> Self {
        Self { meter: LevelMeter::new(), detector: SpeechDetector::new(), shared }
    }

    fn push(&mut self, mono: &[f32]) {
        let level = self.meter.push(mono);
        self.detector.feed(mono);
        let s = &self.shared;
        s.level_bits.store(level.to_bits(), Ordering::Relaxed);
        s.quiet_ms.store(self.detector.quiet_ms(), Ordering::Relaxed);
        s.elapsed_ms.store(self.detector.elapsed_ms(), Ordering::Relaxed);
        s.speech_seen.store(self.detector.speech_seen(), Ordering::Relaxed);
        s.ready.store(true, Ordering::Relaxed);
        if let Ok(mut samples) = s.samples.lock() {
            if samples.len() < MAX_SAMPLES {
                samples.extend_from_slice(mono);
            }
        }
    }
}

pub struct Mic {
    // Dropping the stream closes the device; for the debug stand-in, `stop` ends its thread.
    _stream: Option<cpal::Stream>,
    shared: Arc<Shared>,
    stop: Arc<AtomicBool>,
}

impl Drop for Mic {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

/// Names of the input devices, for the settings list.
pub fn input_names() -> Vec<String> {
    cpal::default_host()
        .input_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}

impl Mic {
    pub fn shared(&self) -> &Arc<Shared> {
        &self.shared
    }

    /// Opens the named input device (or the Windows default) and starts capturing.
    pub fn open(name: Option<&str>) -> Result<Self, Problem> {
        // Debug builds only: `PHIBE_VOICE_TEST_WAV=<file.wav>` replaces the microphone with a
        // recorded file (then silence), played at real-time pace through the same pipeline,
        // so the whole flow can be tested without speaking.
        #[cfg(debug_assertions)]
        if let Some(mic) = Self::open_test_wav() {
            return Ok(mic);
        }

        let host = cpal::default_host();
        // A chosen microphone that is unplugged falls back to the default one.
        let chosen = name.and_then(|wanted| host.input_devices().ok()?.find(|d| d.name().is_ok_and(|n| n == wanted)));
        let device = chosen.or_else(|| host.default_input_device()).ok_or(Problem::NoMic)?;
        let supported = device
            .default_input_config()
            .map_err(|e| Problem::from_audio(&e.to_string()))?;
        let format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let shared = Arc::new(Shared::new());

        let stream = match format {
            SampleFormat::F32 => build::<f32>(&device, &config, &shared),
            SampleFormat::I16 => build::<i16>(&device, &config, &shared),
            SampleFormat::U16 => build::<u16>(&device, &config, &shared),
            SampleFormat::I32 => build::<i32>(&device, &config, &shared),
            other => Err(Problem::Other(format!("Unsupported microphone format: {other:?}"))),
        }?;
        stream.play().map_err(|e| Problem::from_audio(&e.to_string()))?;
        Ok(Self { _stream: Some(stream), shared, stop: Arc::new(AtomicBool::new(false)) })
    }

    #[cfg(debug_assertions)]
    fn open_test_wav() -> Option<Self> {
        let path = std::env::var("PHIBE_VOICE_TEST_WAV").ok()?;
        let clip = super::audio::decode_wav_pcm16(&std::fs::read(path).ok()?)?;
        let shared = Arc::new(Shared::new());
        let stop = Arc::new(AtomicBool::new(false));
        let (thread_shared, thread_stop) = (Arc::clone(&shared), Arc::clone(&stop));
        std::thread::spawn(move || {
            let mut processor = Processor::new(thread_shared);
            const CHUNK: usize = TARGET_RATE as usize / 50; // 20 ms
            let mut position = 0;
            while !thread_stop.load(Ordering::Relaxed) {
                let end = (position + CHUNK).min(clip.len());
                if position < clip.len() {
                    processor.push(&clip[position..end]);
                    position = end;
                } else {
                    processor.push(&vec![0.0005; CHUNK]); // a quiet room after the clip
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        });
        Some(Self { _stream: None, shared, stop })
    }
}

fn build<T>(device: &cpal::Device, config: &cpal::StreamConfig, shared: &Arc<Shared>) -> Result<cpal::Stream, Problem>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    let mut resampler = Resampler::new(config.sample_rate.0, TARGET_RATE);
    let mut processor = Processor::new(Arc::clone(shared));
    let error_shared = Arc::clone(shared);

    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let interleaved: Vec<f32> = data.iter().map(|s| s.to_sample::<f32>()).collect();
                let mono = to_mono(&interleaved, channels);
                processor.push(&resampler.process(&mono));
            },
            move |err| {
                if let Ok(mut slot) = error_shared.problem.lock() {
                    *slot = Some(Problem::from_audio(&err.to_string()));
                }
            },
            None,
        )
        .map_err(|e| Problem::from_audio(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Needs a real microphone, so it only runs on request:
    /// `cargo test live_mic_probe -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_mic_probe() {
        let mic = Mic::open(None).expect("open the default microphone");
        let shared = mic.shared().clone();
        let mut peak = 0.0f32;
        for _ in 0..45 {
            std::thread::sleep(std::time::Duration::from_millis(33));
            peak = peak.max(shared.level());
        }
        let samples = shared.take_samples();
        let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len().max(1) as f32).sqrt();
        println!(
            "ready={} samples={} (~{:.2}s at 16 kHz) rms={:.5} ({:.1} dBFS) peak_level={:.3} quiet_ms={} speech_seen={}",
            shared.is_ready(),
            samples.len(),
            samples.len() as f32 / TARGET_RATE as f32,
            rms,
            20.0 * rms.max(1e-9).log10(),
            peak,
            shared.quiet_ms(),
            shared.speech_seen()
        );
        assert!(shared.is_ready(), "the microphone never delivered samples");
        assert!(samples.len() > 8000, "far fewer samples than expected");
    }
}
