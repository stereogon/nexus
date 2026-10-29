/**
 * Serves pdf.js's runtime asset directories from one same-origin path.
 *
 * # Why a plugin and not `public/`
 *
 * pdf.js fetches four directories lazily, at the moment a document needs them: `cmaps`
 * (CJK encodings), `standard_fonts` (the fourteen standard faces, for documents that embed
 * none), `iccs` (colour profiles) and `wasm` (the `jbig2` and `openjpeg` image codecs —
 * `jbig2` being what scanned pages use). Under `default-src 'self'` an outside fetch fails
 * closed, which is the right failure but reaches the person as a lecture missing its fonts
 * or a scanned page rendering blank. So they ship inside the bundle.
 *
 * Copying four megabytes into `public/` would commit vendored binaries to the repository
 * and leave them to drift from the installed version. This serves them from
 * `node_modules` in dev and copies them at build, so the installed package is the single
 * source and `/pdfjs/...` is one path that resolves identically in both — no second code
 * path for the engine to be configured against.
 *
 * # One file is deliberately withheld
 *
 * `quickjs-eval.wasm` is what executes a PDF's own JavaScript. Nexus never does, so it is
 * not shipped and not served: with `isEvalSupported: false` pdf.js never asks for it, and
 * a file that cannot be fetched cannot be fetched by a bug either.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Plugin } from "vite";

import {
  ASSET_PREFIX,
  BUNDLED_DIRECTORIES,
  WITHHELD_PREFIXES,
} from "../src/pdf/assets";

const TYPES: Readonly<Record<string, string>> = {
  ".wasm": "application/wasm",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".icc": "application/vnd.iccprofile",
};

/** Whether a file is one Nexus refuses to ship. See `WITHHELD_PREFIXES`. */
function isWithheld(basename: string): boolean {
  return WITHHELD_PREFIXES.some((prefix) => basename.startsWith(prefix));
}

export function pdfjsAssets(): Plugin {
  let packageRoot = "";
  let outDir = "";

  return {
    name: "nexus:pdfjs-assets",

    configResolved(config) {
      // Resolved through Node's own resolution from the project root, rather than
      // assuming `<root>/node_modules/pdfjs-dist`, so a hoisted or linked install still
      // finds it. `createRequire` takes a path rather than `import.meta.url`, because a
      // Vite config may be loaded as either ESM or CJS and only one of those has it.
      const requireFrom = createRequire(path.join(config.root, "vite.config.ts"));

      packageRoot = path.dirname(requireFrom.resolve("pdfjs-dist/package.json"));
      outDir = path.resolve(config.root, config.build.outDir);
    },

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? "";

        if (!url.startsWith(ASSET_PREFIX)) {
          next();

          return;
        }

        // `path.normalize` collapses any `..` before the containment check, so a crafted
        // dev URL cannot walk out of the package. Dev-only, and still worth doing: the
        // habit of checking is what makes the production copy below obviously safe.
        const wanted = path.normalize(
          path.join(packageRoot, decodeURIComponent(url.slice(ASSET_PREFIX.length))),
        );
        const allowed =
          wanted.startsWith(`${packageRoot}${path.sep}`) &&
          BUNDLED_DIRECTORIES.some((directory) =>
            wanted.startsWith(path.join(packageRoot, directory) + path.sep),
          ) &&
          !isWithheld(path.basename(wanted));

        if (!allowed || !fs.existsSync(wanted)) {
          response.statusCode = 404;
          response.end();

          return;
        }

        response.setHeader(
          "Content-Type",
          TYPES[path.extname(wanted)] ?? "application/octet-stream",
        );
        response.end(fs.readFileSync(wanted));
      });
    },

    writeBundle() {
      for (const directory of BUNDLED_DIRECTORIES) {
        fs.cpSync(
          path.join(packageRoot, directory),
          path.join(outDir, "pdfjs", directory),
          { recursive: true },
        );
      }

      // Swept by name after copying, rather than a list of exact files to delete: that
      // is what lets a prefix cover both `quickjs-eval.wasm` and the `quickjs-eval.js`
      // fallback beside it, and anything else the package adds under that name later.
      const wasm = path.join(outDir, "pdfjs", "wasm");

      for (const entry of fs.readdirSync(wasm)) {
        if (isWithheld(entry)) {
          fs.rmSync(path.join(wasm, entry), { force: true });
        }
      }
    },
  };
}
