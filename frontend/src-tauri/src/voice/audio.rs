//! Audio maths for the voice flow, free of any device code so it can be tested:
//! mono downmix, a streaming resampler to 16 kHz (what Whisper expects) and the
//! smoothed voice level that drives the card's bars.

/// Sample rate Whisper-family models expect.
pub const TARGET_RATE: u32 = 16_000;

/// Averages interleaved channels into one mono frame stream.
pub fn to_mono(interleaved: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return interleaved.to_vec();
    }
    interleaved
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

/// Streaming linear-interpolation resampler. Good enough for speech going to a
/// recognizer, and it keeps the capture callback cheap (no extra dependency).
pub struct Resampler {
    step: f64,
    pos: f64,
    prev: f32,
    primed: bool,
}

impl Resampler {
    pub fn new(from_rate: u32, to_rate: u32) -> Self {
        Self { step: from_rate as f64 / to_rate as f64, pos: 0.0, prev: 0.0, primed: false }
    }

    /// Feeds mono samples at the source rate; returns the samples at the target rate.
    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        let mut out = Vec::with_capacity((input.len() as f64 / self.step) as usize + 2);
        for &sample in input {
            if !self.primed {
                self.prev = sample;
                self.primed = true;
            }
            // `pos` is the fractional distance already travelled between `prev` and `sample`.
            while self.pos < 1.0 {
                out.push(self.prev + (sample - self.prev) * self.pos as f32);
                self.pos += self.step;
            }
            self.pos -= 1.0;
            self.prev = sample;
        }
        out
    }
}

/// Turns raw samples into a smooth 0..1 level: RMS in dB, mapped to a speech-friendly
/// window, with a fast attack and a slower release so the bars swell and settle
/// instead of flickering (the same feel as the "Speaking" visualizer).
pub struct LevelMeter {
    level: f32,
}

const DB_FLOOR: f32 = -44.0;
const DB_CEIL: f32 = -16.0;
const ATTACK: f32 = 0.55;
const RELEASE: f32 = 0.12;

impl LevelMeter {
    pub fn new() -> Self {
        Self { level: 0.0 }
    }

    #[cfg(test)]
    pub fn level(&self) -> f32 {
        self.level
    }

    /// Updates the level from one chunk of samples and returns it.
    pub fn push(&mut self, samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return self.level;
        }
        let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
        let target = Self::normalise(rms);
        let k = if target > self.level { ATTACK } else { RELEASE };
        self.level += (target - self.level) * k;
        self.level
    }

    fn normalise(rms: f32) -> f32 {
        if rms <= 1e-6 {
            return 0.0;
        }
        let db = 20.0 * rms.log10();
        ((db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)).clamp(0.0, 1.0)
    }
}

impl Default for LevelMeter {
    fn default() -> Self {
        Self::new()
    }
}

/// Tells speech from silence, with a noise floor that adapts to the room, and keeps the
/// clock the silence rules need: how long since the last speech, whether anything real was
/// said at all, and how long the recording has run. Energy based on purpose (spec 4.1):
/// light and good enough; a real VAD model can replace it if noisy rooms ask for it.
pub struct SpeechDetector {
    floor_db: Option<f32>,
    run_ms: f32,
    voiced_ms: f32,
    quiet_ms: f32,
    elapsed_ms: f32,
}

/// Speech must stand this far above the room's noise floor.
const MARGIN_DB: f32 = 18.0;
/// And never count anything quieter than this as speech.
const GATE_DB: f32 = -40.0;
/// A burst shorter than this is a click or a cough, not speech.
const MIN_RUN_MS: f32 = 220.0;
/// Total voiced time that makes a recording "something was said".
const MIN_SPEECH_MS: f32 = 400.0;
const FLOOR_FALL_MS: f32 = 60.0;
const FLOOR_RISE_MS: f32 = 8000.0;

impl SpeechDetector {
    pub fn new() -> Self {
        Self { floor_db: None, run_ms: 0.0, voiced_ms: 0.0, quiet_ms: 0.0, elapsed_ms: 0.0 }
    }

    pub fn feed(&mut self, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }
        let frame_ms = samples.len() as f32 * 1000.0 / TARGET_RATE as f32;
        self.elapsed_ms += frame_ms;
        let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
        let db = 20.0 * rms.max(1e-6).log10();

