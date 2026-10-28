//! The `file://` URL the isolated profile is passed as.
//!
//! Its own file because it is the one argument whose *encoding* matters rather than its
//! text, and because it shipped broken: the app's profile base is
//! `~/Library/Application Support/Nexus/...`, the space made the URL malformed, and
//! `soffice` responded by throwing inside `Desktop::Init` and aborting. macOS showed the
//! person "soffice quit unexpectedly"; the app showed "it could not be converted".
//!
//! `tests/libreoffice.rs` asserts the whole argument list against a path with nothing to
//! encode, which is what let this through. These are the awkward paths.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::Path;

use lecture_convert::libreoffice::command_arguments;

/// The `-env:UserInstallation` argument, which is always the first one.
fn profile_url(profile: &str) -> String {
    let arguments = command_arguments(
        Path::new(profile),
        Path::new("/vault/raft/source"),
        Path::new("/vault/raft/source/original.pptx"),
    );

    arguments
        .first()
        .expect("the profile argument comes first")
        .to_string_lossy()
        .into_owned()
}

#[test]
fn a_space_in_the_profile_path_is_encoded_rather_than_passed_through() {
    // The exact path the app uses. A raw space here is the crash.
    let url = profile_url("/Users/someone/Library/Application Support/Nexus/profiles/lo-1");

    assert_eq!(
        url,
        "-env:UserInstallation=file:///Users/someone/Library/Application%20Support/Nexus/profiles/lo-1"
    );
    assert!(
        !url.contains(' '),
        "a space makes the URL malformed and soffice aborts: {url}"
    );
}

#[test]
fn the_separators_stay_separators() {
    // Encoding `/` as well would be safe for a path and useless as a URL -- soffice would
    // read one long filename. The encoder has to leave exactly this alone.
    assert_eq!(
        profile_url("/profiles/libreoffice-1"),
        "-env:UserInstallation=file:///profiles/libreoffice-1"
    );
}

#[test]
fn the_characters_a_url_reads_as_syntax_are_encoded() {
    // A profile path is built from a directory the app owns, so these are unlikely -- but
    // `#` truncates a URL at the fragment and `?` at the query, which would silently point
    // soffice at a *different* directory rather than failing. Unlikely and silent is worse
    // than unlikely and loud.
    let url = profile_url("/p/a#b?c&d e/x");

    assert!(url.ends_with("/p/a%23b%3Fc%26d%20e/x"), "{url}");
}

#[test]
fn an_accented_directory_name_survives_as_its_utf_8_bytes() {
    // Someone's home directory may be `/Users/josé`. Percent-encoding is defined over
    // bytes, so this is two escapes for one character, which is correct.
    assert!(
        profile_url("/Users/josé/p").ends_with("/Users/jos%C3%A9/p"),
        "{}",
        profile_url("/Users/josé/p")
    );
}
