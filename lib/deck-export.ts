/**
 * Client-side deck export — captures slides from a loaded deck iframe and
 * downloads PDF or PPTX without opening windows or print/save dialogs.
 *
 * Slides are cloned into an off-screen capture lab so the live deck-stage
 * is never navigated and the user sees no slide cycling during export.
 */

const LAB_ID = "deck-export-lab";
const FREEZE_STYLE_ID = "deck-export-freeze";
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

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
    (section) => !section.hasAttribute("data-deck-skip")
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
    await Promise.race([
      doc.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => setTimeout(resolve, 32));
}

/**
 * Snapshots author CSS and rewrites selectors so cloned slides render
 * correctly inside the off-screen capture lab.
 */
function buildCaptureStyles(doc: Document, stage: HTMLElement): string {
  const raw = Array.from(doc.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n")
    .replace(/deck-stage\s*>/g, `#${LAB_ID} > .deck-export-mount > `)
    .replace(/deck-stage\b/g, `#${LAB_ID}`);

  const vars = new Set(raw.match(/--[\w-]+/g) ?? []);
  const live = doc.defaultView?.getComputedStyle(stage);
  const varDecls: string[] = [];

  if (live) {
    vars.forEach((name) => {
      const value = live.getPropertyValue(name);
      if (value) varDecls.push(`${name}:${value.trim()}`);
    });
  }

  const hostVars = varDecls.length ? `#${LAB_ID}{${varDecls.join(";")}}` : "";

  return (
    hostVars +
    raw +
    `#${LAB_ID} > .deck-export-mount > section{` +
    "visibility:visible!important;opacity:1!important;position:relative!important;" +
    "inset:auto!important;pointer-events:none!important;" +
    "}"
  );
}

/**
 * Creates a fixed off-screen lab where slide clones are rendered for capture.
 */
function createCaptureLab(doc: Document, stage: HTMLElement, width: number, height: number): CaptureLab {
  doc.getElementById(LAB_ID)?.remove();

  const container = doc.createElement("div");
  container.id = LAB_ID;
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:fixed;left:-30000px;top:0;overflow:hidden;" +
    "pointer-events:none;visibility:hidden;z-index:-1;";

  const style = doc.createElement("style");
  style.textContent = buildCaptureStyles(doc, stage);
  container.appendChild(style);

  const mount = doc.createElement("div");
  mount.className = "deck-export-mount";
  mount.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;`;
  container.appendChild(mount);

  doc.body.appendChild(container);

  return {
    mount,
    cleanup: () => container.remove(),
  };
}

/**
 * Deep-clones a slide section and prepares it for off-screen capture.
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
    if (!el.poster) {
      el.removeAttribute("src");
      el.innerHTML = "";
      return;
    }
    const img = section.ownerDocument.createElement("img");
    img.src = el.poster;
    img.alt = "";
    img.style.cssText = `${el.style.cssText};object-fit:cover;width:100%;height:100%;`;
    img.className = el.className;
    el.replaceWith(img);
  });

  clone.setAttribute("data-deck-active", "");
  clone.style.cssText =
    `position:relative;width:${width}px;height:${height}px;` +
    "box-sizing:border-box;overflow:hidden;visibility:visible;opacity:1;";

  return clone;
}

/**
 * Injects animation-freeze styles so entrance animations render at end state.
 */
function injectFreezeStyle(doc: Document): void {
  if (doc.getElementById(FREEZE_STYLE_ID)) return;

  const freezeStyle = doc.createElement("style");
  freezeStyle.id = FREEZE_STYLE_ID;
  freezeStyle.textContent =
    `#${LAB_ID} *,#${LAB_ID} *::before,#${LAB_ID} *::after{` +
    "animation-delay:-99s!important;animation-duration:.001s!important;" +
    "animation-iteration-count:1!important;animation-fill-mode:both!important;" +
    "animation-play-state:running!important;transition-duration:0s!important;}";
  doc.head.appendChild(freezeStyle);
}

/**
 * Prepares the iframe document for slide capture.
 */
async function beginExport(doc: Document): Promise<ExportContext> {
  const stage = doc.querySelector("deck-stage") as DeckStageElement | null;
  if (!stage) {
    throw new Error("No se encontró deck-stage en la presentación.");
  }

  const slides = getExportableSlides(stage);
  if (slides.length === 0) {
    throw new Error("La presentación no tiene diapositivas exportables.");
  }

  const { width, height } = getDesignSize(stage);
  injectFreezeStyle(doc);
  await waitForRender(doc);

  return { doc, stage, width, height };
}

/**
 * Restores the iframe document after export completes or fails.
 */
function endExport(doc: Document): void {
  doc.getElementById(LAB_ID)?.remove();
  doc.getElementById(FREEZE_STYLE_ID)?.remove();
}

/**
 * Captures every exportable slide as a JPEG data URL using off-screen clones.
 */
async function captureSlideImages(ctx: ExportContext): Promise<string[]> {
  const [{ default: html2canvas }] = await Promise.all([import("html2canvas")]);
  const sections = getExportableSlides(ctx.stage);
  const lab = createCaptureLab(ctx.doc, ctx.stage, ctx.width, ctx.height);
  const images: string[] = [];

  try {
    for (const section of sections) {
      const clone = cloneSlideForCapture(section, ctx.width, ctx.height);
      lab.mount.replaceChildren(clone);
      await waitForRender(ctx.doc);

      const canvas = await html2canvas(clone, {
        width: ctx.width,
        height: ctx.height,
        scale: 1,
        useCORS: true,
        logging: false,
        backgroundColor: null,
        scrollX: 0,
        scrollY: 0,
      });

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
    const pdf = new jsPDF({
      orientation,
      unit: "px",
      format: [ctx.width, ctx.height],
      hotfixes: ["px_scaling"],
    });

    images.forEach((image, index) => {
      if (index > 0) {
        pdf.addPage([ctx.width, ctx.height], orientation);
      }
      pdf.addImage(image, "JPEG", 0, 0, ctx.width, ctx.height, undefined, "FAST");
    });

    downloadBlob(pdf.output("blob"), filename);
  } finally {
    endExport(ctx.doc);
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
    const aspect = ctx.width / ctx.height;
    const layoutWidth = 10;
    const layoutHeight = layoutWidth / aspect;

    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "DECK", width: layoutWidth, height: layoutHeight });
    pptx.layout = "DECK";

    images.forEach((image) => {
      const slide = pptx.addSlide();
      slide.addImage({ data: image, x: 0, y: 0, w: "100%", h: "100%" });
    });

    const blob = (await pptx.write({ outputType: "blob" })) as Blob;
    downloadBlob(blob, filename);
  } finally {
    endExport(ctx.doc);
  }
}