        // The floor follows the quietest recent sound: it drops quickly and creeps up slowly.
        let floor = self.floor_db.get_or_insert(db);
        let tau = if db < *floor { FLOOR_FALL_MS } else { FLOOR_RISE_MS };
        *floor += (db - *floor) * (1.0 - (-frame_ms / tau).exp());

        if db > (*floor + MARGIN_DB).max(GATE_DB) {
            self.run_ms += frame_ms;
            if self.run_ms >= MIN_RUN_MS {
                self.quiet_ms = 0.0;
                self.voiced_ms += frame_ms;
            }
        } else {
            self.run_ms = 0.0;
            self.quiet_ms += frame_ms;
        }
    }

    /// Milliseconds since speech was last heard (or since the start, if never).
    pub fn quiet_ms(&self) -> u64 {
        self.quiet_ms as u64
    }

    /// Something real was said (not just a click or a cough).
    pub fn speech_seen(&self) -> bool {
        self.voiced_ms >= MIN_SPEECH_MS
    }

    /// Length of the recording so far.
    pub fn elapsed_ms(&self) -> u64 {
        self.elapsed_ms as u64
    }
}

impl Default for SpeechDetector {
    fn default() -> Self {
        Self::new()
    }
}

/// 16-bit PCM mono WAV at 16 kHz: what the transcription backend receives.
pub fn wav_bytes(samples: &[f32]) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&TARGET_RATE.to_le_bytes());
    out.extend_from_slice(&(TARGET_RATE * 2).to_le_bytes()); // bytes per second
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
    }
    out
}

