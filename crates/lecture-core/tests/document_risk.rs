//! What the surface scan finds, what it refuses to claim, and that chunking cannot change
//! the answer.
//!
//! The evasion tests are the reason this is a name-level scan rather than a substring
//! search: `/J#61vaScript` is the same name as `/JavaScript` to every PDF reader, so a
//! scan that misses it is a scan an attacker walks around.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use lecture_core::{DocumentRisk, RiskScan, RiskSeverity};

/// Everything found in one slice.
fn scan(bytes: &[u8]) -> Vec<DocumentRisk> {
    let mut scan = RiskScan::new();
    scan.feed(bytes);

    scan.finish()
}

#[test]
fn an_ordinary_document_raises_nothing() {
    let found = scan(b"%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n");

    assert!(found.is_empty(), "{found:?}");
}

#[test]
fn embedded_javascript_is_found_under_both_of_its_names() {
    assert_eq!(
        scan(b"<</S/JavaScript>>"),
        [DocumentRisk::EmbeddedJavascript]
    );
    assert_eq!(scan(b"<</JS 4 0 R>>"), [DocumentRisk::EmbeddedJavascript]);
}

#[test]
fn a_hex_escaped_name_is_found_too() {
    // The whole reason for decoding names. All three spellings are one name to a PDF
    // reader, and a substring search sees only the first.
    for spelling in [
        &b"/JavaScript "[..],
        &b"/J#61vaScript "[..],
        &b"/#4a#61#76#61#53#63#72#69#70#74 "[..],
    ] {
        assert_eq!(
            scan(spelling),
            [DocumentRisk::EmbeddedJavascript],
            "missed {}",
            String::from_utf8_lossy(spelling)
        );
    }
}

#[test]
fn a_longer_name_that_merely_starts_the_same_is_not_a_match() {
    // `/JavaScriptSettings` is a real name in some producers' output and means nothing.
    // Substring searching reports it; matching whole names does not.
    assert!(scan(b"/JavaScriptSettings 1").is_empty());
    assert!(scan(b"/URIX").is_empty());
}

#[test]
fn matching_is_case_sensitive_because_pdf_names_are() {
    // `/js` is simply a different name. Folding case would invent matches the format does
    // not have.
    assert!(scan(b"/js /javascript /uri").is_empty());
}

#[test]
fn a_run_of_names_is_read_as_several_names() {
    // `/` ends one name and starts the next. Consuming it as a plain delimiter would find
    // only `Type` here.
    let found = scan(b"<</Type/Action/S/Launch/F(x)>>");

    assert_eq!(found, [DocumentRisk::LaunchesAProgram]);
}

#[test]
fn every_delimiter_ends_a_name() {
    for delimiter in [
        &b"/JS "[..],
        &b"/JS\n"[..],
        &b"/JS\r"[..],
        &b"/JS\t"[..],
        &b"/JS("[..],
        &b"/JS)"[..],
        &b"/JS<"[..],
        &b"/JS>"[..],
        &b"/JS["[..],
        &b"/JS]"[..],
        &b"/JS{"[..],
        &b"/JS}"[..],
        &b"/JS%"[..],
        &b"/JS/"[..],
    ] {
        assert_eq!(
            scan(delimiter),
            [DocumentRisk::EmbeddedJavascript],
            "missed {}",
            String::from_utf8_lossy(delimiter)
        );
    }
}

#[test]
fn a_name_at_the_very_end_of_the_file_still_closes() {
    // No trailing delimiter. A truncated document must read the same as a whole one.
    assert_eq!(scan(b"/JS"), [DocumentRisk::EmbeddedJavascript]);
}

#[test]
fn a_malformed_escape_is_not_claimed_as_a_match() {
    // `#zz` is not a hex escape, so this is a name the scan cannot read exactly. Reporting
    // it as `/JS` would mean claiming to have recognised something it guessed at.
    assert!(scan(b"/J#zz ").is_empty());
    assert!(scan(b"/#4 ").is_empty());
}

#[test]
fn an_absurdly_long_name_cannot_match_and_does_not_accumulate() {
    // Bounded memory on a file that opens a name and never closes it. The assertion is
    // about the result; the bound is what keeps this test from being the slow one.
    let mut bytes = Vec::from(b"/JS".as_slice());
    bytes.extend(std::iter::repeat_n(b'x', 100_000));

    assert!(scan(&bytes).is_empty());
}

