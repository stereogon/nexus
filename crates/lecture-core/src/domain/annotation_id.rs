//! The stable identity of an annotation.
//!
//! An annotation's id is quoted in `notes.md` as `cite://<id>`, which makes it the one
//! value in a bundle that a person's prose depends on. Two consequences follow.
//!
//! It must be safe inside a URL, because that is literally where it is written.
//!
//! And it must be **opaque**. The spec's example is `hl-9f8a7b6c`, where `hl-` hints at
//! "highlight" — but encoding the kind into the id means converting a highlight into a
//! text box would change its id and silently break every citation pointing at it. So the
//! prefix is allowed and ignored: an id is a name, not a description.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// The longest an id may be, in bytes.
const MAX_BYTES: usize = 64;

/// An annotation's identity, as referenced by `cite://<id>`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct AnnotationId(String);

impl TryFrom<String> for AnnotationId {
    type Error = CoreError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl From<AnnotationId> for String {
    fn from(id: AnnotationId) -> Self {
        id.0
    }
}

impl fmt::Display for AnnotationId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl AnnotationId {
    /// Validates an id.
    ///
    /// Accepts ASCII letters, digits, `-` and `_` only. That set needs no escaping in a
    /// URL, so `cite://<id>` means the same thing however it is parsed — by this app, by
    /// a Markdown renderer, or by someone reading the raw file.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if the id is empty, longer than 64 bytes, or
    /// contains a character that would need escaping in a citation link.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        let reject = |reason: &'static str| {
            Err(CoreError::InvalidName {
                name: raw.to_owned(),
                reason,
            })
        };

        if raw.is_empty() {
            return reject("an annotation needs an identifier to be cited by");
        }
        if raw.len() > MAX_BYTES {
            return reject("is too long to be an annotation identifier");
        }
        if !raw
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return reject("may only contain letters, digits, hyphens and underscores");
        }

        Ok(Self(raw.to_owned()))
    }

    /// The id as written in `cite://<id>`.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