/// Reads a 16-bit PCM WAV (any rate, mono or stereo) as 16 kHz mono samples. Only the
/// debug test hook uses it (a recorded file stands in for the microphone).
#[cfg_attr(not(debug_assertions), allow(dead_code))]
pub fn decode_wav_pcm16(bytes: &[u8]) -> Option<Vec<f32>> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let channels = u16::from_le_bytes([bytes[22], bytes[23]]) as usize;
    let rate = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
    let mut pos = 12;
    while pos + 8 <= bytes.len() {
        let id = &bytes[pos..pos + 4];
        let len = u32::from_le_bytes([bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]]) as usize;
        if id == b"data" {
            let end = (pos + 8 + len).min(bytes.len());
            let pcm: Vec<f32> = bytes[pos + 8..end]
                .chunks_exact(2)
                .map(|b| i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0)
                .collect();
            let mono = to_mono(&pcm, channels.max(1));
            return Some(Resampler::new(rate, TARGET_RATE).process(&mono));
        }
        pos += 8 + len + (len & 1);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mono_downmix_averages_channels() {
        assert_eq!(to_mono(&[1.0, 0.0, 0.5, 0.5], 2), vec![0.5, 0.5]);
        assert_eq!(to_mono(&[0.2, 0.4], 1), vec![0.2, 0.4]);
    }

    #[test]
    fn resampler_changes_the_length_by_the_ratio() {
        let mut r = Resampler::new(48_000, 16_000);
        let input: Vec<f32> = (0..4800).map(|i| (i as f32 * 0.01).sin()).collect();
        let out = r.process(&input);
        assert!((out.len() as i64 - 1600).abs() <= 2, "got {}", out.len());
    }

    #[test]
    fn resampler_keeps_a_constant_signal_constant() {
        let mut r = Resampler::new(44_100, 16_000);
        let out = r.process(&vec![0.25; 4410]);
        assert!(out.iter().all(|v| (v - 0.25).abs() < 1e-5));
    }

    #[test]
    fn resampler_is_continuous_across_chunks() {
        let signal: Vec<f32> = (0..9600).map(|i| (i as f32 * 0.02).sin()).collect();
        let mut whole = Resampler::new(48_000, 16_000);
        let all = whole.process(&signal);
        let mut split = Resampler::new(48_000, 16_000);
        let mut parts = split.process(&signal[..3000]);
        parts.extend(split.process(&signal[3000..]));
        assert_eq!(all.len(), parts.len());
        for (a, b) in all.iter().zip(&parts) {
            assert!((a - b).abs() < 1e-5);
        }
    }

    #[test]
    fn a_wav_has_a_valid_header_and_round_trips() {
        let samples: Vec<f32> = (0..1600).map(|i| 0.5 * (i as f32 * 0.05).sin()).collect();
        let wav = wav_bytes(&samples);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(wav.len(), 44 + samples.len() * 2);
        let back = decode_wav_pcm16(&wav).expect("decodes");
        assert_eq!(back.len(), samples.len());
        // The resampler delays the signal by one sample; apart from that it is unchanged.
        assert!(samples.iter().zip(back.iter().skip(1)).all(|(a, b)| (a - b).abs() < 0.001));
    }

    #[test]
    fn decoding_rejects_things_that_are_not_wav() {
        assert!(decode_wav_pcm16(b"not a wav file at all, but long enough to pass the length check....").is_none());
        assert!(decode_wav_pcm16(&[]).is_none());
    }

    fn tone(ms: usize, amplitude: f32) -> Vec<f32> {
        (0..ms * 16).map(|i| amplitude * (i as f32 * 0.31).sin()).collect()
    }

    fn feed_ms(d: &mut SpeechDetector, samples: &[f32]) {
        for chunk in samples.chunks(320) {
            d.feed(chunk);
        }
    }

    #[test]
    fn a_quiet_room_never_counts_as_speech() {
        let mut d = SpeechDetector::new();
        feed_ms(&mut d, &tone(8000, 0.001));
        assert!(!d.speech_seen());
        assert!(d.quiet_ms() >= 7900);
        assert_eq!(d.elapsed_ms(), 8000);
    }

    #[test]
    fn steady_fan_noise_is_not_speech_even_when_loud() {
        let mut d = SpeechDetector::new();
        feed_ms(&mut d, &tone(5000, 0.02)); // about -37 dBFS, constant
        assert!(!d.speech_seen(), "constant noise adapts into the floor");
    }

    #[test]
    fn speech_is_seen_and_silence_is_counted_after_it() {
        let mut d = SpeechDetector::new();
        feed_ms(&mut d, &tone(500, 0.001));
        feed_ms(&mut d, &tone(1500, 0.2));
        assert!(d.speech_seen());
        assert!(d.quiet_ms() < 100);
        feed_ms(&mut d, &tone(7000, 0.001));
        assert!(d.quiet_ms() >= 6900 && d.quiet_ms() <= 7100, "quiet {}", d.quiet_ms());
    }

    #[test]
    fn a_short_click_is_not_speech() {
        let mut d = SpeechDetector::new();
        feed_ms(&mut d, &tone(500, 0.001));
        feed_ms(&mut d, &tone(60, 0.3));
        feed_ms(&mut d, &tone(2000, 0.001));
        assert!(!d.speech_seen());
    }

    #[test]
    fn speaking_again_resets_the_silence_clock() {
        let mut d = SpeechDetector::new();
        feed_ms(&mut d, &tone(500, 0.001));
        feed_ms(&mut d, &tone(1000, 0.2));
        feed_ms(&mut d, &tone(4000, 0.001));
        assert!(d.quiet_ms() >= 3900);
        feed_ms(&mut d, &tone(600, 0.2));
        assert!(d.quiet_ms() < 100);
    }

    #[test]
    fn silence_reads_as_zero() {
        let mut m = LevelMeter::new();
        assert_eq!(m.push(&vec![0.0; 800]), 0.0);
    }

    #[test]
    fn speech_loudness_reaches_a_high_level() {
        let mut m = LevelMeter::new();
        let loud: Vec<f32> = (0..800).map(|i| 0.3 * (i as f32 * 0.3).sin()).collect();
        let mut level = 0.0;
        for _ in 0..10 {
            level = m.push(&loud);
        }
        assert!(level > 0.8, "level {level}");
    }

    #[test]
    fn room_noise_stays_low() {
        let mut m = LevelMeter::new();
        let noise: Vec<f32> = (0..800).map(|i| 0.002 * (i as f32 * 1.7).sin()).collect();
        let mut level = 0.0;
        for _ in 0..10 {
            level = m.push(&noise);
        }
        assert!(level < 0.25, "level {level}");
    }

    #[test]
    fn the_level_rises_fast_and_falls_slowly() {
        let mut m = LevelMeter::new();
        let loud: Vec<f32> = (0..800).map(|i| 0.3 * (i as f32 * 0.3).sin()).collect();
        let up = m.push(&loud);
        for _ in 0..8 {
            m.push(&loud);
        }
        let peak = m.level();
        let down = m.push(&vec![0.0; 800]);
        assert!(up > 0.3, "attack too slow: {up}");
        assert!(down < peak && down > peak * 0.5, "release should be gradual: {peak} -> {down}");
    }
}
