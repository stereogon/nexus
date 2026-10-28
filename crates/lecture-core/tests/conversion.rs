//! Contract tests for the conversion state machine.
//!
//! The load-bearing one is [`every_state_and_transition_pair_is_decided`]. Rather than
//! testing the moves that work, it walks the whole grid of state against transition and
//! asserts each cell, so a new state cannot be added without this test forcing a decision
//! about what it may do. A state machine tested only on its happy paths is a list of
//! examples, not a machine.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{Conversion, ConversionState, CoreError, Label, Timestamp};

fn label(raw: &str) -> Label {
    Label::parse(raw).unwrap()
}

fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

const WHEN: &str = "2026-10-28T10:00:00Z";

/// One conversion in each state, built the way the app really reaches it.
fn in_state(state: ConversionState) -> Conversion {
    match state {
        ConversionState::NotRequired => Conversion::not_required(),
        ConversionState::Queued => Conversion::queued(),
        // Reachable only by starting, which is the point: there is no way to be
        // mid-conversion without having recorded that it began.
        ConversionState::Converting => Conversion::queued().started(label("libreoffice")).unwrap(),
        ConversionState::Ready => Conversion::queued()
            .started(label("libreoffice"))
            .unwrap()
            .succeeded(at(WHEN))
            .unwrap(),
        ConversionState::Failed => Conversion::queued()
            .started(label("libreoffice"))
            .unwrap()
            .did_not_finish()
            .unwrap(),
    }
}

/// Every transition, as a name and a closure, so the grid can be walked.
type Move = (
    &'static str,
    fn(Conversion) -> Result<Conversion, CoreError>,
);

fn moves() -> Vec<Move> {
    vec![
        ("started", |c| c.started(label("libreoffice"))),
        ("succeeded", |c| c.succeeded(at(WHEN))),
        ("did_not_finish", Conversion::did_not_finish),
        ("requeued", Conversion::requeued),
        ("reconversion_requested", Conversion::reconversion_requested),
    ]
}

/// What each cell of the grid must do, and the state it must land in.
fn expected(state: ConversionState, transition: &str) -> Option<ConversionState> {
    use ConversionState::{Converting, Failed, Queued, Ready};

    match (state, transition) {
        // A queued conversion starts; a failed one retries, which is usually the whole
        // point -- the common cause of failure is that no converter was installed yet.
        (Queued | Failed, "started") => Some(Converting),
        // Success and failure are only reachable from a state that was written down
        // first, which is what makes an interrupted conversion detectable.
        (Converting, "succeeded") => Some(Ready),
        (Converting, "did_not_finish") => Some(Failed),
        // Requeued covers both an interrupted attempt and a deliberate retry.
        // Reconversion lands in the same place but is its own name, because its
        // consequence differs: it replaces a PDF that highlights were already placed on.
        (Converting | Failed, "requeued") | (Ready, "reconversion_requested") => Some(Queued),
        // Everything else is refused, and `NotRequired` most of all: a document that
        // arrived as a PDF has no original to convert from, so nothing may be done to it.
        _ => None,
    }
}

#[test]
fn every_state_and_transition_pair_is_decided() {
    let states = [
        ConversionState::NotRequired,
        ConversionState::Queued,
        ConversionState::Converting,
        ConversionState::Ready,
        ConversionState::Failed,
    ];

    for state in states {
        for (name, apply) in moves() {
            let result = apply(in_state(state));

            match (expected(state, name), result) {
                (Some(landing), Ok(moved)) => assert_eq!(
                    moved.state(),
                    landing,
                    "{state:?} + {name} should land in {landing:?}"
                ),
                (Some(landing), Err(error)) => {
                    panic!("{state:?} + {name} should reach {landing:?}, got: {error}")
                }
                (None, Err(error)) => assert!(
                    matches!(error, CoreError::ConversionNotPossible { .. }),
                    "{state:?} + {name} should be refused as a transition, got: {error}"
                ),
                (None, Ok(moved)) => panic!(
                    "{state:?} + {name} should be refused, but reached {:?}",
                    moved.state()
                ),
            }
        }
    }
}

#[test]
fn a_refused_transition_says_where_it_was_and_what_was_tried() {
    let err = Conversion::not_required()
        .started(label("libreoffice"))
        .unwrap_err();

    match err {
        CoreError::ConversionNotPossible { from, attempted } => {
            assert_eq!(from, "not required");
            assert_eq!(attempted, "converting");
        }
        other => panic!("wrong variant: {other:?}"),
    }
}

