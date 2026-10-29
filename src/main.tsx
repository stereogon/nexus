/**
 * Mounts the application.
 *
 * The one `document.getElementById` in the project. It is checked rather than asserted
 * with `!`, which CLAUDE.md section 4 bans: a missing root means the HTML and this file
 * disagree, and a thrown message naming the element is far easier to act on than
 * `null is not an object`.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./ui/fonts.css";
import "./ui/styles/index.css";

const container = document.getElementById("root");

if (container === null) {
  throw new Error("Nexus could not start: index.html has no #root element to mount into.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
