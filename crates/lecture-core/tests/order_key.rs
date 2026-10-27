//! Contract tests for [`OrderKey`].
//!
//! The headline properties are the two that justify the design at all: that bytewise
//! string order equals logical order, and that repeatedly appending keeps keys short.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{CoreError, OrderKey};

/// Appends `count` keys to an initially empty list.
fn append_run(count: usize) -> Vec<OrderKey> {
    let mut keys: Vec<OrderKey> = Vec::with_capacity(count);
    for _ in 0..count {
        let next = OrderKey::between(keys.last(), None).unwrap();
        keys.push(next);
    }
    keys
}

fn assert_strictly_ascending(keys: &[OrderKey], context: &str) {
    for pair in keys.windows(2) {
        let [a, b] = pair else { continue };
        assert!(
            a < b,
            "{context}: `{}` must sort before `{}`",
            a.as_str(),
            b.as_str()
        );
    }
}

#[test]
fn first_key_is_stable() {
    assert_eq!(OrderKey::first().as_str(), "a0");
    assert_eq!(OrderKey::between(None, None).unwrap(), OrderKey::first());
}

#[test]
fn byte_order_matches_logical_order() {
    // The entire design rests on this: if it ever stops holding, every sort in the app
    // silently returns the wrong sequence.
    let keys = append_run(500);

    let mut sorted_as_strings: Vec<&str> = keys.iter().map(OrderKey::as_str).collect();
    sorted_as_strings.sort_unstable();

    let insertion_order: Vec<&str> = keys.iter().map(OrderKey::as_str).collect();

    assert_eq!(
        insertion_order, sorted_as_strings,
        "string sort must reproduce insertion order"
    );
}

#[test]
fn appending_keeps_keys_short() {
    // The reason for carrying an integer part at all. A purely fractional key would
    // grow about one character every six appends, so 1000 appends would mean keys of
    // roughly 170 characters written into every manifest.
    let keys = append_run(1000);

    assert_strictly_ascending(&keys, "1000 appends");

    let longest = keys.iter().map(|k| k.as_str().len()).max().unwrap();
    assert!(
        longest <= 4,
        "1000 sequential appends should stay compact, longest was {longest} chars"
    );
}

#[test]
fn prepending_keeps_keys_short() {
    let mut keys: Vec<OrderKey> = vec![OrderKey::first()];
    for _ in 0..1000 {
        let next = OrderKey::between(None, keys.first()).unwrap();
        keys.insert(0, next);
    }

    assert_strictly_ascending(&keys, "1000 prepends");

    let longest = keys.iter().map(|k| k.as_str().len()).max().unwrap();
    assert!(
        longest <= 5,
        "1000 sequential prepends should stay compact, longest was {longest} chars"
    );
}

#[test]
fn inserting_between_neighbours_never_touches_them() {
    // The property the whole scheme exists for: a new position is created without
    // rewriting either sibling, so one manifest is written rather than N.
    let keys = append_run(10);
    let third = keys.get(2).unwrap().clone();
    let fourth = keys.get(3).unwrap().clone();

    let inserted = OrderKey::between(Some(&third), Some(&fourth)).unwrap();

    assert!(third < inserted, "inserted key must follow its predecessor");
    assert!(inserted < fourth, "inserted key must precede its successor");
    assert_eq!(
        keys.get(2).unwrap(),
        &third,
        "predecessor must be unchanged"
    );
    assert_eq!(keys.get(3).unwrap(), &fourth, "successor must be unchanged");
}

#[test]
fn survives_repeated_insertion_into_the_same_gap() {
    // Pathological but real: dragging many lectures into the same slot one after
    // another. Keys must stay correctly ordered; they are expected to lengthen here,
    // because the interval genuinely halves each time.
    let start = OrderKey::first();
    let end = OrderKey::between(Some(&start), None).unwrap();

    let mut upper = end.clone();
    let mut produced = Vec::new();
    for round in 0..300 {
        let next = OrderKey::between(Some(&start), Some(&upper))
            .unwrap_or_else(|e| panic!("round {round} failed: {e}"));
        assert!(
            start < next,
            "round {round}: must stay above the lower bound"
        );
        assert!(
            next < upper,
            "round {round}: must stay below the upper bound"
        );
        produced.push(next.clone());
        upper = next;
    }

    let longest = produced.iter().map(|k| k.as_str().len()).max().unwrap();
    assert!(
        longest < 80,
        "300 insertions into one gap should grow logarithmically, longest was {longest}"
    );
}

