//! Which theme the person chose.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::CoreError;

/// A theme choice.
///
/// `System` is a real choice and not the absence of one: it means "follow macOS", which is
/// different from having picked light and different again from never having picked. It is
/// stored like the other two so that someone who turns the override off gets the system
/// theme back on the next launch rather than whatever they last pinned.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    /// Follow the operating system.
    #[default]
    System,
    /// Stay light whatever the system is set to.
    Light,
    /// Stay dark whatever the system is set to.
    Dark,
}

impl Theme {
    /// The stored spelling, which is also what the UI sends.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }
}

impl fmt::Display for Theme {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.name())
    }
}

impl FromStr for Theme {
    type Err = CoreError;

    /// Parses a stored or sent name.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::UnknownTheme`] for anything else, so a hand-edited preference
    /// file is refused at the boundary rather than silently becoming a default.
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "system" => Ok(Self::System),
            "light" => Ok(Self::Light),
            "dark" => Ok(Self::Dark),
            _ => Err(CoreError::UnknownTheme {
                given: value.to_owned(),
            }),
        }
    }
}
