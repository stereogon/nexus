//! Which theme the person chose.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::CoreError;

/// A theme choice.
///
/// `System` is a real choice and not the absence of one: it means "follow macOS" between
/// Paper and Ink, which is different from having picked either and different again from
/// never having picked. It is stored like the others so that someone who turns the
/// override off gets the system theme back on the next launch.
///
/// The fifteen palettes themselves are the window's business (`src/ui/themes/`); this
/// crate knows only their names, so a hand-edited preference file is refused at the
/// boundary rather than reaching the window as something it cannot draw.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Theme {
    /// Follow the operating system: Paper in light mode, Ink in dark.
    #[default]
    System,
    /// Warm stone and mulberry: the light default.
    Paper,
    /// Warm charcoal: the dark default.
    Ink,
    /// Cool greys with a black accent.
    Plain,
    /// Neutral dark greys with a white accent.
    Graphite,
    /// Black on white, for the most contrast.
    Contrast,
    /// White on black, for the most contrast.
    ContrastDark,
    /// Midnight violet with a glowing magenta.
    Neon,
    /// Butter yellow and electric violet.
    Funky,
    /// Solarized cream and slate.
    Solar,
    /// Arctic slate blues.
    Fjord,
    /// Deep pine.
    Forest,
    /// Pale cherry blossom.
    Sakura,
    /// Navy and coral.
    Ocean,
    /// Phosphor green on black.
    Terminal,
    /// Old paper and brown ink.
    Sepia,
}

/// Every theme and its stored spelling, which is also what the UI sends. One table, so
/// the two directions cannot disagree.
const NAMES: [(Theme, &str); 16] = [
    (Theme::System, "system"),
    (Theme::Paper, "paper"),
    (Theme::Ink, "ink"),
    (Theme::Plain, "plain"),
    (Theme::Graphite, "graphite"),
    (Theme::Contrast, "contrast"),
    (Theme::ContrastDark, "contrast-dark"),
    (Theme::Neon, "neon"),
    (Theme::Funky, "funky"),
    (Theme::Solar, "solar"),
    (Theme::Fjord, "fjord"),
    (Theme::Forest, "forest"),
    (Theme::Sakura, "sakura"),
    (Theme::Ocean, "ocean"),
    (Theme::Terminal, "terminal"),
    (Theme::Sepia, "sepia"),
];

impl Theme {
    /// The stored spelling, which is also what the UI sends.
    #[must_use]
    pub fn name(self) -> &'static str {
        NAMES
            .iter()
            .find(|(theme, _)| *theme == self)
            .map_or("system", |(_, name)| name)
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
    /// `light` and `dark` are what builds before 2026-11-07 wrote, when those were the only
    /// two; they read as Paper and Ink, the same colours renamed, so nobody's choice is lost
    /// to the upgrade. Writing always uses the new names.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::UnknownTheme`] for anything else, so a hand-edited preference
    /// file is refused at the boundary rather than silently becoming a default.
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "light" => return Ok(Self::Paper),
            "dark" => return Ok(Self::Ink),
            _ => {}
        }

        NAMES
            .iter()
            .find(|(_, name)| *name == value)
            .map(|(theme, _)| *theme)
            .ok_or_else(|| CoreError::UnknownTheme {
                given: value.to_owned(),
            })
    }
}
