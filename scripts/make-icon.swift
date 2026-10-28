// Draws the Nexus app icon at 1024x1024 as an RGBA PNG.
//
// Committed rather than run once and forgotten, because the geometry below is the whole
// point and is not guessable from looking at the result.
//
// # Why the artwork does not fill the canvas
//
// A macOS app icon is not a full-bleed square. Apple's grid insets the artwork inside a
// rounded "squircle" and leaves the rest transparent, and every icon in the Dock is sized
// against that convention. A 1024x1024 square of colour therefore renders *larger* than
// every neighbour and with hard corners -- which is exactly the bug the first version of
// this icon had. The numbers:
//
//   - canvas 1024, artwork 824 (so a 100px transparent margin on each side)
//   - corners a superellipse, |dx/a|^5 + |dy/a|^5 = 1, which is the continuous curve Apple
//     uses rather than a circular-arc radius. A plain rounded rectangle reads subtly wrong
//     beside real macOS icons; the squircle is why theirs look softer at the same radius.
//
// # Why these colours and this letter
//
// Both come from the project's design canvas rather than being invented: flat accent
// #BE1A72 (no gradient -- the system has none anywhere) with the mark in white. The brand
// on that canvas is the wordmark "Nexus" set in Bricolage Grotesque 800, so its initial is
// the faithful thing to put in an icon.
//
// # Why Swift, and why CoreText
//
// This was first written in Python, which meant drawing the letter geometrically because
// no font library was available -- a decent approximation of Bricolage's ExtraBold, but
// not actually it. The user had the real variable font installed, so this now renders the
// genuine glyph: CoreText is the only thing on a stock machine that can rasterise a
// variable font at a chosen weight, and it needs no installed dependency. The weight axis
// is set explicitly to 800 rather than trusting a default instance.
//
// # Running it
//
//   swift scripts/make-icon.swift
//
// Needs the Xcode Command Line Tools (for `swift`) and Bricolage Grotesque installed.

import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

let canvas = 1024
let margin = 100.0
let side = Double(canvas) - 2.0 * margin
let squircleExponent = 5.0

// The letter's cap height in canvas pixels. Chosen so the mark sits comfortably inside the
// squircle with room on every side; measured from the rendered glyph rather than assumed
// from the font's metrics, because a variable font's reported cap height and its actual
// inked bounds are not the same number.
let capHeight = 424.0

let fontFile = "BricolageGrotesque-VariableFont_opsz,wdth,wght.ttf"
let weightAxis: UInt32 = 0x7767_6874  // 'wght'
let weight = 800.0

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("make-icon: \(message)\n".utf8))
    exit(1)
}

/// The rounded square, as a path sampled from the superellipse.
func squircle(centre: Double, reach: Double) -> CGPath {
    let path = CGMutablePath()
    let steps = 2048

    for step in 0...steps {
        let angle = Double(step) / Double(steps) * 2.0 * Double.pi
        let horizontal = cos(angle)
        let vertical = sin(angle)
        let x = centre + reach * copysign(pow(abs(horizontal), 2.0 / squircleExponent), horizontal)
        let y = centre + reach * copysign(pow(abs(vertical), 2.0 / squircleExponent), vertical)
        let point = CGPoint(x: x, y: y)

        if step == 0 {
            path.move(to: point)
        } else {
            path.addLine(to: point)
        }
    }

    path.closeSubpath()

    return path
}

/// Bricolage Grotesque at the given size, with its weight axis pinned.
func bricolage(size: Double) -> CTFont {
    let url = URL(fileURLWithPath: (("~/Library/Fonts" as NSString).expandingTildeInPath))
        .appendingPathComponent(fontFile)

    guard FileManager.default.fileExists(atPath: url.path) else {
        fail("Bricolage Grotesque is not installed at \(url.path)")
    }

    guard
        let found = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
        let base = found.first
    else {
        fail("could not read a font descriptor from \(url.lastPathComponent)")
    }

    let variation = [NSNumber(value: weightAxis): NSNumber(value: weight)]
    let pinned = CTFontDescriptorCreateCopyWithAttributes(
        base,
        [kCTFontVariationAttribute: variation] as CFDictionary
    )

    return CTFontCreateWithFontDescriptor(pinned, size, nil)
}

/// The inked bounds of one character in `font`, and the glyph itself.
func inked(_ character: UniChar, in font: CTFont) -> (CGGlyph, CGRect) {
    var source = character
    var glyph = CGGlyph()

    guard CTFontGetGlyphsForCharacters(font, &source, &glyph, 1) else {
        fail("the font has no glyph for the requested character")
    }

    let bounds = CTFontGetBoundingRectsForGlyphs(font, .default, &glyph, nil, 1)

    return (glyph, bounds)
}

guard
    let space = CGColorSpace(name: CGColorSpace.sRGB),
    let context = CGContext(
        data: nil,
        width: canvas,
        height: canvas,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
else {
    fail("could not create the drawing context")
}

context.setShouldAntialias(true)
context.setAllowsAntialiasing(true)

let centre = Double(canvas) / 2.0

context.addPath(squircle(centre: centre, reach: side / 2.0))
context.setFillColor(
    CGColor(srgbRed: 0xBE / 255.0, green: 0x1A / 255.0, blue: 0x72 / 255.0, alpha: 1.0)
)
context.fillPath()

// Size the letter by measuring it: render at a reference size, see how tall the ink
// actually is, then scale so that height is exactly `capHeight`.
let reference = 1000.0
let (_, referenceBounds) = inked(UniChar(UnicodeScalar("N").value), in: bricolage(size: reference))

guard referenceBounds.height > 0 else {
    fail("the glyph measured as having no height")
}

let font = bricolage(size: reference * capHeight / Double(referenceBounds.height))
var (glyph, bounds) = inked(UniChar(UnicodeScalar("N").value), in: font)

// `position` is the glyph's origin, and `bounds` is relative to it, so placing the origin
// at the canvas centre minus the bounds' own centre puts the ink itself in the middle.
var position = CGPoint(x: centre - bounds.midX, y: centre - bounds.midY)

context.setFillColor(CGColor(srgbRed: 1.0, green: 1.0, blue: 1.0, alpha: 1.0))
CTFontDrawGlyphs(font, &glyph, &position, 1, context)

guard let image = context.makeImage() else {
    fail("could not produce an image from the drawing context")
}

let destination = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    .appendingPathComponent("crates/src-tauri/icons/icon.png")

guard
    let sink = CGImageDestinationCreateWithURL(
        destination as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    )
else {
    fail("could not open \(destination.path) for writing")
}

CGImageDestinationAddImage(sink, image, nil)

guard CGImageDestinationFinalize(sink) else {
    fail("could not write \(destination.path)")
}

print("wrote \(destination.path)")
