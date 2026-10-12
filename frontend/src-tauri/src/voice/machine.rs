//! The voice flow as a pure state machine: no Tauri, no clock, no microphone.
//!
//! The coordinator thread feeds it [`Input`]s and carries out the [`Effect`]s it
//! returns, so every transition (and the rule that the global `Esc` is released on
//! *every* way out of listening) is covered by plain unit tests.
//!
//! Phases: Idle, Listening, Countdown (nothing heard for a while: closing soon) and
//! Sending (transcribe, then deliver to the chat).
//! Design note: modelled on Handy's `TranscriptionCoordinator` (debounce, never lose
//! the press/press parity), simplified to a toggle.

use super::problem::Problem;

/// Presses closer together than this are key-repeat noise.
pub const DEBOUNCE_MS: u64 = 30;
/// A second press sooner than this after starting is ignored: it would send an empty
/// recording (spec: "taps shorter than 0.4 s are ignored").
pub const MIN_LISTEN_MS: u64 = 400;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Idle,
    Listening,
    /// Silence for a while: the card counts down and closes by itself unless the user
    /// speaks again or presses a key.
    Countdown,
    Sending,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Input {
    /// The voice shortcut went down.
    Shortcut { at_ms: u64 },
    /// `Esc` went down (only registered while listening).
    Esc,
    /// The first real microphone samples arrived.
    MicReady,
    /// The microphone could not be opened or died.
    MicFailed(Problem),
    /// Nothing has been heard for the silence limit.
    Quiet { speech_seen: bool },
    /// Speech came back during the countdown.
    Voice,
    /// The countdown ran out.
    CountdownDone,
    /// The recording reached its maximum length.
    LimitReached,
    /// The message was transcribed and handed to the chat.
    SendDone,
    /// Transcription or delivery failed.
    SendFailed(Problem),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Effect {
    ShowCard,
    HideCard,
    OpenMic,
    CloseMic,
    /// Stop listening for good: take what was recorded, release the microphone and
    /// start turning it into text. `draft` leaves the result in the message box
    /// instead of sending it.
    Collect { draft: bool },
    /// Claim the global `Esc` key.
    RegisterEsc,
    /// Give `Esc` back to the system. Must follow every `RegisterEsc`.
    UnregisterEsc,
    /// Tell the card which phase to draw.
    Announce,
    /// Tell the card something went wrong (it hides itself shortly after).
    Fail(Problem),
}

#[derive(Debug)]
pub struct Machine {
    phase: Phase,
    /// Microphone is delivering samples (the card shows "arming" until then).
    ready: bool,
    /// Something real was said (decided when the silence started).
    speech_seen: bool,
    started_ms: u64,
    last_press_ms: Option<u64>,
}

impl Default for Machine {
    fn default() -> Self {
        Self::new()
    }
}

impl Machine {
    pub fn new() -> Self {
        Self { phase: Phase::Idle, ready: false, speech_seen: false, started_ms: 0, last_press_ms: None }
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn ready(&self) -> bool {
        self.ready
    }

    pub fn speech_seen(&self) -> bool {
        self.speech_seen
    }

    pub fn handle(&mut self, input: Input) -> Vec<Effect> {
        use Effect::*;
        let live = matches!(self.phase, Phase::Listening | Phase::Countdown);
        match (self.phase, input) {
            (Phase::Idle | Phase::Sending, Input::Shortcut { at_ms }) => {
                if self.is_repeat(at_ms) {
                    return vec![];
                }
                self.last_press_ms = Some(at_ms);
                // A press while a message is still going out starts a new recording;
                // the old send finishes on its own (spec 4: recordings are independent).
                self.phase = Phase::Listening;
                self.ready = false;
                self.speech_seen = false;
                self.started_ms = at_ms;
                vec![ShowCard, RegisterEsc, OpenMic, Announce]
            }
            (Phase::Listening, Input::Shortcut { at_ms }) => {
                if self.is_repeat(at_ms) || at_ms.saturating_sub(self.started_ms) < MIN_LISTEN_MS {
                    return vec![];
                }
                self.last_press_ms = Some(at_ms);
                self.phase = Phase::Sending;
                vec![UnregisterEsc, Collect { draft: false }, Announce]
            }
            (Phase::Countdown, Input::Shortcut { at_ms }) => {
                if self.is_repeat(at_ms) {
                    return vec![];
                }
                self.last_press_ms = Some(at_ms);
                if self.speech_seen {
                    self.phase = Phase::Sending;
                    vec![UnregisterEsc, Collect { draft: false }, Announce]
                } else {
                    self.discard()
                }
            }
            (_, Input::Esc) if live => self.discard(),
            (_, Input::MicReady) if live => {
                self.ready = true;
                vec![Announce]
            }
            (_, Input::MicFailed(problem)) if live => {
                self.phase = Phase::Idle;
                vec![UnregisterEsc, CloseMic, Fail(problem)]
            }
            (Phase::Listening, Input::Quiet { speech_seen }) => {
                self.phase = Phase::Countdown;
                self.speech_seen = speech_seen;
                vec![Announce]
            }
            (Phase::Countdown, Input::Voice) => {
                self.phase = Phase::Listening;
                vec![Announce]
            }
            (Phase::Countdown, Input::CountdownDone) => {
                if self.speech_seen {
                    // Something was said and then the user went quiet: keep it as a draft,
                    // never send on their behalf.
                    self.phase = Phase::Sending;
                    vec![UnregisterEsc, Collect { draft: true }, Announce]
                } else {
                    self.discard()
                }
            }
            (Phase::Listening | Phase::Countdown, Input::LimitReached) => {
                self.phase = Phase::Sending;
                vec![UnregisterEsc, Collect { draft: false }, Announce]
            }
            (Phase::Sending, Input::SendDone) => {
                self.phase = Phase::Idle;
                vec![HideCard]
            }
            (Phase::Sending, Input::SendFailed(problem)) => {
                self.phase = Phase::Idle;
                vec![Fail(problem)]
            }
            // Everything else is stale or irrelevant in this phase.
            _ => vec![],
        }
    }

    /// Back to idle without keeping anything: releases `Esc` and the microphone.
    fn discard(&mut self) -> Vec<Effect> {
        self.phase = Phase::Idle;
        vec![Effect::UnregisterEsc, Effect::CloseMic, Effect::HideCard]
    }

    fn is_repeat(&self, at_ms: u64) -> bool {
        matches!(self.last_press_ms, Some(last) if at_ms.saturating_sub(last) < DEBOUNCE_MS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn press(at_ms: u64) -> Input {
        Input::Shortcut { at_ms }
    }

    fn listening() -> Machine {
        let mut m = Machine::new();
        m.handle(press(0));
        m
    }

    fn counting(speech_seen: bool) -> Machine {
        let mut m = listening();
        m.handle(Input::Quiet { speech_seen });
        m
    }

    #[test]
    fn press_starts_listening_with_the_card_the_mic_and_esc() {
        let mut m = Machine::new();
        let fx = m.handle(press(1000));
        assert_eq!(m.phase(), Phase::Listening);
        assert_eq!(fx, vec![Effect::ShowCard, Effect::RegisterEsc, Effect::OpenMic, Effect::Announce]);
        assert!(!m.ready());
    }

    #[test]
    fn mic_ready_is_announced_once_listening() {
        let mut m = listening();
        assert_eq!(m.handle(Input::MicReady), vec![Effect::Announce]);
        assert!(m.ready());
    }

    #[test]
    fn second_press_sends_and_releases_esc() {
        let mut m = listening();
        let fx = m.handle(press(2000));
        assert_eq!(m.phase(), Phase::Sending);
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::Collect { draft: false }, Effect::Announce]);
        assert_eq!(m.handle(Input::SendDone), vec![Effect::HideCard]);
        assert_eq!(m.phase(), Phase::Idle);
    }

    #[test]
    fn a_too_quick_second_press_is_ignored() {
        let mut m = listening();
        assert!(m.handle(press(MIN_LISTEN_MS - 1)).is_empty());
        assert_eq!(m.phase(), Phase::Listening);
        assert!(!m.handle(press(MIN_LISTEN_MS)).is_empty());
    }

    #[test]
    fn key_repeat_is_debounced() {
        let mut m = listening();
        assert!(m.handle(press(DEBOUNCE_MS - 1)).is_empty());
    }

    #[test]
    fn esc_cancels_and_hides() {
        let mut m = listening();
        let fx = m.handle(Input::Esc);
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::CloseMic, Effect::HideCard]);
        assert_eq!(m.phase(), Phase::Idle);
    }

    #[test]
    fn esc_does_nothing_when_not_listening() {
        let mut m = Machine::new();
        assert!(m.handle(Input::Esc).is_empty());
        let mut m = listening();
        m.handle(press(2000));
        assert!(m.handle(Input::Esc).is_empty());
    }

    #[test]
    fn a_microphone_failure_releases_everything_and_reports() {
        let mut m = listening();
        let fx = m.handle(Input::MicFailed(Problem::NoMic));
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::CloseMic, Effect::Fail(Problem::NoMic)]);
        assert_eq!(m.phase(), Phase::Idle);
    }

    #[test]
    fn a_microphone_failure_during_the_countdown_does_the_same() {
        let mut m = counting(true);
        let fx = m.handle(Input::MicFailed(Problem::MicLost));
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::CloseMic, Effect::Fail(Problem::MicLost)]);
    }

    #[test]
    fn a_new_press_while_sending_starts_a_new_recording() {
        let mut m = listening();
        m.handle(press(1000));
        assert_eq!(m.phase(), Phase::Sending);
        let fx = m.handle(press(1500));
        assert_eq!(m.phase(), Phase::Listening);
        assert!(fx.contains(&Effect::RegisterEsc));
        // The old send finishing later must not hide the new recording's card.
        assert!(m.handle(Input::SendDone).is_empty());
        assert_eq!(m.phase(), Phase::Listening);
    }

    #[test]
    fn a_failed_send_reports_and_goes_idle() {
        let mut m = listening();
        m.handle(press(2000));
        let fx = m.handle(Input::SendFailed(Problem::NotUnderstood));
        assert_eq!(fx, vec![Effect::Fail(Problem::NotUnderstood)]);
        assert_eq!(m.phase(), Phase::Idle);
    }

    #[test]
    fn a_failure_from_an_old_send_does_not_touch_a_new_recording() {
        let mut m = listening();
        m.handle(press(1000));
        m.handle(press(1500));
        assert_eq!(m.phase(), Phase::Listening);
        assert!(m.handle(Input::SendFailed(Problem::NotUnderstood)).is_empty());
        assert_eq!(m.phase(), Phase::Listening);
    }

    // ---- silence and countdown (spec 2.1)

    #[test]
    fn silence_starts_the_countdown() {
        let mut m = listening();
        assert_eq!(m.handle(Input::Quiet { speech_seen: false }), vec![Effect::Announce]);
        assert_eq!(m.phase(), Phase::Countdown);
        assert!(!m.speech_seen());
    }

    #[test]
    fn speaking_again_cancels_the_countdown() {
        let mut m = counting(true);
        assert_eq!(m.handle(Input::Voice), vec![Effect::Announce]);
        assert_eq!(m.phase(), Phase::Listening);
    }

    #[test]
    fn nothing_said_means_the_countdown_discards() {
        let mut m = counting(false);
        let fx = m.handle(Input::CountdownDone);
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::CloseMic, Effect::HideCard]);
        assert_eq!(m.phase(), Phase::Idle);
    }

    #[test]
    fn something_said_means_the_countdown_leaves_a_draft_and_never_sends() {
        let mut m = counting(true);
        let fx = m.handle(Input::CountdownDone);
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::Collect { draft: true }, Effect::Announce]);
        assert_eq!(m.phase(), Phase::Sending);
    }

    #[test]
    fn pressing_the_shortcut_in_the_countdown_sends_now_when_something_was_said() {
        let mut m = counting(true);
        let fx = m.handle(press(9000));
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::Collect { draft: false }, Effect::Announce]);
        assert_eq!(m.phase(), Phase::Sending);
    }

    #[test]
    fn pressing_the_shortcut_in_the_countdown_closes_when_nothing_was_said() {
        let mut m = counting(false);
        let fx = m.handle(press(9000));
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::CloseMic, Effect::HideCard]);
        assert_eq!(m.phase(), Phase::Idle);
    }

    #[test]
    fn esc_during_the_countdown_cancels() {
        let mut m = counting(true);
        let fx = m.handle(Input::Esc);
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::CloseMic, Effect::HideCard]);
    }

    #[test]
    fn the_length_limit_sends() {
        let mut m = listening();
        let fx = m.handle(Input::LimitReached);
        assert_eq!(fx, vec![Effect::UnregisterEsc, Effect::Collect { draft: false }, Effect::Announce]);
        assert_eq!(m.phase(), Phase::Sending);
    }

    #[test]
    fn silence_events_are_ignored_outside_their_phase() {
        let mut m = Machine::new();
        assert!(m.handle(Input::Quiet { speech_seen: true }).is_empty());
        assert!(m.handle(Input::Voice).is_empty());
        assert!(m.handle(Input::CountdownDone).is_empty());
        assert!(m.handle(Input::LimitReached).is_empty());
        let mut m = listening();
        assert!(m.handle(Input::Voice).is_empty());
        assert!(m.handle(Input::CountdownDone).is_empty());
    }

    #[test]
    fn stale_events_are_ignored() {
        let mut m = Machine::new();
        assert!(m.handle(Input::MicReady).is_empty());
        assert!(m.handle(Input::SendDone).is_empty());
        assert!(m.handle(Input::MicFailed(Problem::NoMic)).is_empty());
        assert!(m.handle(Input::SendFailed(Problem::NotUnderstood)).is_empty());
    }

    /// Whatever the user and the hardware do, `Esc` is claimed exactly while the card is
    /// live (listening or counting down): a leaked global `Esc` would break the key in
    /// every other app.
    #[test]
    fn esc_is_held_exactly_while_live_for_every_short_sequence() {
        fn inputs(t: u64) -> Vec<Input> {
            vec![
                Input::Shortcut { at_ms: t },
                Input::Esc,
                Input::MicReady,
                Input::MicFailed(Problem::NoMic),
                Input::Quiet { speech_seen: true },
                Input::Quiet { speech_seen: false },
                Input::Voice,
                Input::CountdownDone,
                Input::LimitReached,
                Input::SendDone,
                Input::SendFailed(Problem::NotUnderstood),
            ]
        }
        fn walk(m: &Machine, held: i32, depth: u32, t: u64) {
            if depth == 0 {
                return;
            }
            for input in inputs(t) {
                let mut next = Machine {
                    phase: m.phase,
                    ready: m.ready,
                    speech_seen: m.speech_seen,
                    started_ms: m.started_ms,
                    last_press_ms: m.last_press_ms,
                };
                let mut h = held;
                for fx in next.handle(input) {
                    match fx {
                        Effect::RegisterEsc => h += 1,
                        Effect::UnregisterEsc => h -= 1,
                        _ => {}
                    }
                }
                assert!((0..=1).contains(&h), "esc claimed {h} times");
                let live = matches!(next.phase(), Phase::Listening | Phase::Countdown);
                assert_eq!(h == 1, live, "esc held outside the live phases");
                walk(&next, h, depth - 1, t + 1000);
            }
        }
        walk(&Machine::new(), 0, 6, 0);
    }
}
