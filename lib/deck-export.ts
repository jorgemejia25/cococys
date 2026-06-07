/**
 * Client-side deck export — captures slides from a loaded deck iframe and
 * downloads PDF or PPTX without opening windows or print/save dialogs.
 *
 * Slides are cloned into a sandboxed off-screen iframe (parent document) so
 * html2canvas never re-executes deck scripts and Safari extension injections
 * in the presentation frame are less likely to break capture.
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
  sandboxDoc: Document;
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
 */
function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua);
}

/**
 * Rejects when `promise` does not settle within `ms`.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(message));
      });
  });
}

/**
 * Host document for the sandbox capture iframe (parent of the deck iframe).
 */
function getHostDocument(sourceDoc: Document): Document {
  return sourceDoc.defaultView?.parent?.document ?? sourceDoc;
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
    .replace(/deck-stage\s*>/g, `.${MOUNT_CLASS} > `)
    .replace(/deck-stage\b/g, `.${MOUNT_CLASS}`);

  const vars = new Set(raw.match(/--[\w-]+/g) ?? []);
  const live = doc.defaultView?.getComputedStyle(stage);
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
 * Removes executable content from a clone so mounting it cannot re-run scripts
 * (which would break html2canvas on Safari, especially with extensions active).
 */
function sanitizeCloneForCapture(root: HTMLElement): void {
  root.querySelectorAll("script, noscript, template").forEach((el) => el.remove());

  root.querySelectorAll("*").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
  });
}

/**
 * Copies stylesheet links and inline styles needed for faithful rendering.
 */
function copyDocumentAssets(sourceDoc: Document, targetDoc: Document): void {
  const base = targetDoc.createElement("base");
  base.href = sourceDoc.baseURI;
  targetDoc.head.appendChild(base);

  sourceDoc
    .querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]')
    .forEach((link) => {
      targetDoc.head.appendChild(link.cloneNode(true));
    });

  sourceDoc.querySelectorAll("style").forEach((style) => {
    targetDoc.head.appendChild(style.cloneNode(true));
  });
}

/**
 * Creates a sandboxed off-screen iframe where slide clones are rendered for capture.
 */
function createCaptureLab(sourceDoc: Document, stage: HTMLElement, width: number, height: number): CaptureLab {
  const hostDoc = getHostDocument(sourceDoc);
  hostDoc.getElementById(LAB_ID)?.remove();

  const iframe = hostDoc.createElement("iframe");
  iframe.id = LAB_ID;
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.sandbox = "allow-same-origin";
  iframe.style.cssText =
    "position:fixed;left:-30000px;top:0;width:0;height:0;border:0;" +
    "pointer-events:none;visibility:hidden;z-index:-1;";

  hostDoc.body.appendChild(iframe);

  const sandboxDoc = iframe.contentDocument;
  if (!sandboxDoc) {
    iframe.remove();
    throw new Error("No se pudo preparar el entorno de captura.");
  }

  copyDocumentAssets(sourceDoc, sandboxDoc);

  const style = sandboxDoc.createElement("style");
  style.textContent = buildCaptureStyles(sourceDoc, stage);
  sandboxDoc.head.appendChild(style);

  injectFreezeStyle(sandboxDoc);

  const mount = sandboxDoc.createElement("div");
  mount.className = MOUNT_CLASS;
  mount.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#0a0a0a;`;
  sandboxDoc.body.appendChild(mount);

  return {
    sandboxDoc,
    mount,
    cleanup: () => iframe.remove(),
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

  sanitizeCloneForCapture(clone);

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
    `.${MOUNT_CLASS} *,.${MOUNT_CLASS} *::before,.${MOUNT_CLASS} *::after{` +
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
  await waitForRender(doc);

  return { doc, stage, width, height };
}

/**
 * Restores documents after export completes or fails.
 */
function endExport(doc: Document): void {
  getHostDocument(doc).getElementById(LAB_ID)?.remove();
  doc.getElementById(FREEZE_STYLE_ID)?.remove();
}

/**
 * Captures every exportable slide as a JPEG data URL using off-screen clones.
 */
async function captureSlideImages(ctx: ExportContext): Promise<string[]> {
  const [{ default: html2canvas }] = await Promise.all([import("html2canvas")]);
  const sections = getExportableSlides(ctx.stage);
  const lab = createCaptureLab(ctx.doc, ctx.stage, ctx.width, ctx.height);
  const useForeignObject = isSafari();
  const images: string[] = [];

  try {
    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      const clone = cloneSlideForCapture(section, ctx.width, ctx.height);
      lab.mount.replaceChildren(clone);
      await waitForRender(lab.sandboxDoc);

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
          onclone: (_clonedDoc, element) => {
            sanitizeCloneForCapture(element as HTMLElement);
          },
        }),
        SLIDE_CAPTURE_TIMEOUT_MS,
        `Tiempo agotado capturando la diapositiva ${index + 1} de ${sections.length}.` +
          (useForeignObject
            ? ""
            : " Si usas Safari, prueba desactivar extensiones del navegador.")
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
