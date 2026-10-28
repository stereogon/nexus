//! What a PDF asks for that Nexus will not do.
//!
//! # These are indicators, not a verdict
//!
//! Nothing here decides a document is malicious, and no wording in it says so. A lecture
//! deck exported from `PowerPoint` routinely contains an action on open and a dozen external
//! links. What this does is tell the person what the file asks for, beside the fact that
//! Nexus does not grant it — which is information they can act on, where "this PDF may be
//! dangerous" is only alarming.
//!
//! The honest framing matters for a second reason: the viewer is already configured to
//! refuse every one of these (`isEvalSupported: false`, no `quickjs-eval.wasm`, no XFA, no
//! annotation layer, a `'self'` CSP). So each indicator comes with what Nexus does about
//! it, and in every case the answer is "nothing happens".
//!
//! # The limits, stated here because a security feature that overstates itself is worse
//! than none
//!
//! This is a **surface scan of the file's bytes**, not a parse:
//!
//! - **It can miss things.** A PDF may hold its objects in compressed object streams
//!   (`/ObjStm`), and indicators inside one are deflated bytes that no byte scan can see.
//!   A clean result therefore means "nothing found", never "nothing there".
//! - **It can over-report.** No structure is tracked, so a name appearing inside a content
//!   stream or a string counts the same as one in a catalogue entry.
//!
//! Both are accepted deliberately. The alternative is a full PDF parser in `lecture-core`,
//! which is a far larger attack surface than the thing it would be guarding — and the
//! actual defence is not this scan at all. The defence is that the viewer does not execute
//! JavaScript, does not launch programs and cannot reach the network. This scan exists so a
//! person is *told*, not so they are protected by it.

mod scan;

pub use scan::RiskScan;

/// How much notice an indicator deserves.
///
/// Two levels rather than five. The question a person is actually asking is "do I need to
/// look at this?", and a scale invites tuning a number instead of answering it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RiskSeverity {
    /// Worth reading before opening: the document asks for code or data movement.
    Notable,
    /// Worth knowing, and ordinary in lecture material.
    Informational,
}

impl RiskSeverity {
    /// The stable identifier, for a UI to branch on.
    #[must_use]
    pub const fn code(self) -> &'static str {
        match self {
            Self::Notable => "notable",
            Self::Informational => "informational",
        }
    }
}

/// One thing a document was found to ask for.
///
/// Ordered by severity, so a sorted list reads worst-first without the caller sorting on
/// anything it has to look up.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum DocumentRisk {
    /// `/JavaScript`, `/JS` — script carried inside the document.
    EmbeddedJavascript,
    /// `/Launch` — asks to start another program.
    LaunchesAProgram,
    /// `/OpenAction`, `/AA` — something set to happen on open or on an event.
    ActionOnOpen,
    /// `/GoToR`, `/SubmitForm`, `/ImportData` — sends or fetches data elsewhere.
    RemoteData,
    /// `/EmbeddedFile` — carries another file inside it.
    AttachedFile,
    /// `/XFA` — an XFA form, a separate document format inside the PDF.
    XfaForm,
    /// `/RichMedia`, `/Movie`, `/Sound`, `/Screen` — embedded media.
    EmbeddedMedia,
    /// `/URI` — a link to somewhere on the internet.
    ExternalLink,
    /// `/Encrypt` — the document is encrypted.
    Encrypted,
}

impl DocumentRisk {
    /// The stable identifier, safe to branch on in the UI.
    #[must_use]
    pub const fn code(self) -> &'static str {
        match self {
            Self::EmbeddedJavascript => "embeddedJavascript",
            Self::LaunchesAProgram => "launchesAProgram",
            Self::ActionOnOpen => "actionOnOpen",
            Self::RemoteData => "remoteData",
            Self::AttachedFile => "attachedFile",
            Self::XfaForm => "xfaForm",
            Self::EmbeddedMedia => "embeddedMedia",
            Self::ExternalLink => "externalLink",
            Self::Encrypted => "encrypted",
        }
    }

    /// How much notice it deserves.
    #[must_use]
    pub const fn severity(self) -> RiskSeverity {
        match self {
            Self::EmbeddedJavascript
            | Self::LaunchesAProgram
            | Self::ActionOnOpen
            | Self::RemoteData
            | Self::AttachedFile => RiskSeverity::Notable,
            Self::XfaForm | Self::EmbeddedMedia | Self::ExternalLink | Self::Encrypted => {
                RiskSeverity::Informational
            }
        }
    }

    /// What the document asks for, and what Nexus does about it.
    ///
    /// Two sentences, in that order, every time. The second is the one that matters: a
    /// person told only the first has been given a worry and no way to put it down.
    #[must_use]
    pub const fn explanation(self) -> &'static str {
        match self {
            Self::EmbeddedJavascript => {
                "This document carries JavaScript inside it. Nexus never runs a document's \
                 script, so it cannot do anything here."
            }
            Self::LaunchesAProgram => {
                "This document asks to start another program. Nexus never launches anything \
                 on a document's behalf."
            }
            Self::ActionOnOpen => {
                "This document has something set to happen when it is opened. Nexus ignores \
                 it and simply shows the pages."
            }
            Self::RemoteData => {
                "This document refers to data somewhere else, or offers to send some. Nexus \
                 is offline and cannot reach anything outside this machine."
            }
            Self::AttachedFile => {
                "This document carries another file inside it. Nexus does not open or extract \
                 attachments."
            }
            Self::XfaForm => {
                "This document uses an XFA form, which is a separate format inside the PDF. \
                 Nexus does not render XFA, so those parts will not appear."
            }
            Self::EmbeddedMedia => {
                "This document embeds audio, video or 3D content. Nexus does not play it, and \
                 the pages themselves are unaffected."
            }
            Self::ExternalLink => {
                "This document contains links to the internet. Nexus is offline and will not \
                 follow one. Common in lecture slides."
            }
            Self::Encrypted => {
                "This document is encrypted. Nexus cannot ask you for a password yet, so if \
                 this one needs a password its pages will not appear."
            }
        }
    }
}