#[test]
fn a_refused_transition_promises_the_original_is_still_there() {
    let err = Conversion::queued().succeeded(at(WHEN)).unwrap_err();

    assert_eq!(err.code(), "ERR_CONVERSION_NOT_POSSIBLE");
    assert!(err.remediation().contains("original file is still"));
    assert!(err.remediation().contains("left exactly as it was"));
}

#[test]
fn starting_records_which_converter_is_attempting_it() {
    // Before it is known whether it will work, because the answer matters either way:
    // a failure that cannot say what failed is not diagnosable.
    let converting = Conversion::queued().started(label("keynote")).unwrap();

    assert_eq!(converting.converter().map(Label::as_str), Some("keynote"));
    assert_eq!(converting.converted_at(), None);
}

#[test]
fn a_retry_records_the_converter_that_is_trying_now() {
    let retried = in_state(ConversionState::Failed)
        .started(label("keynote"))
        .unwrap();

    assert_eq!(retried.converter().map(Label::as_str), Some("keynote"));
}

#[test]
fn succeeding_keeps_the_converter_and_stamps_the_time() {
    let ready = in_state(ConversionState::Converting)
        .succeeded(at(WHEN))
        .unwrap();

    assert_eq!(ready.converter().map(Label::as_str), Some("libreoffice"));
    assert_eq!(ready.converted_at().map(Timestamp::as_str), Some(WHEN));
}

#[test]
fn a_failure_keeps_the_converter_but_claims_no_finish_time() {
    let failed = in_state(ConversionState::Failed);

    assert_eq!(failed.converter().map(Label::as_str), Some("libreoffice"));
    assert_eq!(
        failed.converted_at(),
        None,
        "a conversion that did not finish must not look as though it did"
    );
}

#[test]
fn requeueing_forgets_the_attempt_entirely() {
    // So a retry cannot be mistaken for a success by anything reading the converter
    // field, and so the record does not claim a tool was used when nothing was produced.
    let requeued = in_state(ConversionState::Failed).requeued().unwrap();

    assert_eq!(requeued.state(), ConversionState::Queued);
    assert_eq!(requeued.converter(), None);
    assert_eq!(requeued.converted_at(), None);
}

#[test]
fn an_interrupted_conversion_is_recognisable_and_requeued() {
    // Nothing resumes a half-finished conversion, so `Converting` found on disk means the
    // process died partway and the PDF beside it may be a plausible-looking fragment.
    // Requeued rather than trusted: a partial PDF that happens to open is the worst
    // outcome of the three, because it would be annotated.
    let interrupted = in_state(ConversionState::Converting);

    assert!(interrupted.was_interrupted());

    let recovered = interrupted.requeued().unwrap();

    assert_eq!(recovered.state(), ConversionState::Queued);
    assert!(!recovered.was_interrupted());
}

#[test]
fn no_other_state_looks_interrupted() {
    for state in [
        ConversionState::NotRequired,
        ConversionState::Queued,
        ConversionState::Ready,
        ConversionState::Failed,
    ] {
        assert!(
            !in_state(state).was_interrupted(),
            "{state:?} should not look interrupted"
        );
    }
}

#[test]
fn a_hand_edited_converting_state_with_no_converter_cannot_finish() {
    // Unreachable through the API, reachable from a file. Letting it succeed would write
    // a Ready conversion that cannot say what produced the PDF, which `Source::new`
    // would then refuse -- so it is refused here, where the cause is still visible.
    let orphan: Conversion = serde_json::from_str(r#"{"state":"converting"}"#).unwrap();

    let err = orphan.clone().succeeded(at(WHEN)).unwrap_err();
    assert!(matches!(err, CoreError::ConversionNotPossible { .. }));

    let err = orphan.did_not_finish().unwrap_err();
    assert!(matches!(err, CoreError::ConversionNotPossible { .. }));
}

#[test]
fn every_state_has_a_name_for_a_message() {
    for state in [
        ConversionState::NotRequired,
        ConversionState::Queued,
        ConversionState::Converting,
        ConversionState::Ready,
        ConversionState::Failed,
    ] {
        assert!(!state.name().is_empty(), "{state:?} has no name");
        assert_eq!(
            state.name(),
            state.name().to_lowercase(),
            "a state name is read mid-sentence, so it should not shout"
        );
    }
}
