//! Contract tests for [`Timestamp`].
//!
//! The calendar arithmetic is hand-written, so it is checked against vectors taken from
//! the system `date` command rather than from the implementation it is meant to verify.
//! During development it was also compared against `date -u -r` over 20,000 pseudorandom
//! instants spanning 1930 to 2129, with no mismatch; the cases pinned here are the
//! boundaries worth keeping in the suite.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{Clock, CoreError, FixedClock, Timestamp};

#[test]
fn renders_instants_the_way_the_system_clock_does() {
    // Every expectation below came from `date -u -r <seconds> +%Y-%m-%dT%H:%M:%SZ`.
    let vectors = [
        (0, "1970-01-01T00:00:00Z"),
        (1, "1970-01-01T00:00:01Z"),
        (86_399, "1970-01-01T23:59:59Z"),
        (86_400, "1970-01-02T00:00:00Z"),
        // 2000 is a leap year despite being a century: divisible by 400.
        (951_782_400, "2000-02-29T00:00:00Z"),
        (1_709_164_800, "2024-02-29T00:00:00Z"),
        (1_767_225_599, "2025-12-31T23:59:59Z"),
        (1_767_225_600, "2026-01-01T00:00:00Z"),
        // 2100 is *not* a leap year, so this is the day after the 28th of February.
        (4_107_542_400, "2100-03-01T00:00:00Z"),
        (1_761_580_800, "2025-10-27T16:00:00Z"),
    ];

    for (seconds, expected) in vectors {
        let rendered = Timestamp::from_unix_seconds(seconds).unwrap();
        assert_eq!(rendered.as_str(), expected, "for {seconds} seconds");
    }
}

#[test]
fn handles_instants_before_the_epoch() {
    // Negative seconds need floor division, not truncation: truncating would place
    // 1969-12-31T23:59:59 on the 1st of January.
    for (seconds, expected) in [
        (-1, "1969-12-31T23:59:59Z"),
        (-86_400, "1969-12-31T00:00:00Z"),
    ] {
        let rendered = Timestamp::from_unix_seconds(seconds).unwrap();
        assert_eq!(rendered.as_str(), expected, "for {seconds} seconds");
    }
}

#[test]
fn refuses_an_instant_the_format_cannot_write() {
    // A machine clock reading year 300,000 must error rather than emit a malformed
    // timestamp into a vault.
    assert!(Timestamp::from_unix_seconds(i64::MAX).is_err());
    assert!(Timestamp::from_unix_seconds(i64::MIN).is_err());
}

#[test]
fn accepts_the_canonical_form() {
    for raw in [
        "1970-01-01T00:00:00Z",
        "2026-10-27T16:00:00Z",
        "2024-02-29T12:30:45Z",
        "2000-02-29T00:00:00Z",
        "9999-12-31T23:59:59Z",
    ] {
        assert!(Timestamp::parse(raw).is_ok(), "`{raw}` should be accepted");
    }
}

#[test]
fn refuses_other_valid_rfc3339_spellings() {
    // These are legitimate RFC 3339, and are refused on purpose: mixing forms would
    // break the byte-order-equals-time-order property the rest of the app relies on.
    for raw in [
        "2026-10-27T16:00:00+01:00",
        "2026-10-27T16:00:00.5Z",
        "2026-10-27T16:00:00",
        "2026-10-27T16:00:00z",
        "2026-10-27 16:00:00Z",
        "2026-10-27T16:00Z",
    ] {
        assert!(
            Timestamp::parse(raw).is_err(),
            "`{raw}` is not the canonical form and must be refused"
        );
    }
}

#[test]
fn refuses_dates_that_do_not_exist() {
    for raw in [
        "2026-02-30T00:00:00Z",
        "2026-02-29T00:00:00Z",
        "2100-02-29T00:00:00Z",
        "2026-13-01T00:00:00Z",
        "2026-00-01T00:00:00Z",
        "2026-01-00T00:00:00Z",
        "2026-01-32T00:00:00Z",
        "2026-04-31T00:00:00Z",
    ] {
        assert!(
            Timestamp::parse(raw).is_err(),
            "`{raw}` is not a real instant and must be refused"
        );
    }
}

