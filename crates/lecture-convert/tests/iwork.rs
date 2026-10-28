//! The Keynote/Pages adapter, driven through a stub `osascript`.
//!
//! Neither app is launched. The stub receives the real argument list the adapter builds,
//! and the production spawning, exit-status, output-checking and move-into-place code runs
//! start to finish against it.
//!
//! The stub is also an assertion in its own right: it refuses to run unless the paths
//! arrive as **arguments**, and fails loudly if the input path appears anywhere in the
//! script text. If the adapter ever went back to interpolating paths into `AppleScript`,
//! every test in this file would fail rather than quietly passing.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "support/osascript_stub.rs"]
mod osascript_stub;
#[path = "support/vault.rs"]
mod vault;

use std::ffi::OsString;
use std::path::Path;

use lecture_convert::iwork::{IworkApp, IworkConverter, command_arguments, export_script};
use lecture_core::{
    ConversionRequest, CoreError, DocumentConverterPort, DocumentFormat, RelativePath,
};

use osascript_stub::{OsascriptBehaviour, stub_osascript};
use vault::Fixture;

/// A request to convert this lecture's original into its document.
fn request(extension: &str, format: DocumentFormat) -> ConversionRequest {
    ConversionRequest::new(
        RelativePath::parse(&format!("cs454/raft/source/original.{extension}")).unwrap(),
        format,
        RelativePath::parse("cs454/raft/source/document.pdf").unwrap(),
    )
    .unwrap()
}

/// A converter driving `app` through a stub that behaves as described.
fn converter(fixture: &Fixture, app: IworkApp, behaviour: &OsascriptBehaviour) -> IworkConverter {
    let osascript = stub_osascript(fixture.profiles.path(), behaviour);

    IworkConverter::at(app, osascript, fixture.storage()).unwrap()
}

#[test]
fn keynote_exports_a_deck_and_the_original_survives() {
    let fixture = Fixture::new();
    let keynote = converter(&fixture, IworkApp::Keynote, &OsascriptBehaviour::WritesAPdf);

    keynote
        .convert(&request("pptx", DocumentFormat::Pptx))
        .unwrap();

    let document = std::fs::read(fixture.in_source("document.pdf")).unwrap();
    assert!(document.starts_with(b"%PDF-"));
    assert!(
        fixture.in_source("original.pptx").is_file(),
        "the original is kept so reconversion stays possible"
    );
    assert!(
        !fixture.in_source("original.pdf").exists(),
        "the intermediate should have been moved, not copied"
    );
}

