// Draws the Nexus app icon at 1024x1024 as an RGBA PNG, from the mascot in
// `scripts/icon/mascot.png`.
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
// # The mascot, and what is done to it
//
// A hand-drawn paper creature, white lines on black, which the user made with an image
// generator and asked to have refined (2026-11-07), after a geometric bot drawn here looked
// "very mechanical". The source is kept as it came. This script:
//
//   - finds the drawing by its bright pixels, leaving out the bottom-right corner, where
//     the generator put its watermark;
//   - turns brightness into coverage, so the lines are pure white on a flat ground and the
//     source's grain is gone;
//   - thickens the lines by `thicken` source pixels, because the source's are a few pixels
//     wide and would break up at the 32px size;
//   - centres the drawing in the squircle at `figureShare` of the artwork's width.
//
// # Running it
//
//   swift scripts/make-icon.swift [thicken] [output]
//
// from the repository root. Needs the Xcode Command Line Tools (for `swift`). Then
// `npx tauri icon crates/src-tauri/icons/icon.png -o <a scratch folder>`, keeping only the
// macOS sizes.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let canvas = 1024
let margin = 100.0
let side = Double(canvas) - 2.0 * margin
let squircleExponent = 5.0

/// The flat ground, close to the source's own.
let ground = (red: 0x16, green: 0x16, blue: 0x15)

/// How much of the artwork's width the drawing spans.
let figureShare = 0.70

/// Where the watermark is: the source's bottom-right corner, from this pixel on.
let watermarkCorner = 820

/// Brightness, of 255, below which a pixel is ground, and above which it is line.
let groundBelow = 50.0
let lineAbove = 170.0

let arguments = CommandLine.arguments
let thicken = arguments.count > 1 ? Int(arguments[1]) ?? 3 : 3
let output = arguments.count > 2 ? arguments[2] : "crates/src-tauri/icons/icon.png"

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

// ---- The source, as brightness, row 0 at the top ------------------------------------

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)

guard
    let source = CGImageSourceCreateWithURL(root.appendingPathComponent("scripts/icon/mascot.png") as CFURL, nil),
    let picture = CGImageSourceCreateImageAtIndex(source, 0, nil)
else {
    fail("could not read scripts/icon/mascot.png")
}

let width = picture.width
let height = picture.height
var pixels = [UInt8](repeating: 0, count: width * height * 4)

guard
    let reader = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
else {
    fail("could not read the source's pixels")
}

reader.draw(picture, in: CGRect(x: 0, y: 0, width: width, height: height))

func brightness(_ x: Int, _ y: Int) -> Double {
    let at = (y * width + x) * 4

    return (Double(pixels[at]) + Double(pixels[at + 1]) + Double(pixels[at + 2])) / 3.0
}

// ---- Coverage: how much of each pixel is line ----------------------------------------

var coverage = [Double](repeating: 0, count: width * height)
var left = width, right = 0, top = height, bottom = 0

for y in 0..<height {
    for x in 0..<width where !(x >= watermarkCorner && y >= watermarkCorner) {
        let amount = min(1.0, max(0.0, (brightness(x, y) - groundBelow) / (lineAbove - groundBelow)))

        coverage[y * width + x] = amount

        if amount > 0.5 {
            left = min(left, x)
            right = max(right, x)
            top = min(top, y)
            bottom = max(bottom, y)
        }
    }
}

guard right > left, bottom > top else {
    fail("found no drawing in the source")
}

// Thicker lines: each pixel takes the most coverage within `thicken` of it.
var thick = coverage

if thicken > 0 {
    for y in max(0, top - thicken)...min(height - 1, bottom + thicken) {
        for x in max(0, left - thicken)...min(width - 1, right + thicken) {
            var most = 0.0

            for dy in -thicken...thicken {
                for dx in -thicken...thicken where dx * dx + dy * dy <= thicken * thicken {
                    let sx = x + dx
                    let sy = y + dy

                    if sx >= 0, sy >= 0, sx < width, sy < height {
                        most = max(most, coverage[sy * width + sx])
                    }
                }
            }

            thick[y * width + x] = most
        }
    }
}

// The drawing as a mask: white where there is line, cropped to the drawing and its room.
let pad = thicken + 4
let cropLeft = max(0, left - pad)
let cropTop = max(0, top - pad)
let cropWidth = min(width, right + pad + 1) - cropLeft
let cropHeight = min(height, bottom + pad + 1) - cropTop
var maskBytes = [UInt8](repeating: 0, count: cropWidth * cropHeight)

for y in 0..<cropHeight {
    for x in 0..<cropWidth {
        maskBytes[y * cropWidth + x] = UInt8((thick[(y + cropTop) * width + x + cropLeft] * 255.0).rounded())
    }
}

guard
    let provider = CGDataProvider(data: Data(maskBytes) as CFData),
    let mask = CGImage(
        width: cropWidth,
        height: cropHeight,
        bitsPerComponent: 8,
        bitsPerPixel: 8,
        bytesPerRow: cropWidth,
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
        provider: provider,
        decode: nil,
        shouldInterpolate: true,
        intent: .defaultIntent
    )
else {
    fail("could not make the drawing's mask")
}

// ---- The icon ------------------------------------------------------------------------

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
context.interpolationQuality = .high

let centre = Double(canvas) / 2.0
let squircleShape = squircle(centre: centre, reach: side / 2.0)

context.addPath(squircleShape)
context.setFillColor(
    CGColor(srgbRed: Double(ground.red) / 255.0, green: Double(ground.green) / 255.0, blue: Double(ground.blue) / 255.0, alpha: 1.0)
)
context.fillPath()

// The drawing, scaled to its share and centred on its own bounds. A grey mask's white is
// where the fill shows, which is the line.
let scale = side * figureShare / Double(max(cropWidth, cropHeight))
let drawnWidth = Double(cropWidth) * scale
let drawnHeight = Double(cropHeight) * scale
let place = CGRect(x: centre - drawnWidth / 2.0, y: centre - drawnHeight / 2.0, width: drawnWidth, height: drawnHeight)

context.saveGState()
context.addPath(squircleShape)
context.clip()
context.clip(to: place, mask: mask)
context.setFillColor(CGColor(srgbRed: 1.0, green: 1.0, blue: 1.0, alpha: 1.0))
context.fill(place)
context.restoreGState()

guard let image = context.makeImage() else {
    fail("could not produce an image from the drawing context")
}

let destination = output.hasPrefix("/") ? URL(fileURLWithPath: output) : root.appendingPathComponent(output)

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