#[test]
fn interleaved_inserts_stay_ordered() {
    // Builds a list by always splitting the widest-looking gap, then checks the whole
    // thing still sorts the way it was constructed.
    let mut keys = append_run(2);
    for _ in 0..200 {
        let midway = keys.len() / 2;
        let lower = keys.get(midway - 1).cloned();
        let upper = keys.get(midway).cloned();
        let next = OrderKey::between(lower.as_ref(), upper.as_ref()).unwrap();
        keys.insert(midway, next);
    }

    assert_strictly_ascending(&keys, "200 interleaved inserts");
}

#[test]
fn rejects_keys_that_are_not_well_formed() {
    let cases = [
        ("", "empty"),
        ("0", "head is a digit, not a letter"),
        ("!0", "head is punctuation"),
        ("a", "integer part truncated"),
        ("b0", "integer part too short for its head"),
        ("a00", "fraction ends in zero"),
        ("a0V0", "fraction ends in zero after digits"),
        ("a0!", "fraction contains a non-digit"),
        ("A00000000000000000000000000", "reserved lower sentinel"),
    ];

    for (raw, description) in cases {
        let parsed = OrderKey::parse(raw);
        assert!(
            parsed.is_err(),
            "`{raw}` ({description}) must be rejected, got {parsed:?}"
        );
    }
}

#[test]
fn accepts_keys_that_are_well_formed() {
    for raw in ["a0", "a1", "az", "Zz", "b00", "a0V", "a0V1"] {
        assert!(
            OrderKey::parse(raw).is_ok(),
            "`{raw}` should be a valid order key"
        );
    }
}

#[test]
fn head_letter_dictates_the_integer_part_length() {
    // `'z'` declares 26 digits after it, so a key may not simply stop early. Getting
    // this wrong is how a truncated manifest value would otherwise slip through as a
    // valid-looking key and then sort unpredictably.
    assert!(
        OrderKey::parse("zz").is_err(),
        "`zz` is a truncated 'z'-headed integer part, not a short valid key"
    );

    let widest: String = core::iter::once('z')
        .chain(core::iter::repeat_n('0', 26))
        .collect();
    assert_eq!(widest.len(), 27);
    assert!(
        OrderKey::parse(&widest).is_ok(),
        "`{widest}` is the widest non-negative integer part and must be accepted"
    );
}

#[test]
fn refuses_bounds_given_in_the_wrong_order() {
    let keys = append_run(3);
    let low = keys.first().unwrap();
    let high = keys.get(2).unwrap();

    let err = OrderKey::between(Some(high), Some(low)).unwrap_err();
    assert!(matches!(err, CoreError::OrderKeysNotAscending { .. }));
    assert_eq!(err.code(), "ERR_ORDER_KEYS_NOT_ASCENDING");
}

#[test]
fn refuses_identical_bounds() {
    let key = OrderKey::first();
    let err = OrderKey::between(Some(&key), Some(&key)).unwrap_err();

    assert!(matches!(err, CoreError::OrderKeysNotAscending { .. }));
}

#[test]
fn errors_carry_a_code_and_plain_language_remediation() {
    let err = OrderKey::parse("nonsense!").unwrap_err();

    assert_eq!(err.code(), "ERR_INVALID_ORDER_KEY");
    assert!(err.remediation().contains("Nothing was deleted"));
}

#[test]
fn survives_a_json_round_trip() {
    let key = OrderKey::between(Some(&OrderKey::first()), None).unwrap();

    let json = serde_json::to_string(&key).unwrap();
    let parsed: OrderKey = serde_json::from_str(&json).unwrap();

    assert_eq!(key, parsed);
}

#[test]
fn serializes_as_a_bare_string() {
    // manifest.json stores `"sequence": "a1"`, not a nested object.
    let json = serde_json::to_string(&OrderKey::first()).unwrap();
    assert_eq!(json, r#""a0""#);
}

#[test]
fn deserialization_cannot_bypass_validation() {
    // A hand-edited manifest must fail to load rather than produce a key that sorts
    // unpredictably against its siblings.
    for raw in [r#""""#, r#""a00""#, r#""0""#, r#""a0!""#] {
        let parsed = serde_json::from_str::<OrderKey>(raw);
        assert!(
            parsed.is_err(),
            "stored key {raw} must be rejected on read, got {parsed:?}"
        );
    }
}
