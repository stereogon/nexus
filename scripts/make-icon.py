#!/usr/bin/env python3
"""Draws the Nexus app icon at 1024x1024 as an RGBA PNG.

Committed rather than run once and forgotten, because the geometry below is the whole
point and is not guessable from looking at the result.

# Why the artwork does not fill the canvas

A macOS app icon is not a full-bleed square. Apple's grid insets the artwork inside a
rounded "squircle" and leaves the rest transparent, and every icon in the Dock is sized
against that convention. A 1024x1024 square of colour therefore renders *larger* than every
neighbour and with hard corners -- which is exactly the bug the first version of this icon
had. The numbers:

- canvas 1024, artwork 824 (so a 100px transparent margin on each side)
- corner shape a superellipse, |dx/a|^5 + |dy/a|^5 = 1, which is the continuous curve Apple
  uses rather than a circular-arc radius. A plain rounded rectangle reads subtly wrong next
  to real macOS icons; the squircle is why theirs look "softer" at the same radius.

# Why these colours and this mark

Both come from the project's design canvas rather than being invented: flat accent
`#BE1A72` (no gradient -- the system has none anywhere) with the mark in white. The brand in
that system is the wordmark "Nexus" set in Bricolage Grotesque 800, so its initial is the
faithful thing to put in an icon.

The letter here is drawn geometrically and is **not** Bricolage Grotesque, which is not
installed and cannot be fetched without network access. It approximates the weight and
proportions of that typeface's ExtraBold: heavy stems, flat terminals, a diagonal that meets
both stems fully. Recorded in PROGRESS.md as a known difference rather than passed off as
the real wordmark.

# Rendering

No image library is available, so this writes PNG chunks directly. Edges are antialiased by
computing exact horizontal coverage per scanline (the shapes are all describable as spans)
and supersampling vertically, which is sharper than the usual 3x3 point sampling and far
cheaper than it in pure Python.
"""

# `X | None` in an annotation needs Python 3.10+; this makes annotations lazy so the script
# runs on whatever interpreter is to hand rather than needing a particular one.
from __future__ import annotations

import struct
import zlib
from pathlib import Path

CANVAS = 1024
MARGIN = 100
SIDE = CANVAS - 2 * MARGIN
SQUIRCLE_EXPONENT = 5.0
VERTICAL_SUBSAMPLES = 4

ACCENT = (0xBE, 0x1A, 0x72)
MARK = (0xFF, 0xFF, 0xFF)

# The letter's bounding box and weights, in canvas pixels.
MARK_TOP, MARK_BOTTOM = 300.0, 724.0
STEM_WIDTH = 96.0
LEFT_STEM = (326.0, 326.0 + STEM_WIDTH)
RIGHT_STEM = (698.0 - STEM_WIDTH, 698.0)
DIAGONAL_HALF_WIDTH = 58.0


def squircle_span(y: float) -> tuple[float, float] | None:
    """The horizontal extent of the rounded square at height `y`, or None outside it."""
    half = SIDE / 2
    centre = CANVAS / 2
    offset = abs(y - centre)

    if offset >= half:
        return None

    remainder = 1.0 - (offset / half) ** SQUIRCLE_EXPONENT

    if remainder <= 0.0:
        return None

    reach = half * remainder ** (1.0 / SQUIRCLE_EXPONENT)

    return (centre - reach, centre + reach)


def mark_spans(y: float) -> list[tuple[float, float]]:
    """The horizontal extents of the letter N at height `y`."""
    if not MARK_TOP <= y < MARK_BOTTOM:
        return []

    # The diagonal is aligned to the letter's OUTER edges, not to the stem centres: at the
    # top its left edge meets the left stem's left edge, and at the bottom its right edge
    # meets the right stem's right edge. Centring it on the stems instead leaves a visible
    # wedge in each of those two corners -- which the first render had.
    travelled = (y - MARK_TOP) / (MARK_BOTTOM - MARK_TOP)
    start = LEFT_STEM[0] + DIAGONAL_HALF_WIDTH
    finish = RIGHT_STEM[1] - DIAGONAL_HALF_WIDTH
    centre = start + (finish - start) * travelled

    return [
        LEFT_STEM,
        RIGHT_STEM,
        (centre - DIAGONAL_HALF_WIDTH, centre + DIAGONAL_HALF_WIDTH),
    ]


def add_span(coverage: list[float], start: float, end: float, weight: float) -> None:
    """Accumulates `weight` of coverage over the pixels between `start` and `end`."""
    start = max(start, 0.0)
    end = min(end, float(CANVAS))

    if end <= start:
        return

    first, last = int(start), int(end)

    if first == last:
        coverage[first] += (end - start) * weight
        return

    coverage[first] += (first + 1 - start) * weight

    for x in range(first + 1, last):
        coverage[x] += weight

    if last < CANVAS:
        coverage[last] += (end - last) * weight


def merged(spans: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Unions overlapping spans, so the letter's strokes are not counted twice."""
    union: list[tuple[float, float]] = []

    for start, end in sorted(spans):
        if union and start <= union[-1][1]:
            previous_start, previous_end = union[-1]
            union[-1] = (previous_start, max(previous_end, end))
        else:
            union.append((start, end))

    return union


def chunk(kind: bytes, payload: bytes) -> bytes:
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


def render() -> bytes:
    weight = 1.0 / VERTICAL_SUBSAMPLES
    rows = bytearray()

    for y in range(CANVAS):
        background = [0.0] * CANVAS
        letter = [0.0] * CANVAS

        for sub in range(VERTICAL_SUBSAMPLES):
            sample = y + (sub + 0.5) * weight

            span = squircle_span(sample)
            if span is not None:
                add_span(background, span[0], span[1], weight)

            for start, end in merged(mark_spans(sample)):
                add_span(letter, start, end, weight)

        rows.append(0)  # filter type 0

        for x in range(CANVAS):
            alpha = min(background[x], 1.0)

            if alpha <= 0.0:
                rows.extend((0, 0, 0, 0))
                continue

            # The letter is painted over the accent, so its share is capped by how much of
            # this pixel the squircle actually covers.
            share = min(letter[x], alpha) / alpha
            colour = tuple(
                round(ACCENT[channel] * (1.0 - share) + MARK[channel] * share)
                for channel in range(3)
            )
            rows.extend((*colour, round(alpha * 255)))

    header = struct.pack(">IIBBBBB", CANVAS, CANVAS, 8, 6, 0, 0, 0)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    destination = Path(__file__).resolve().parent.parent / "crates/src-tauri/icons/icon.png"
    destination.write_bytes(render())
    print(f"wrote {destination} ({destination.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
