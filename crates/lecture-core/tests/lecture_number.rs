//! A lecture's number: what counts as one, how numbers order, how one is taken out of a
//! file's name, and where a numbered lecture is placed.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use lecture_core::{LectureNumber, OrderKey, placed_by_number, split_number};

fn n(text: &str) -> LectureNumber {
    LectureNumber::parse(text).unwrap()
}

#[test]
fn a_number_is_short_and_made_of_letters_digits_dots_and_dashes() {
    for good in ["3", "03", "3a", "3.1", "IV", "L-2", " 7 "] {
        assert!(LectureNumber::parse(good).is_some(), "{good:?}");
    }

    for bad in ["", "   ", "3/4", "a b", "1234567890123", "3:1"] {
        assert!(LectureNumber::parse(bad).is_none(), "{bad:?}");
    }

    assert_eq!(n(" 7 ").as_str(), "7");
}

#[test]
fn numbers_order_naturally() {
    let mut numbers = [
        n("10"),
        n("IV"),
        n("3b"),
        n("2"),
        n("03"),
        n("3a"),
        n("1.5"),
        n("1"),
    ];
    numbers.sort();

    let order: Vec<&str> = numbers.iter().map(LectureNumber::as_str).collect();
    assert_eq!(order, ["1", "1.5", "2", "03", "3a", "3b", "10", "IV"]);
}

#[test]
fn a_manifest_number_nobody_could_type_is_refused() {
    assert!(serde_json::from_str::<LectureNumber>("\"3/4\"").is_err());
    assert_eq!(
        serde_json::from_str::<LectureNumber>("\"3a\"").unwrap(),
        n("3a")
    );
}

fn split(name: &str) -> (Option<String>, String) {
    let found = split_number(name);

    (
        found.number.map(|number| number.as_str().to_owned()),
        found.title,
    )
}

#[test]
fn a_number_at_the_start_of_a_name_is_taken_out() {
    assert_eq!(
        split("2. ProcessOverview"),
        (Some("2".into()), "ProcessOverview".into())
    );
    assert_eq!(
        split("02 - Raft consensus"),
        (Some("2".into()), "Raft consensus".into())
    );
    assert_eq!(split("03_Paxos"), (Some("3".into()), "Paxos".into()));
    assert_eq!(split("4) Logs"), (Some("4".into()), "Logs".into()));
    assert_eq!(
        split("5a – Snapshots"),
        (Some("5a".into()), "Snapshots".into())
    );
}

#[test]
fn the_word_lecture_and_a_number_are_found_anywhere() {
    assert_eq!(split("Lecture 3 Raft"), (Some("3".into()), "Raft".into()));
    assert_eq!(split("L03_Raft"), (Some("3".into()), "Raft".into()));
    assert_eq!(
        split("lec-7 Byzantine faults"),
        (Some("7".into()), "Byzantine faults".into())
    );
    assert_eq!(
        split("Week 4 Lecture 2 - Logs"),
        (Some("2".into()), "Week 4 – Logs".into())
    );
    assert_eq!(split("CS454 Lec 12"), (Some("12".into()), "CS454".into()));
}

#[test]
fn names_without_a_lecture_number_are_left_whole() {
    for name in [
        "ProcessOverview",
        "2024 Exam Review",
        "3D printing basics",
        "Linear algebra",
        "Clever lecturer notes",
    ] {
        assert_eq!(split(name), (None, name.to_owned()), "{name:?}");
    }
}

#[test]
fn a_name_that_is_only_a_number_keeps_it_as_the_title_too() {
    assert_eq!(split("03"), (Some("3".into()), "03".into()));
    assert_eq!(split("Lecture 5"), (Some("5".into()), "Lecture 5".into()));
}

#[test]
fn names_outside_ascii_are_split_without_breaking_characters() {
    assert_eq!(
        split("2. Réseaux — routage"),
        (Some("2".into()), "Réseaux — routage".into())
    );
    assert_eq!(
        split("Vorlesung 3 Über Lecture 4"),
        (Some("4".into()), "Vorlesung 3 Über".into())
    );
}

fn key(text: &str) -> OrderKey {
    OrderKey::parse(text).unwrap()
}

#[test]
fn a_numbered_lecture_goes_before_the_first_numbered_higher() {
    let others = vec![
        (key("a0"), Some(n("1"))),
        (key("a1"), Some(n("2"))),
        (key("a2"), Some(n("4"))),
    ];

    let placed = placed_by_number(&others, &n("3")).unwrap();

    assert!(placed > key("a1") && placed < key("a2"));
}

#[test]
fn it_goes_after_others_with_the_same_number() {
    // Two courses can both have a lecture 2.
    let others = vec![(key("a0"), Some(n("2"))), (key("a1"), Some(n("3")))];

    let placed = placed_by_number(&others, &n("2")).unwrap();

    assert!(placed > key("a0") && placed < key("a1"));
}

#[test]
fn it_goes_last_when_nothing_is_numbered_higher() {
    let others = vec![(key("a0"), Some(n("1"))), (key("a1"), None)];

    assert!(placed_by_number(&others, &n("9")).unwrap() > key("a1"));
}

#[test]
fn unnumbered_lectures_keep_their_place_and_are_stepped_over() {
    // An unnumbered lecture between 1 and 5 stays before the new 3: 3 goes just before 5.
    let others = vec![
        (key("a0"), Some(n("1"))),
        (key("a1"), None),
        (key("a2"), Some(n("5"))),
    ];

    let placed = placed_by_number(&others, &n("3")).unwrap();

    assert!(placed > key("a1") && placed < key("a2"));
}

#[test]
fn the_first_lecture_of_an_empty_vault_gets_a_key() {
    assert!(placed_by_number(&[], &n("1")).is_ok());
}
