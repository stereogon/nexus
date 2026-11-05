//! Which pasted images are kept, judged by their bytes, and what they are called.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{ImageFormat, Timestamp, asset_file_name, fingerprint_hex};

const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13];

#[test]
fn the_four_formats_are_recognised_by_their_signatures() {
    assert_eq!(ImageFormat::sniff(PNG), Some(ImageFormat::Png));
    assert_eq!(
        ImageFormat::sniff(&[0xFF, 0xD8, 0xFF, 0xE0]),
        Some(ImageFormat::Jpeg)
    );
    assert_eq!(ImageFormat::sniff(b"GIF89a....."), Some(ImageFormat::Gif));
    assert_eq!(
        ImageFormat::sniff(b"RIFF\x10\0\0\0WEBPVP8 "),
        Some(ImageFormat::Webp)
    );
}

#[test]
fn an_svg_is_not_kept_however_it_is_named() {
    // An SVG is a document that can carry script. A picture in a note should be a picture.
    assert_eq!(
        ImageFormat::sniff(b"<svg xmlns=\"http://www.w3.org/2000/svg\"><script/></svg>"),
        None
    );
}

#[test]
fn other_files_and_fragments_are_not_kept() {
    assert_eq!(ImageFormat::sniff(b"%PDF-1.7"), None);
    assert_eq!(ImageFormat::sniff(b""), None);
    assert_eq!(
        ImageFormat::sniff(&[0x89, b'P', b'N']),
        None,
        "a truncated signature is not one"
    );
    assert_eq!(
        ImageFormat::sniff(b"RIFF\x10\0\0\0WAVEfmt "),
        None,
        "RIFF is not only WebP"
    );
}

#[test]
fn a_kept_image_is_named_for_when_and_what_it_is() {
    let at = Timestamp::parse("2026-11-05T10:15:30Z").unwrap();

    assert_eq!(
        asset_file_name(&at, PNG, ImageFormat::Png),
        format!("20261105-101530-{}.png", fingerprint_hex(PNG))
    );
}

#[test]
fn the_name_holds_no_character_a_file_system_might_refuse() {
    let at = Timestamp::parse("2026-11-05T10:15:30Z").unwrap();
    let name = asset_file_name(&at, PNG, ImageFormat::Jpeg);

    assert!(
        name.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.'),
        "{name}"
    );
    assert_eq!(
        std::path::Path::new(&name).extension(),
        Some("jpg".as_ref())
    );
}
