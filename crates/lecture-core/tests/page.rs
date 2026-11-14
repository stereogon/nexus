//! A page's file: front matter and body, and the link written to it.
#![allow(clippy::unwrap_used)]

use lecture_core::{
    PageFile, PageHeader, PageId, PageUnreadable, Timestamp, page_and_descendants, page_link,
    page_title,
};

fn header(parent: Option<&str>) -> PageHeader {
    PageHeader {
        title: "Leader election: \"ideas\"".to_owned(),
        parent: parent.map(|id| PageId::parse(id).unwrap()),
        created: Timestamp::parse("2026-11-14T09:30:00Z").unwrap(),
    }
}

#[test]
fn a_page_round_trips_its_header_and_body() {
    for parent in [None, Some("18f2a0b1")] {
        for body in [
            "",
            "One line",
            "\nStarts blank\n\n---\nhas a rule",
            "Ends with a newline\n",
        ] {
            let text = format!("{}{body}", header(parent).write());
            let page = PageFile::parse(&text).unwrap();

            assert_eq!(page.header, header(parent), "{text}");
            assert_eq!(page.body, body, "{text}");
            assert_eq!(format!("{}{}", page.front, page.body), text);
        }
    }
}

#[test]
fn unknown_keys_are_ignored_and_kept_in_the_front_matter() {
    let text = "---\nnexus-page: 1\ntitle: \"A\"\ncolour: \"teal\"\ncreated: \"2026-11-14T09:30:00Z\"\n---\n\nBody";
    let page = PageFile::parse(text).unwrap();

    assert_eq!(page.header.title, "A");
    assert!(page.front.contains("colour"));
    assert_eq!(page.body, "Body");
}

#[test]
fn a_file_that_is_not_a_page_says_why() {
    let cases = [
        ("Just notes", "it does not start with a --- line"),
        (
            "---\ntitle: \"A\"\n",
            "its front matter has no closing --- line",
        ),
        (
            "---\ncreated: \"2026-11-14T09:30:00Z\"\n---\n",
            "it has no title",
        ),
        (
            "---\ntitle: A\ncreated: \"2026-11-14T09:30:00Z\"\n---\n",
            "a value in its front matter is not a quoted string",
        ),
        (
            "---\ntitle: \"A\"\nparent: \"no spaces\"\ncreated: \"2026-11-14T09:30:00Z\"\n---\n",
            "its parent is not a page id",
        ),
    ];

    for (text, why) in cases {
        assert_eq!(
            PageFile::parse(text).err(),
            Some(PageUnreadable::Damaged(why)),
            "{text}"
        );
    }
}

#[test]
fn a_page_from_a_newer_build_is_told_apart_from_a_damaged_one() {
    let text = "---\nnexus-page: 2\ntitle: \"A\"\ncreated: \"2026-11-14T09:30:00Z\"\n---\n";

    assert_eq!(
        PageFile::parse(text).err(),
        Some(PageUnreadable::Newer { found: 2 })
    );
}

#[test]
fn a_title_is_one_trimmed_line_of_reasonable_length() {
    assert_eq!(page_title("  Split votes ").unwrap(), "Split votes");
    assert!(page_title("   ").is_err());
    assert!(page_title("two\nlines").is_err());
    assert!(page_title(&"x".repeat(201)).is_err());
    assert!(page_title(&"x".repeat(200)).is_ok());
}

#[test]
fn a_link_escapes_what_would_end_its_text() {
    let id = PageId::parse("abc-1").unwrap();

    assert_eq!(page_link(&id, "Plain"), "[Plain](page://abc-1)");
    assert_eq!(page_link(&id, r"[a] b\c"), r"[\[a\] b\\c](page://abc-1)");
}

#[test]
fn only_md_files_with_valid_ids_are_pages() {
    assert_eq!(
        PageId::of_file_name("abc.md"),
        Some(PageId::parse("abc").unwrap())
    );
    assert_eq!(PageId::of_file_name("abc.txt"), None);
    assert_eq!(PageId::of_file_name("a b.md"), None);
    assert_eq!(PageId::parse("abc").unwrap().file_name(), "abc.md");
}

#[test]
fn a_page_and_everything_inside_it_are_found_even_past_a_hand_made_cycle() {
    let id = |raw: &str| PageId::parse(raw).unwrap();
    let parents = vec![
        (id("a"), None),
        (id("b"), Some(id("a"))),
        (id("c"), Some(id("b"))),
        (id("d"), None),
        // A hand edit pointing a page back at its own descendant.
        (id("x"), Some(id("y"))),
        (id("y"), Some(id("x"))),
    ];

    assert_eq!(
        page_and_descendants(&parents, &id("a")),
        vec![id("a"), id("b"), id("c")]
    );
    assert_eq!(page_and_descendants(&parents, &id("d")), vec![id("d")]);
    assert_eq!(
        page_and_descendants(&parents, &id("x")),
        vec![id("x"), id("y")]
    );
}
