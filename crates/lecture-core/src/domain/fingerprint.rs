//! A stable, short, non-reversible reference to a value.
//!
//! Used in two places that both need to say *which* thing without saying *what* it is: a
//! folder name for this device's state, and a reference to a failure in the log.
//!
//! FNV-1a (64-bit). Not cryptographic, and does not need to be — nothing here defends
//! against someone constructing a collision, and the consequences of one are an
//! annoyance rather than a loss.
//!
//! It does need to be **stable across runs and builds**, which rules out
//! `std::collections::hash_map::DefaultHasher`: `std` explicitly does not guarantee its
//! output between versions, so a Rust upgrade would silently change every stored key.

/// The FNV-1a 64-bit offset basis.
const OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;

/// The FNV-1a 64-bit prime.
const PRIME: u64 = 0x0000_0100_0000_01b3;

/// A stable 64-bit fingerprint of `bytes`.
#[must_use]
pub fn fingerprint(bytes: &[u8]) -> u64 {
    let mut hash = OFFSET_BASIS;

    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }

    hash
}

/// A stable 16-character hex fingerprint of `bytes`.
#[must_use]
pub fn fingerprint_hex(bytes: &[u8]) -> String {
    format!("{:016x}", fingerprint(bytes))
}