#[test]
fn chunking_cannot_change_the_answer() {
    // The property that makes streaming safe: the caller feeds 64 KiB at a time, and a
    // name straddling a boundary has to survive it. Every escape and delimiter case above
    // is in here, split at every single offset.
    let document =
        b"%PDF-1.7 <</OpenAction<</S/J#61vaScript/JS 1 0 R>>/Names[/EmbeddedFile]/XFA 2 0 R>>";
    let whole = scan(document);

    assert_eq!(
        whole,
        [
            DocumentRisk::EmbeddedJavascript,
            DocumentRisk::ActionOnOpen,
            DocumentRisk::AttachedFile,
            DocumentRisk::XfaForm,
        ],
        "the undivided answer is what the split ones are compared against"
    );

    for split in 0..=document.len() {
        let mut scan = RiskScan::new();
        scan.feed(&document[..split]);
        scan.feed(&document[split..]);

        assert_eq!(scan.finish(), whole, "split at {split} disagreed");
    }
}

#[test]
fn feeding_one_byte_at_a_time_agrees_as_well() {
    // The pathological chunking. Every `#xx` escape is then split across three calls.
    let document = b"<</S/#4a#53/URI(http://x)/Movie 3 0 R>>";
    let mut scan = RiskScan::new();

    for byte in document {
        scan.feed(&[*byte]);
    }

    assert_eq!(
        scan.finish(),
        [
            DocumentRisk::EmbeddedJavascript,
            DocumentRisk::EmbeddedMedia,
            DocumentRisk::ExternalLink,
        ]
    );
}

#[test]
fn findings_come_back_worst_first() {
    // So a UI can show the first one and be showing the one that matters. Declared in
    // severity order and collected from a set, rather than sorted by the caller against a
    // table it would have to keep in step.
    let found = scan(b"/URI /Encrypt /JavaScript /Movie /Launch /EmbeddedFile");

    assert_eq!(
        found,
        [
            DocumentRisk::EmbeddedJavascript,
            DocumentRisk::LaunchesAProgram,
            DocumentRisk::AttachedFile,
            DocumentRisk::EmbeddedMedia,
            DocumentRisk::ExternalLink,
            DocumentRisk::Encrypted,
        ]
    );

    let severities: Vec<RiskSeverity> = found.iter().map(|risk| risk.severity()).collect();
    let mut sorted = severities.clone();
    sorted.sort_unstable();

    assert_eq!(severities, sorted, "severity must not go backwards");
}

#[test]
fn the_same_indicator_twice_is_reported_once() {
    // A deck with four hundred hyperlinks is one thing to say, not four hundred.
    assert_eq!(
        scan(b"/URI /URI /URI /URI"),
        [DocumentRisk::ExternalLink],
        "a set, not a tally"
    );
}

#[test]
fn every_risk_has_a_distinct_code_and_says_what_nexus_does() {
    // §1.4: the second sentence is the one that lets a person put the worry down, so its
    // absence is a defect rather than a style preference.
    let all = [
        DocumentRisk::EmbeddedJavascript,
        DocumentRisk::LaunchesAProgram,
        DocumentRisk::ActionOnOpen,
        DocumentRisk::RemoteData,
        DocumentRisk::AttachedFile,
        DocumentRisk::XfaForm,
        DocumentRisk::EmbeddedMedia,
        DocumentRisk::ExternalLink,
        DocumentRisk::Encrypted,
    ];

    let mut codes: Vec<&str> = all.iter().map(|risk| risk.code()).collect();
    codes.sort_unstable();
    let distinct = codes.len();
    codes.dedup();

    assert_eq!(codes.len(), distinct, "two risks share a code");

    for risk in all {
        let said = risk.explanation();

        assert!(
            said.contains("Nexus"),
            "{} never says what Nexus does",
            risk.code()
        );
        assert!(
            said.ends_with('.') && said.matches(". ").count() >= 1,
            "{} is not two sentences: {said}",
            risk.code()
        );
    }
}

#[test]
fn nothing_found_is_reported_as_nothing_found_and_not_as_safe() {
    // A documentation test as much as a behaviour one: the type has no "safe" state to
    // return, because the scan cannot establish one -- indicators inside a compressed
    // object stream are invisible to it. An empty list is the only honest answer available.
    assert_eq!(scan(b"%PDF-1.7\n"), Vec::new());
}
