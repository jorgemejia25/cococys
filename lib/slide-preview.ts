/**
 * Utilities for reading slide metadata and preparing a loaded deck iframe.
 *
 * Metadata is fetched via the HTML text (parsed with DOMParser) so that
 * deck-stage's runtime rewrites to data-screen-label are never observed.
 */

export interface SlideInfo {
  index: number;
  /** 1-based padded number — "01", "02" … */
  label: string;
  /** Original authored data-screen-label before deck-stage overwrites it */
  title: string;
  /** Presenter script for this slide, from `#speaker-notes` JSON in the deck HTML */
  script: string;
}

/**
 * Fetches a presentation HTML file and extracts slide metadata from the
 * static markup — no JS execution, so deck-stage cannot overwrite the attrs.
 */
export async function fetchSlideMetadata(file: string): Promise<SlideInfo[]> {
  const res = await fetch(`/presentations/${encodeURIComponent(file)}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  const stage = doc.querySelector("deck-stage");
  if (!stage) return [];

  const sections = Array.from(stage.querySelectorAll(":scope > section"));
  const scripts = parseSpeakerNotes(doc, sections.length);

  return sections.map((section, index) => ({
    index,
    label: String(index + 1).padStart(2, "0"),
    title: section.getAttribute("data-screen-label") ?? `Diapositiva ${index + 1}`,
    script: scripts[index] ?? "",
  }));
}

/**
 * Reads per-slide presenter scripts from
 * `<script type="application/json" id="speaker-notes">` in the deck HTML.
 * Returns an empty string for slides without an entry.
 */
function parseSpeakerNotes(doc: Document, slideCount: number): string[] {
  const tag = doc.getElementById("speaker-notes");
  if (!tag) return Array.from({ length: slideCount }, () => "");

  try {
    const parsed: unknown = JSON.parse(tag.textContent ?? "[]");
    if (!Array.isArray(parsed)) return Array.from({ length: slideCount }, () => "");

    return Array.from({ length: slideCount }, (_, index) => {
      const entry = parsed[index];
      return typeof entry === "string" ? entry.trim() : "";
    });
  } catch {
    return Array.from({ length: slideCount }, () => "");
  }
}

/**
 * Hides the internal deck-stage thumbnail rail and nudges the stage to
 * re-fit so it occupies the full available width.
 */
export function prepareDeckForViewer(doc: Document): void {
  const stage = doc.querySelector("deck-stage");
  if (!stage) return;
  stage.setAttribute("no-rail", "");
  doc.defaultView?.dispatchEvent(new Event("resize"));
}
