/**
 * Client-side deck export — captures slides from a loaded deck iframe and
 * downloads PDF or PPTX without opening windows or print/save dialogs.
 *
 * Slide clones are rendered in an off-screen div inside the presentation's
 * own iframe document, which is same-origin and isolated from the app layout.
 * On Safari with extensions (AdGuard, etc.) html2canvas may fail due to
 * document.write interference; a friendly error is shown in that case.
 */

const LAB_ID = "deck-export-lab";
const MOUNT_CLASS = "deck-export-mount";
const FREEZE_STYLE_ID = "deck-export-freeze";
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const SLIDE_CAPTURE_TIMEOUT_MS = 45_000;

interface DeckStageElement extends HTMLElement {
  goTo?: (index: number) => void;
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
 * On Safari, html2canvas should use foreignObjectRendering to avoid
 * the document.write path that extensions like AdGuard interfere with.
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
      () => reject(new Error(`Tiempo agotado (${label}).`)),
      ms
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(label)); });
  });
}

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

function getExportableSlides(stage: HTMLElement): HTMLElement[] {
  return Array.from(stage.querySelectorAll(":scope > section")).filter(
    (s) => !s.hasAttribute("data-deck-skip")
  ) as HTMLElement[];
}

function getDesignSize(stage: HTMLElement): { width: number; height: number } {
  const width = parseInt(stage.getAttribute("width") ?? String(DEFAULT_WIDTH), 10) || DEFAULT_WIDTH;
  const height = parseInt(stage.getAttribute("height") ?? String(DEFAULT_HEIGHT), 10) || DEFAULT_HEIGHT;
  return { width, height };
}

async function waitForRender(doc: Document): Promise<void> {
  if (doc.fonts) {
    await Promise.race([doc.fonts.ready, new Promise<void>((r) => setTimeout(r, 2000))]);
  }
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => setTimeout(r, 32));
}

/**
 * Snapshots the presentation CSS and rewrites selectors so they apply
 * to slide clones inside the capture mount container.
 */
function buildCaptureStyles(doc: Document, stage: HTMLElement): string {
  const raw = Array.from(doc.styleSheets)
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

function injectFreezeStyle(doc: Document): void {
  if (doc.getElementById(FREEZE_STYLE_ID)) return;
  const s = doc.createElement("style");
  s.id = FREEZE_STYLE_ID;
  s.textContent =
    `.${MOUNT_CLASS} *,.${MOUNT_CLASS} *::before,.${MOUNT_CLASS} *::after{` +
    "animation-delay:-99s!important;animation-duration:.001s!important;" +
    "animation-iteration-count:1!important;animation-fill-mode:both!important;" +
    "animation-play-state:running!important;transition-duration:0s!important;}";
  doc.head.appendChild(s);
}

/**
 * Removes all executable content from a DOM subtree so it is safe to mount
 * for html2canvas capture.
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
 * Creates an off-screen div inside the presentation's own iframe document.
 * Styles are scoped to the mount class so they cannot escape to the app layout.
 */
function createCaptureLab(
  doc: Document,
  stage: HTMLElement,
  width: number,
  height: number
): CaptureLab {
  doc.getElementById(LAB_ID)?.remove();
  doc.getElementById(FREEZE_STYLE_ID)?.remove();

  injectFreezeStyle(doc);

  const container = doc.createElement("div");
  container.id = LAB_ID;
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:fixed;left:-30000px;top:0;overflow:hidden;" +
    "pointer-events:none;visibility:hidden;z-index:-1;";

  const style = doc.createElement("style");
  style.textContent = buildCaptureStyles(doc, stage);
  container.appendChild(style);

  const mount = doc.createElement("div") as HTMLDivElement;
  mount.className = MOUNT_CLASS;
  mount.style.cssText =
    `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#0a0a0a;`;
  container.appendChild(mount);

  doc.body.appendChild(container);
  return { mount, cleanup: () => { container.remove(); doc.getElementById(FREEZE_STYLE_ID)?.remove(); } };
}

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

async function beginExport(doc: Document): Promise<ExportContext> {
  const stage = doc.querySelector("deck-stage") as DeckStageElement | null;
  if (!stage) throw new Error("No se encontró deck-stage en la presentación.");

  const slides = getExportableSlides(stage);
  if (slides.length === 0) throw new Error("La presentación no tiene diapositivas exportables.");

  const { width, height } = getDesignSize(stage);
  await waitForRender(doc);
  return { doc, stage, width, height };
}

function endExport(ctx: ExportContext): void {
  ctx.doc.getElementById(LAB_ID)?.remove();
  ctx.doc.getElementById(FREEZE_STYLE_ID)?.remove();
}

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
      await waitForRender(ctx.doc);

      let canvas;
      try {
        canvas = await withTimeout(
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
      } catch (err) {
        // Safari + extensions (AdGuard, 1Password, etc.) inject scripts via
        // document.write into html2canvas's internal iframes, producing a
        // SyntaxError that aborts capture. Surface a clear message instead.
        const isBrowserBlock =
          err instanceof SyntaxError ||
          (err instanceof Error && /SafariAppExtension|duplicate variable/i.test(err.message));

        if (isBrowserBlock) {
          throw new Error(
            "La exportación no está disponible en este navegador con las extensiones actuales. " +
              "Desactiva AdGuard u otras extensiones e intenta de nuevo, o usa Chrome."
          );
        }
        throw err;
      }

      images.push(canvas.toDataURL("image/jpeg", 0.92));
    }
  } finally {
    lab.cleanup();
  }

  return images;
}

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