#[test]
fn a_vault_in_a_folder_whose_name_contains_a_quote_still_converts() {
    // The reason the paths are arguments rather than script text. A vault root is not a
    // `Slug` -- it is wherever the person chose to keep their files -- so it can contain a
    // quote, and interpolating it into AppleScript would end the string literal and
    // execute whatever followed.
    let fixture = Fixture::rooted_at(r#"my "study" vault; say hello"#);
    let keynote = converter(&fixture, IworkApp::Keynote, &OsascriptBehaviour::WritesAPdf);

    keynote
        .convert(&request("pptx", DocumentFormat::Pptx))
        .expect("a quote in the vault's own path must not break the export");

    assert!(
        std::fs::read(fixture.in_source("document.pdf"))
            .unwrap()
            .starts_with(b"%PDF-")
    );
}

#[test]
fn the_script_contains_nothing_that_came_from_a_person() {
    // Asserted directly, so the guarantee does not rest on the stub alone: the script is a
    // function of the app name and holds no path, no file name and no separator.
    for app in IworkApp::ALL {
        let script = export_script(app);

        assert!(
            !script.contains('/'),
            "{} script holds something path-like:\n{script}",
            app.application_name()
        );
        assert!(
            script.contains("on run argv") && script.contains("item 1 of argv"),
            "the paths must arrive as arguments:\n{script}"
        );
        assert!(
            script.contains("close theDocument saving no"),
            "the opened document must be left unmodified:\n{script}"
        );
    }
}

#[test]
fn the_argument_list_is_exactly_what_osascript_expects() {
    // The part no stub can vouch for, because a real `osascript` is what would reject it.
    let arguments = command_arguments(
        IworkApp::Pages,
        Path::new("/vault/cs454/raft/source/original.docx"),
        Path::new("/vault/cs454/raft/source/original.pdf"),
    );

    assert_eq!(
        arguments,
        vec![
            OsString::from("-e"),
            OsString::from(export_script(IworkApp::Pages)),
            OsString::from("/vault/cs454/raft/source/original.docx"),
            OsString::from("/vault/cs454/raft/source/original.pdf"),
        ]
    );
}

#[test]
fn a_refused_automation_permission_is_reported_as_one() {
    // "Try again" is useless when the operating system is the thing refusing, so this gets
    // its own error and its own remediation.
    let fixture = Fixture::new();
    let keynote = converter(
        &fixture,
        IworkApp::Keynote,
        &OsascriptBehaviour::RefusesPermission,
    );

    let error = keynote
        .convert(&request("pptx", DocumentFormat::Pptx))
        .unwrap_err();

    assert_eq!(error.code(), "ERR_CONVERTER_NOT_PERMITTED");
    assert!(matches!(
        error,
        CoreError::ConverterNotPermitted { ref converter } if converter == "Keynote"
    ));

    let remediation = error.remediation();
    assert!(
        remediation.contains("System Settings") && remediation.contains("Automation"),
        "the person needs to be told where to grant it: {remediation}"
    );
    assert!(
        remediation.contains("nothing was changed"),
        "and that nothing was lost: {remediation}"
    );
}

#[test]
fn an_ordinary_failure_is_not_mistaken_for_a_permission_problem() {
    // The two must not collapse: one is fixed in System Settings and the other is not.
    let fixture = Fixture::new();
    let keynote = converter(&fixture, IworkApp::Keynote, &OsascriptBehaviour::Fails);

    let error = keynote
        .convert(&request("pptx", DocumentFormat::Pptx))
        .unwrap_err();

    assert_eq!(error.code(), "ERR_CONVERSION_FAILED");
}

#[test]
fn a_script_that_ran_without_exporting_anything_is_a_failure() {
    // `osascript` exits 0 when the *script* ran, which is not the same as the export
    // having worked.
    let fixture = Fixture::new();
    let keynote = converter(
        &fixture,
        IworkApp::Keynote,
        &OsascriptBehaviour::SucceedsSilently,
    );

    let error = keynote
        .convert(&request("pptx", DocumentFormat::Pptx))
        .unwrap_err();

    assert_eq!(error.code(), "ERR_CONVERSION_FAILED");
    assert!(
        !fixture.in_source("document.pdf").exists(),
        "nothing may be recorded as the document"
    );
}

#[test]
fn an_empty_or_non_pdf_export_is_a_failure_and_leaves_nothing_behind() {
    for behaviour in [
        OsascriptBehaviour::WritesNothing,
        OsascriptBehaviour::WritesRubbish,
    ] {
        let fixture = Fixture::new();
        let keynote = converter(&fixture, IworkApp::Keynote, &behaviour);

        assert_eq!(
            keynote
                .convert(&request("pptx", DocumentFormat::Pptx))
                .unwrap_err()
                .code(),
            "ERR_CONVERSION_FAILED"
        );
        assert!(!fixture.in_source("document.pdf").exists());
        assert!(
            !fixture.in_source("original.pdf").exists(),
            "the unusable output is this converter's own leavings and should be gone"
        );
        assert!(fixture.in_source("original.pptx").is_file());
    }
}

#[test]
fn each_app_reads_only_the_formats_it_actually_opens() {
    let fixture = Fixture::new();

    let keynote = converter(&fixture, IworkApp::Keynote, &OsascriptBehaviour::WritesAPdf);
    assert!(keynote.supports(DocumentFormat::Pptx));
    assert!(keynote.supports(DocumentFormat::Ppt));
    assert!(!keynote.supports(DocumentFormat::Docx));
    assert!(!keynote.supports(DocumentFormat::Pdf));

    let pages = converter(&fixture, IworkApp::Pages, &OsascriptBehaviour::WritesAPdf);
    assert!(pages.supports(DocumentFormat::Docx));
    assert!(pages.supports(DocumentFormat::Doc));
    assert!(!pages.supports(DocumentFormat::Pptx));
    assert!(!pages.supports(DocumentFormat::Pdf));
}

#[test]
fn a_format_the_app_cannot_open_is_refused_before_it_is_launched() {
    // Pages cannot read a deck. Refusing here rather than letting the app fail means no
    // application is launched and nothing is written.
    let fixture = Fixture::new();
    let pages = converter(&fixture, IworkApp::Pages, &OsascriptBehaviour::WritesAPdf);

    let error = pages
        .convert(&request("pptx", DocumentFormat::Pptx))
        .unwrap_err();

    assert_eq!(error.code(), "ERR_UNSUPPORTED_DOCUMENT_FORMAT");
    assert!(!fixture.in_source("document.pdf").exists());
}

#[test]
fn the_label_written_to_a_manifest_names_the_app() {
    let fixture = Fixture::new();

    for (app, expected) in [(IworkApp::Keynote, "keynote"), (IworkApp::Pages, "pages")] {
        let made = converter(&fixture, app, &OsascriptBehaviour::WritesAPdf);

        assert_eq!(made.label().as_str(), expected);
        assert_eq!(made.app(), app);
    }
}

#[test]
fn discovery_agrees_with_whether_the_app_is_installed() {
    let fixture = Fixture::new();

    for app in IworkApp::ALL {
        let installed = app.bundle_path().is_dir();
        let found = IworkConverter::discover(app, fixture.storage()).unwrap();

        assert_eq!(
            found.is_some(),
            installed,
            "{} is {}installed, so discovery should {}find it",
            app.application_name(),
            if installed { "" } else { "not " },
            if installed { "" } else { "not " }
        );
    }
}
