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
// # Why a little bot on near-black
//
// Until 2026-11-07 this was the Bricolage "N" in white on flat brand pink. The user found
// the pink background unappealing and asked for a dark one with a doodle mascot, in the
// spirit of the friendly bots other apps use; of three original sketches they chose this
// one: a round cream face with wide eyes and a small smile, and an antenna with a yellow
// tip. Near-black rather than pure black, so the squircle still reads against a dark Dock.
// Drawn from plain shapes, so the script needs no font installed.
//
// # Running it
//
//   swift scripts/make-icon.swift
//
// from the repository root. Needs the Xcode Command Line Tools (for `swift`). Then
// `npx tauri icon crates/src-tauri/icons/icon.png -o crates/src-tauri/icons`, keeping only
// the macOS sizes.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let canvas = 1024
let margin = 100.0
let side = Double(canvas) - 2.0 * margin
let squircleExponent = 5.0

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("make-icon: \(message)\n".utf8))
    exit(1)
}

func colour(_ hex: UInt32) -> CGColor {
    CGColor(
        srgbRed: Double((hex >> 16) & 0xFF) / 255.0,
        green: Double((hex >> 8) & 0xFF) / 255.0,
        blue: Double(hex & 0xFF) / 255.0,
        alpha: 1.0
    )
}

let ground = colour(0x141317)
let face = colour(0xF7F4EE)
let glow = colour(0xFFC94D)

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

// Measured from the top, as the sketch was drawn: Core Graphics counts up from the bottom.
context.translateBy(x: 0, y: Double(canvas))
context.scaleBy(x: 1, y: -1)

let centre = Double(canvas) / 2.0

context.addPath(squircle(centre: centre, reach: side / 2.0))
context.setFillColor(ground)
context.fillPath()

// The antenna: a curved stalk rising from the head, and its glowing tip.
context.setStrokeColor(face)
context.setLineWidth(24)
context.setLineCap(.round)
context.move(to: CGPoint(x: 512, y: 330))
context.addQuadCurve(to: CGPoint(x: 560, y: 225), control: CGPoint(x: 500, y: 260))
context.strokePath()
context.setFillColor(glow)
context.fillEllipse(in: CGRect(x: 530, y: 180, width: 70, height: 70))

// The head: wider than tall, softly squared.
context.setFillColor(face)
context.addPath(
    CGPath(
        roundedRect: CGRect(x: 262, y: 320, width: 500, height: 430),
        cornerWidth: 215,
        cornerHeight: 200,
        transform: nil
    )
)
context.fillPath()

// The eyes, each with a highlight up and to the left, and the smile.
context.setFillColor(ground)
context.fillEllipse(in: CGRect(x: 380, y: 455, width: 78, height: 110))
context.fillEllipse(in: CGRect(x: 566, y: 455, width: 78, height: 110))
context.setFillColor(face)
context.fillEllipse(in: CGRect(x: 408, y: 472, width: 26, height: 26))
context.fillEllipse(in: CGRect(x: 594, y: 472, width: 26, height: 26))
context.setStrokeColor(ground)
context.setLineWidth(22)
context.move(to: CGPoint(x: 470, y: 630))
context.addQuadCurve(to: CGPoint(x: 554, y: 630), control: CGPoint(x: 512, y: 668))
context.strokePath()

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
