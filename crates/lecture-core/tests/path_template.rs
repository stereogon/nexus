//! Where a template puts a lecture, and what it refuses to accept.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{CoreError, Facets, Label, PathTemplate};

fn label(text: &str) -> Label {
    Label::parse(text).unwrap()
}

fn facets() -> Facets {
    Facets::empty()
        .with_course(label("CS 454"))
        .with_module(label("Distributed Systems"))
        .with_week(label("Week 3"))
}

fn rendered(template: &str, facets: &Facets, title: &str) -> String {
    PathTemplate::parse(template)
        .unwrap()
        .render(facets, &label(title))
        .unwrap()
        .to_string()
}

#[test]
fn a_template_files_a_lecture_under_its_facets() {
    assert_eq!(
        rendered("{course}/{week}-{title}", &facets(), "Raft and consensus"),
        "cs-454/week-3-raft-and-consensus"
    );
}

#[test]
fn every_level_is_slugified_so_a_title_may_be_written_normally() {
    // Two things this pins, both already `Slug::from_title`'s behaviour rather than this
    // module's, and asserted here because a template is where a person's own words first
    // become a folder name.
    //
    // Lowercased, because APFS is case-insensitive: `Raft` and `raft` would collide as
    // folder names, so one case is produced consistently.
    //
    // And punctuation that is *legal on disk* is kept. `:` goes because it is forbidden in
    // a path, whitespace collapses to a single hyphen — but `&` and the brackets stay. I
    // expected them to be stripped and they are not, which on reflection is the better
    // behaviour: the folder stays recognisable as the lecture it came from, and §3 wants
    // these names legible in Finder.
    assert_eq!(
        rendered(
            "{course}/{title}",
            &facets(),
            "Raft & Paxos: a comparison (part 2)"
        ),
        "cs-454/raft-&-paxos-a-comparison-(part-2)"
    );
}

#[test]
fn a_level_with_a_missing_placeholder_is_left_out_entirely() {
    // Rather than inventing an `unfiled` folder or leaving a stray hyphen where the value
    // should have been.
    let no_module = Facets::empty()
        .with_course(label("CS 454"))
        .with_week(label("Week 3"));

    assert_eq!(
        rendered("{course}/{module}/{title}", &no_module, "Raft"),
        "cs-454/raft"
    );
}

#[test]
fn a_mixed_level_goes_or_stays_as_one_piece() {
    // `{week}-{title}` with no week must not render as `-raft`.
    let no_week = Facets::empty().with_course(label("CS 454"));

    assert_eq!(
        rendered("{course}/{week}-{title}", &no_week, "Raft"),
        "cs-454",
        "the level holding the title is the one that must always render"
    );
}

#[test]
fn the_last_level_always_renders_because_a_lecture_always_has_a_title() {
    // Which is why `{title}` is required there: with nothing else resolving, a lecture
    // still gets a folder of its own rather than becoming its course.
    assert_eq!(
        rendered("{course}/{module}/{title}", &Facets::empty(), "Raft"),
        "raft"
    );
}

#[test]
fn custom_facets_work_by_their_own_name() {
    let facets = Facets::empty()
        .with_custom("term", label("Autumn 2026"))
        .unwrap();

    assert_eq!(
        rendered("{term}/{title}", &facets, "Raft"),
        "autumn-2026/raft"
    );
}

#[test]
fn literal_folders_are_kept_as_written() {
    assert_eq!(
        rendered("lectures/{course}/{title}", &facets(), "Raft"),
        "lectures/cs-454/raft"
    );
}

#[test]
fn a_template_that_does_not_end_with_the_title_is_refused() {
    // Otherwise two lectures in one course land on the same folder, and the second would
    // be filed on top of the first.
    let error = PathTemplate::parse("{course}/{week}").unwrap_err();

    assert_eq!(error.code(), "ERR_INVALID_PATH_TEMPLATE");
    assert!(error.remediation().contains("{title}"));
}

#[test]
fn tags_are_refused_because_a_lecture_may_have_several() {
    let error = PathTemplate::parse("{tags}/{title}").unwrap_err();

    assert_eq!(error.code(), "ERR_INVALID_PATH_TEMPLATE");
    assert!(matches!(
        error,
        CoreError::InvalidPathTemplate { reason, .. } if reason.contains("several")
    ));
}

#[test]
fn unbalanced_braces_are_refused_rather_than_guessed_at() {
    for bad in ["{course/{title}", "{course}/title}", "{course}/{{title}"] {
        assert_eq!(
            PathTemplate::parse(bad).unwrap_err().code(),
            "ERR_INVALID_PATH_TEMPLATE",
            "`{bad}` should be refused"
        );
    }
}

#[test]
fn an_empty_or_malformed_shape_is_refused() {
    for bad in ["", "   ", "{course}//{title}", "/{title}", "{}/{title}"] {
        assert_eq!(
            PathTemplate::parse(bad).unwrap_err().code(),
            "ERR_INVALID_PATH_TEMPLATE",
            "`{bad}` should be refused"
        );
    }
}

#[test]
fn a_template_deeper_than_the_nesting_cap_is_refused_at_parse_time() {
    // Caught while someone is still looking at the template, not a hundred lectures later.
    let error = PathTemplate::parse("a/b/c/d/e/{title}").unwrap_err();

    assert_eq!(error.code(), "ERR_INVALID_PATH_TEMPLATE");
    assert_eq!(PathTemplate::parse("a/b/c/d/{title}").unwrap().depth(), 5);
}

#[test]
fn a_title_with_nothing_usable_in_it_fails_at_render_rather_than_silently() {
    let error = PathTemplate::parse("{title}")
        .unwrap()
        .render(&Facets::empty(), &label("///"))
        .unwrap_err();

    assert_eq!(error.code(), "ERR_INVALID_NAME");
}

#[test]
fn two_lectures_differing_only_in_case_land_on_one_folder() {
    // Recorded as behaviour, not a bug: lowercasing is what avoids an APFS collision
    // nobody asked for. Two lectures genuinely called `Raft` and `raft` in the same course
    // do collide, and that is for the reorganize plan to report rather than for rendering
    // to invent a suffix nobody can predict.
    let template = PathTemplate::parse("{course}/{title}").unwrap();
    let facets = facets();

    assert_eq!(
        template.render(&facets, &label("Raft")).unwrap(),
        template.render(&facets, &label("raft")).unwrap()
    );
}
