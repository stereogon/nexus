/**
 * The "Group by" control.
 *
 * Its own component because the list of groupings, the mapping from a `<select>` value back
 * to a `GroupBy`, and the markup pairing them are one concern — and because `App.tsx` had
 * reached the §4 line limit, which is the limit doing its job rather than getting in the
 * way: the shell had started accumulating controls that are not the shell's business.
 */
import type { GroupBy } from "./LectureList";

const GROUPINGS: readonly (readonly [GroupBy, string])[] = [
  ["none", "Nothing"],
  ["course", "Course"],
  ["module", "Module"],
  ["week", "Week"],
];

/**
 * The grouping a `<select>` value names.
 *
 * Matched against the list the options were drawn from rather than asserted with `as`: the
 * value is a string as far as the DOM is concerned, and claiming otherwise would be exactly
 * the unchecked cast §4 rules out.
 */
export function groupingFrom(value: string): GroupBy {
  return GROUPINGS.find(([name]) => name === value)?.[0] ?? "none";
}

export function GroupPicker({
  onChange,
  value,
}: {
  readonly onChange: (grouping: GroupBy) => void;
  readonly value: GroupBy;
}) {
  return (
    <label className="field inline">
      <span>Group by</span>
      <select
        onChange={(event) => {
          onChange(groupingFrom(event.target.value));
        }}
        value={value}
      >
        {GROUPINGS.map(([name, label]) => (
          <option key={name} value={name}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