#[test]
fn refuses_out_of_range_times() {
    for raw in [
        "2026-10-27T24:00:00Z",
        "2026-10-27T16:60:00Z",
        // A leap second. Unix time has none, so this could not have come from here.
        "2026-10-27T16:00:60Z",
    ] {
        assert!(Timestamp::parse(raw).is_err(), "`{raw}` must be refused");
    }
}

#[test]
fn refuses_non_digits_in_a_numeric_field() {
    for raw in [
        "20x6-10-27T16:00:00Z",
        "2026-1o-27T16:00:00Z",
        "2026-10-27T16:0 :00Z",
        "+026-10-27T16:00:00Z",
    ] {
        assert!(Timestamp::parse(raw).is_err(), "`{raw}` must be refused");
    }
}

/// The property the canonical form exists to provide.
#[test]
fn byte_order_matches_chronological_order() {
    // Sorting lectures by date is a plain string sort, with no date library involved.
    // If this ever regressed, lists would silently come out in the wrong order.
    let chronological: Vec<Timestamp> = [
        1_i64,
        86_400,
        951_782_400,
        1_709_164_800,
        1_761_580_800,
        1_767_225_600,
    ]
    .into_iter()
    .map(|s| Timestamp::from_unix_seconds(s).unwrap())
    .collect();

    let mut shuffled = vec![
        chronological.get(3).unwrap().clone(),
        chronological.first().unwrap().clone(),
        chronological.get(5).unwrap().clone(),
        chronological.get(2).unwrap().clone(),
        chronological.get(4).unwrap().clone(),
        chronological.get(1).unwrap().clone(),
    ];
    shuffled.sort();

    assert_eq!(shuffled, chronological);
}

#[test]
fn what_it_renders_it_can_read_back() {
    for seconds in [0_i64, -1, 1_761_580_800, 951_782_400, 4_107_542_400] {
        let rendered = Timestamp::from_unix_seconds(seconds).unwrap();
        let reparsed = Timestamp::parse(rendered.as_str()).unwrap();

        assert_eq!(rendered, reparsed, "for {seconds} seconds");
    }
}

#[test]
fn survives_a_json_round_trip_as_a_bare_string() {
    let stamp = Timestamp::parse("2026-10-27T16:00:00Z").unwrap();

    let json = serde_json::to_string(&stamp).unwrap();
    assert_eq!(json, r#""2026-10-27T16:00:00Z""#);

    let parsed: Timestamp = serde_json::from_str(&json).unwrap();
    assert_eq!(stamp, parsed);
}

#[test]
fn deserialization_cannot_bypass_validation() {
    for raw in [
        r#""2026-02-30T00:00:00Z""#,
        r#""2026-10-27T16:00:00+01:00""#,
        r#""not a date""#,
        r#""""#,
    ] {
        let parsed = serde_json::from_str::<Timestamp>(raw);
        assert!(
            parsed.is_err(),
            "stored timestamp {raw} must be rejected on read, got {parsed:?}"
        );
    }
}

#[test]
fn a_fixed_clock_reports_the_instant_it_was_given() {
    // The reason the clock is a port: anything that stamps a record can be tested
    // against a known instant rather than against whenever the suite runs.
    let instant = Timestamp::parse("2026-10-27T16:00:00Z").unwrap();
    let clock = FixedClock::new(instant.clone());

    assert_eq!(clock.now().unwrap(), instant);
    assert_eq!(clock.now().unwrap(), instant, "and again, unchanged");
}

#[test]
fn errors_carry_a_code_and_plain_language_remediation() {
    let err = Timestamp::parse("2026-02-30T00:00:00Z").unwrap_err();

    assert!(matches!(err, CoreError::InvalidTimestamp { .. }));
    assert_eq!(err.code(), "ERR_INVALID_TIMESTAMP");
    assert!(err.remediation().contains("Nothing was deleted"));
}
