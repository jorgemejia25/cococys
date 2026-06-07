/**
 * Client-side deck export — captures slides from a loaded deck iframe and
 * downloads PDF or PPTX without opening windows or print/save dialogs.
 *
 * Strategy: clones go into a plain off-screen div in the *parent* document
 * (window.top). This avoids two separate problems:
 *
 * 1. A sandboxed iframe (allow-same-origin, no allow-scripts) blocks the
 *    internal iframes html2canvas creates for capture — causing failures.
 *
 * 2. Using the presentation iframe's own document exposes html2canvas's
 *    internal about:blank frames to extension injection (SafariAppExtensionPage).
 *
 * Moving the lab to the parent document keeps html2canvas happy and, when
 * combined with `foreignObjectRendering: true` on Safari, avoids the
 * document.write path that extension injectors interfere with.
 * Slide clones are sanitized (scripts + event handlers removed) before mounting.
 */

const LAB_ID = "deck-export-lab";
const MOUNT_CLASS = "deck-export-mount";
const FREEZE_STYLE_ID = "deck-export-freeze";
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const SLIDE_CAPTURE_TIMEOUT_MS = 45_000;

interface DeckStageElement extends HTMLElement {
  goTo?: (index: number) => void;
  index?: number;
}

interface ExportContext {
  doc: Document;
  stage: DeckStageElement;
  width: number;
  height: number;
}

interface CaptureLab {
  /** The document that owns the mount node (parent window's document). */
  hostDoc: Document;
  mount: HTMLDivElement;
  cleanup: () => void;
}

/**
 * Triggers a file download in the browser from a Blob.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Returns true when the runtime is Safari (including iOS WebKit).
 * On Safari, html2canvas must use foreignObjectRendering to avoid
 * the document.write path that extension injectors interfere with.
 */
function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua);
}

/**
 * Rejects when `promise` does not settle within `ms`.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tiempo agotado (${label}). Desactiva extensiones del navegador e intenta de nuevo.`)),
      ms
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(label)); });
  });
}

/**
 * Returns the top-level browsing context document. Slide capture runs there
 * so html2canvas can create its own iframes without hitting a sandbox boundary.
 */
function getHostDocument(sourceDoc: Document): Document {
  try {
    return sourceDoc.defaultView?.top?.document ?? sourceDoc;
  } catch {
    return sourceDoc;
  }
}

/**
 * Builds a safe export filename from the deck label or source file.
 */
