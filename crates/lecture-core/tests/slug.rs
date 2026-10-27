//! Contract tests for [`Slug`].
//!
//! The adversarial cases matter more than the happy ones here: a slug is the barrier
//! between an untrusted title or pasted filename and the filesystem.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{CoreError, Slug};

#[test]
fn accepts_ordinary_names() {
    for raw in [
        "raft-consensus",
        "01-raft-consensus",
        "Week 03",
        "figure.png",
        "2026-10-distributed-consensus",
        "lecture_4",
        "微积分",
        "Fourier-Transformation",
    ] {
        assert!(Slug::parse(raw).is_ok(), "`{raw}` should be a valid name");
    }
}

#[test]
fn rejects_path_separators() {
    // The core guarantee: a slug is one segment, so it cannot escape its parent.
    for raw in [
        "../etc/passwd",
        "..",
        ".",
        "a/b",
        "a\\b",
        "notes:hidden",
        "a*b",
        "a?b",
        "a\"b",
        "a<b",
        "a>b",
        "a|b",
    ] {
        assert!(
            Slug::parse(raw).is_err(),
            "`{raw}` must be refused as a single segment"
        );
    }
}

#[test]
fn rejects_null_bytes_and_control_characters() {
    assert!(Slug::parse("week\u{0}3").is_err(), "NUL must be refused");
    assert!(Slug::parse("week\n3").is_err(), "newline must be refused");
    assert!(Slug::parse("week\t3").is_err(), "tab must be refused");
    assert!(Slug::parse("week\u{7f}3").is_err(), "DEL must be refused");
}

#[test]
fn rejects_invisible_characters_that_could_disguise_a_name() {
    // A right-to-left override lets "gpj.evil" render as "evil.jpg" in the sidebar.
    for raw in [
        "week\u{202E}3",
        "week\u{200B}3",
        "week\u{FEFF}3",
        "week\u{00AD}3",
    ] {
        assert!(
            Slug::parse(raw).is_err(),
            "invisible character in `{}` must be refused",
            raw.escape_unicode()
        );
    }
}

#[test]
fn rejects_names_that_vanish_or_mislead() {
    assert!(Slug::parse("").is_err(), "empty");
    assert!(
        Slug::parse(".hidden").is_err(),
        "leading dot hides the folder"
    );
    assert!(
        Slug::parse("-rf").is_err(),
        "leading hyphen reads as a flag"
    );
    assert!(Slug::parse("week3.").is_err(), "trailing dot is dropped");
    assert!(Slug::parse(" week3").is_err(), "leading space");
    assert!(Slug::parse("week3 ").is_err(), "trailing space");
}

#[test]
fn rejects_windows_device_names() {
    // Legal on APFS, fatal on a Windows or exFAT sync target.
    for raw in ["con", "CON", "Con", "nul", "aux", "com1", "LPT9", "con.png"] {
        assert!(
            Slug::parse(raw).is_err(),
            "`{raw}` is a reserved device name and must be refused"
        );
    }
}

#[test]
fn rejects_names_too_long_to_save_safely() {
    let ok = "a".repeat(200);
    let too_long = "a".repeat(201);

    assert!(
        Slug::parse(&ok).is_ok(),
        "200 bytes is the documented limit"
    );
    assert!(Slug::parse(&too_long).is_err(), "201 bytes must be refused");
}

#[test]
fn length_limit_leaves_room_for_atomic_staging() {
    // The reason the cap is 200 rather than 255: saving stages at
    // `<name>.tmp.<uuid>`, and that path must still be legal.
    let name = Slug::parse(&"a".repeat(200)).unwrap();
    let staged = format!("{}.tmp.{}", name.as_str(), "0".repeat(36));

    assert!(
        staged.len() <= 255,
        "staging path is {} bytes, past the filesystem limit",
        staged.len()
    );
}