export function buildExportFilename(label: string, file: string, extension: "pdf" | "pptx"): string {
  const base = label.trim() || file.replace(/\.html?$/i, "");
  const sanitized = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${sanitized || "presentacion"}.${extension}`;
}

/**
 * Returns slide sections that are not marked as skipped.
 */
function getExportableSlides(stage: HTMLElement): HTMLElement[] {
  return Array.from(stage.querySelectorAll(":scope > section")).filter(
    (s) => !s.hasAttribute("data-deck-skip")
  ) as HTMLElement[];
}

/**
 * Reads the authored design size from deck-stage attributes.
 */
function getDesignSize(stage: HTMLElement): { width: number; height: number } {
  const width = parseInt(stage.getAttribute("width") ?? String(DEFAULT_WIDTH), 10) || DEFAULT_WIDTH;
  const height = parseInt(stage.getAttribute("height") ?? String(DEFAULT_HEIGHT), 10) || DEFAULT_HEIGHT;
  return { width, height };
}

/**
 * Waits for fonts and a paint frame so captures match on-screen rendering.
 */
async function waitForRender(doc: Document): Promise<void> {
  if (doc.fonts) {
    await Promise.race([doc.fonts.ready, new Promise<void>((r) => setTimeout(r, 2000))]);
  }
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => setTimeout(r, 32));
}

/**
 * Snapshots the presentation's CSS and rewrites selectors so they apply to
 * the cloned mount container in the host document.
 */
function buildCaptureStyles(sourceDoc: Document, stage: HTMLElement): string {
  const raw = Array.from(sourceDoc.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n")
    .replace(/deck-stage\s*>/g, `.${MOUNT_CLASS} > `)
    .replace(/deck-stage\b/g, `.${MOUNT_CLASS}`);

  const vars = new Set(raw.match(/--[\w-]+/g) ?? []);
  const live = sourceDoc.defaultView?.getComputedStyle(stage);
  const varDecls: string[] = [];
  if (live) {
    vars.forEach((name) => {
      const value = live.getPropertyValue(name);
      if (value) varDecls.push(`${name}:${value.trim()}`);
    });
  }

  const hostVars = varDecls.length ? `.${MOUNT_CLASS}{${varDecls.join(";")}}` : "";
  return (
    hostVars +
    raw +
    `.${MOUNT_CLASS} > section{` +
    "visibility:visible!important;opacity:1!important;position:relative!important;" +
    "inset:auto!important;pointer-events:none!important;" +
    "}"
  );
}

/**
 * Injects animation-freeze styles into the host document so entrance
 * animations render at their end state during capture.
 */
function injectFreezeStyle(hostDoc: Document): void {
  if (hostDoc.getElementById(FREEZE_STYLE_ID)) return;
  const s = hostDoc.createElement("style");
  s.id = FREEZE_STYLE_ID;
  s.textContent =
    `.${MOUNT_CLASS} *,.${MOUNT_CLASS} *::before,.${MOUNT_CLASS} *::after{` +
    "animation-delay:-99s!important;animation-duration:.001s!important;" +
    "animation-iteration-count:1!important;animation-fill-mode:both!important;" +
    "animation-play-state:running!important;transition-duration:0s!important;}";
  hostDoc.head.appendChild(s);
}

/**
 * Copies font-related assets from the presentation document to the host so
 * cloned slides render with the correct typefaces.
 */
function copyFontAssets(sourceDoc: Document, hostDoc: Document): void {
  if (hostDoc.getElementById(`${LAB_ID}-fonts`)) return;

  const frag = hostDoc.createDocumentFragment();

  sourceDoc
    .querySelectorAll('link[rel="preconnect"], link[rel="stylesheet"]')
    .forEach((link) => {
      const clone = link.cloneNode(true) as HTMLLinkElement;
      frag.appendChild(clone);
    });

  // Inline @font-face rules extracted from the presentation stylesheets.
  const fontFaces = Array.from(sourceDoc.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).filter((r) => r instanceof CSSFontFaceRule);
      } catch {
        return [];
      }
    })
    .map((r) => r.cssText)
    .join("\n");

  if (fontFaces) {
    const s = hostDoc.createElement("style");
    s.id = `${LAB_ID}-fonts`;
    s.textContent = fontFaces;
    frag.appendChild(s);
  }

  hostDoc.head.appendChild(frag);
}

/**
 * Removes all executable content from a DOM subtree so html2canvas never
 * triggers script evaluation during capture.
 */
function sanitizeCloneForCapture(root: HTMLElement): void {
  root.querySelectorAll("script, noscript, template").forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
    }
  });
}

/**
 * Creates a plain off-screen div in the host (parent) document where slide
 * clones are rendered for capture. No sandbox — html2canvas is free to create
 * the internal iframes it needs.
 */
function createCaptureLab(
  sourceDoc: Document,
  stage: HTMLElement,
  width: number,
  height: number
): CaptureLab {
  const hostDoc = getHostDocument(sourceDoc);

  // Clean any leftover lab from a previous failed export.
  hostDoc.getElementById(LAB_ID)?.remove();
  hostDoc.getElementById(FREEZE_STYLE_ID)?.remove();

  copyFontAssets(sourceDoc, hostDoc);
  injectFreezeStyle(hostDoc);

  const container = hostDoc.createElement("div");
  container.id = LAB_ID;
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:fixed;left:-30000px;top:0;overflow:hidden;" +
    "pointer-events:none;visibility:hidden;z-index:-1;";

  const style = hostDoc.createElement("style");
  style.textContent = buildCaptureStyles(sourceDoc, stage);
  container.appendChild(style);

  const mount = hostDoc.createElement("div") as HTMLDivElement;
  mount.className = MOUNT_CLASS;
  mount.style.cssText =
    `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#0a0a0a;`;
  container.appendChild(mount);

  hostDoc.body.appendChild(container);

  return { hostDoc, mount, cleanup: () => container.remove() };
}

/**
 * Deep-clones a slide section and strips all executable and media content
 * so it is safe to mount in the capture lab.
 */
function cloneSlideForCapture(section: HTMLElement, width: number, height: number): HTMLElement {
  const clone = section.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.removeAttribute("data-deck-active");
  clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));

  clone.querySelectorAll("iframe, audio, object, embed").forEach((el) => {
    el.removeAttribute("src");
    el.removeAttribute("srcdoc");
    el.removeAttribute("data");
    el.innerHTML = "";
  });

  clone.querySelectorAll("video").forEach((el) => {
    if (!el.poster) { el.removeAttribute("src"); el.innerHTML = ""; return; }
    const img = section.ownerDocument.createElement("img");
    img.src = el.poster;
    img.alt = "";
    img.style.cssText = `${el.style.cssText};object-fit:cover;width:100%;height:100%;`;
    img.className = el.className;
    el.replaceWith(img);
  });

  sanitizeCloneForCapture(clone);

  clone.setAttribute("data-deck-active", "");
  clone.style.cssText =
    `position:relative;width:${width}px;height:${height}px;` +
    "box-sizing:border-box;overflow:hidden;visibility:visible;opacity:1;";

  return clone;
}

/**
 * Prepares the iframe document for slide capture.
 */
async function beginExport(doc: Document): Promise<ExportContext> {
  const stage = doc.querySelector("deck-stage") as DeckStageElement | null;
  if (!stage) throw new Error("No se encontró deck-stage en la presentación.");

  const slides = getExportableSlides(stage);
  if (slides.length === 0) throw new Error("La presentación no tiene diapositivas exportables.");

  const { width, height } = getDesignSize(stage);
  await waitForRender(doc);
  return { doc, stage, width, height };
}

/**
 * Removes all capture artifacts from the host document.
 */
function endExport(ctx: ExportContext): void {
  const hostDoc = getHostDocument(ctx.doc);
  hostDoc.getElementById(LAB_ID)?.remove();
  hostDoc.getElementById(FREEZE_STYLE_ID)?.remove();
}

/**
 * Captures every exportable slide as a JPEG data URL using off-screen clones.
 */
async function captureSlideImages(ctx: ExportContext): Promise<string[]> {
  const { default: html2canvas } = await import("html2canvas");
  const sections = getExportableSlides(ctx.stage);
  const lab = createCaptureLab(ctx.doc, ctx.stage, ctx.width, ctx.height);
  const useForeignObject = isSafari();
  const images: string[] = [];

  try {
    for (let i = 0; i < sections.length; i += 1) {
      const clone = cloneSlideForCapture(sections[i], ctx.width, ctx.height);
      lab.mount.replaceChildren(clone);
      await waitForRender(lab.hostDoc);

      const canvas = await withTimeout(
        html2canvas(clone, {
          width: ctx.width,
          height: ctx.height,
          scale: 1,
          useCORS: true,
          logging: false,
          backgroundColor: "#0a0a0a",
          scrollX: 0,
          scrollY: 0,
          foreignObjectRendering: useForeignObject,
          onclone: (_clonedDoc, element) => sanitizeCloneForCapture(element as HTMLElement),
        }),
        SLIDE_CAPTURE_TIMEOUT_MS,
        `diapositiva ${i + 1} / ${sections.length}`
      );

      images.push(canvas.toDataURL("image/jpeg", 0.92));
    }
  } finally {
    lab.cleanup();
  }

  return images;
}

/**
 * Exports the loaded deck iframe to a PDF file and triggers download.
 */
export async function exportDeckToPdf(doc: Document, filename: string): Promise<void> {
  const ctx = await beginExport(doc);
  try {
    const images = await captureSlideImages(ctx);
    const { jsPDF } = await import("jspdf");
    const orientation = ctx.width >= ctx.height ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "px", format: [ctx.width, ctx.height], hotfixes: ["px_scaling"] });
    images.forEach((img, idx) => {
      if (idx > 0) pdf.addPage([ctx.width, ctx.height], orientation);
      pdf.addImage(img, "JPEG", 0, 0, ctx.width, ctx.height, undefined, "FAST");
    });
    downloadBlob(pdf.output("blob"), filename);
  } finally {
    endExport(ctx);
  }
}

/**
 * Exports the loaded deck iframe to a PPTX file and triggers download.
 */
export async function exportDeckToPptx(doc: Document, filename: string): Promise<void> {
  const ctx = await beginExport(doc);
  try {
    const images = await captureSlideImages(ctx);
    const { default: PptxGenJS } = await import("pptxgenjs");
    const layoutWidth = 10;
    const layoutHeight = layoutWidth / (ctx.width / ctx.height);
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "DECK", width: layoutWidth, height: layoutHeight });
    pptx.layout = "DECK";
    images.forEach((img) => {
      pptx.addSlide().addImage({ data: img, x: 0, y: 0, w: "100%", h: "100%" });
    });
    const blob = (await pptx.write({ outputType: "blob" })) as Blob;
    downloadBlob(blob, filename);
  } finally {
    endExport(ctx);
  }
}