#[test]
fn normalizes_to_nfc_so_one_name_is_one_folder() {
    // "Café" decomposed vs precomposed. HFS+ hands back the first form and APFS the
    // second, so without normalization the same lecture becomes two folders once the
    // vault syncs.
    let decomposed = Slug::parse("Cafe\u{301}").unwrap();
    let precomposed = Slug::parse("Caf\u{e9}").unwrap();

    assert_eq!(decomposed, precomposed);
    assert_eq!(decomposed.as_str(), "Caf\u{e9}");
}

/// The one that would be a vulnerability if it regressed.
#[test]
fn normalization_never_manufactures_a_path_separator() {
    // NFKC folds U+FF0F FULLWIDTH SOLIDUS to a plain '/'. Using NFKC here would turn a
    // name containing no separator into one that does, which is a traversal vector.
    // NFC leaves it alone, and it is then accepted as an ordinary character.
    let slug = Slug::parse("week\u{FF0F}3").unwrap();

    assert!(
        !slug.as_str().contains('/'),
        "normalization produced a path separator from `{}`",
        slug.as_str()
    );
    assert_eq!(slug.as_str(), "week\u{FF0F}3");
}

#[test]
fn derives_a_slug_from_a_human_title() {
    let cases = [
        ("Raft Consensus", "raft-consensus"),
        ("  Week 3: Intro/Outro  ", "week-3-intro-outro"),
        ("Leader   Election", "leader-election"),
        ("Fourier Transformation", "fourier-transformation"),
        // An em-dash in a title means a separator, so it collapses rather than
        // surviving as `cs454-—-lecture-4`.
        ("CS454 — Lecture 4", "cs454-lecture-4"),
        ("Trees • Graphs", "trees-graphs"),
    ];

    for (title, expected) in cases {
        let slug = Slug::from_title(title).unwrap();
        assert_eq!(slug.as_str(), expected, "title `{title}`");
    }
}

#[test]
fn derives_a_safe_slug_from_a_hostile_title() {
    let slug = Slug::from_title("../../etc/passwd").unwrap();

    assert!(!slug.as_str().contains('/'), "no separator may survive");
    assert!(
        !slug.as_str().starts_with('.'),
        "no leading dot may survive"
    );
    assert_eq!(slug.as_str(), "etc-passwd");
}

#[test]
fn refuses_a_title_with_nothing_usable_in_it() {
    for title in ["", "   ", "///", "..."] {
        let derived = Slug::from_title(title);
        assert!(
            derived.is_err(),
            "`{title}` yields no usable folder name, got {derived:?}"
        );
    }
}

#[test]
fn truncates_a_long_title_on_a_character_boundary() {
    // Multi-byte characters must not be sliced in half, which would produce invalid
    // UTF-8 and a name the filesystem cannot represent.
    let title = "微积分".repeat(200);
    let slug = Slug::from_title(&title).unwrap();

    assert!(slug.as_str().len() <= 200, "must respect the byte cap");
    assert!(
        slug.as_str()
            .chars()
            .all(|c| c == '微' || c == '积' || c == '分'),
        "truncation split a character"
    );
}

#[test]
fn errors_carry_a_code_and_plain_language_remediation() {
    let err = Slug::parse("a/b").unwrap_err();

    assert!(matches!(err, CoreError::InvalidName { .. }));
    assert_eq!(err.code(), "ERR_INVALID_NAME");
    assert!(err.remediation().contains("Nothing was created"));
}

#[test]
fn survives_a_json_round_trip() {
    let slug = Slug::parse("raft-consensus").unwrap();

    let json = serde_json::to_string(&slug).unwrap();
    assert_eq!(json, r#""raft-consensus""#);

    let parsed: Slug = serde_json::from_str(&json).unwrap();
    assert_eq!(slug, parsed);
}

#[test]
fn deserialization_cannot_bypass_validation() {
    for raw in [
        r#""../etc""#,
        r#""a/b""#,
        r#""""#,
        r#""con""#,
        r#"".hidden""#,
    ] {
        let parsed = serde_json::from_str::<Slug>(raw);
        assert!(
            parsed.is_err(),
            "stored name {raw} must be rejected on read, got {parsed:?}"
        );
    }
}
