"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SlideNavigator } from "@/components/slide-sidebar";
import { RemoteHostControls } from "@/components/remote-host-controls";
import { useDeckController } from "@/hooks/use-deck-controller";
import { buildExportFilename, exportDeckToPdf, exportDeckToPptx } from "@/lib/deck-export";
import { getCourseById } from "@/lib/presentations";
import { fetchSlideMetadata, prepareDeckForViewer, type SlideInfo } from "@/lib/slide-preview";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Expand,
  ExternalLink,
  FileText,
  Maximize2,
  Minimize2,
  MonitorPlay,
} from "lucide-react";

interface SlideChangeDetail {
  index: number;
  total: number;
  reason: string;
}

/**
 * PresentationViewer — reads `?course=<id>&deck=<index>` from the URL,
 * loads the corresponding HTML presentation into an iframe, and shows a
 * slide navigator in the sidebar.
 */
export function PresentationViewer() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const courseId = searchParams.get("course") ?? "";
  const deckIndex = parseInt(searchParams.get("deck") ?? "0", 10);

  const course = getCourseById(courseId);
  const deck = course?.decks[deckIndex] ?? null;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isExportingRef = useRef(false);
  const [slides, setSlides] = useState<SlideInfo[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideTotal, setSlideTotal] = useState(deck?.slides ?? 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "pptx" | null>(null);

  const controller = useDeckController(iframeRef);

  const goToSlide = useCallback(
    (index: number) => {
      controller.goTo(index);
    },
    [controller]
  );

  /** Load the deck into the iframe on mount */
  useEffect(() => {
    if (!deck) return;

    void fetchSlideMetadata(deck.file).then(setSlides);

    const iframe = iframeRef.current;
    if (!iframe) return;

    iframe.src = `/presentations/${encodeURIComponent(deck.file)}`;

    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        prepareDeckForViewer(doc);
        const stage = doc.querySelector("deck-stage");
        if (!stage) return;
        stage.addEventListener("slidechange", (e: Event) => {
          if (isExportingRef.current) return;
          const detail = (e as CustomEvent<SlideChangeDetail>).detail;
          setSlideIndex(detail.index);
          setSlideTotal(detail.total);
        });
      } catch {
        // same-origin access failed — silently ignore
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.file]);

  /** Fullscreen */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const target = iframeRef.current ?? document.documentElement;
      target.requestFullscreen?.().catch(() =>
        document.documentElement.requestFullscreen?.().catch(() => {})
      );
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /** Keyboard navigation */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft") goToSlide(slideIndex - 1);
      if (e.key === "ArrowRight") goToSlide(slideIndex + 1);
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [goToSlide, slideIndex, toggleFullscreen]);

  /** Exports the loaded deck to PDF or PPTX and downloads immediately. */
  const runExport = useCallback(
    async (format: "pdf" | "pptx") => {
      if (!deck || exportingFormat) return;

      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;

      isExportingRef.current = true;
      setExportingFormat(format);
      try {
        const filename = buildExportFilename(deck.label, deck.file, format);
        if (format === "pdf") {
          await exportDeckToPdf(doc, filename);
        } else {
          await exportDeckToPptx(doc, filename);
        }
      } catch (error) {
        console.error(`Error al exportar ${format.toUpperCase()}:`, error);
      } finally {
        isExportingRef.current = false;
        setExportingFormat(null);
      }
    },
    [deck, exportingFormat]
  );

  const handlePdf = useCallback(() => {
    void runExport("pdf");
  }, [runExport]);

  const handlePptx = useCallback(() => {
    void runExport("pptx");
  }, [runExport]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const counterText = slideTotal ? `${pad(slideIndex + 1)} / ${pad(slideTotal)}` : "— / —";

  if (!course || !deck) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-background">
        <p className="font-mono text-[11px] tracking-widest uppercase text-muted-foreground">
          Presentación no encontrada
        </p>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase text-brand hover:underline"
        >
          <ChevronLeft className="size-3" />
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="h-[54px] flex items-center justify-between border-b border-border bg-card shrink-0 gap-3 pr-4">
        {/* Left: aligns with sidebar width */}
        <div className="flex items-center h-full border-r border-border w-[272px] shrink-0">
          <button
            onClick={() => router.push(`/curso/${courseId}`)}
            className="flex items-center gap-2.5 h-full px-5 bg-transparent
                       text-muted-foreground font-mono text-[11px] tracking-widest uppercase
                       transition-colors hover:text-brand focus-visible:outline-none"
          >
            <ChevronLeft className="size-3.5 shrink-0" />
            Presentaciones
          </button>
        </div>

        {/* Center */}
        <div className="flex-1 flex items-center gap-4 px-4 min-w-0">
          <span className="font-mono text-[12px] tracking-[0.07em] uppercase text-foreground/60 truncate">
            {deck.label}
          </span>
          <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground border border-border px-2.5 py-0.5 whitespace-nowrap shrink-0">
            {course.tag}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground whitespace-nowrap">
            {counterText}
          </span>

          <Divider />

          <NavButton onClick={() => goToSlide(slideIndex - 1)} aria-label="Anterior">
            <ArrowLeft className="size-[14px]" />
          </NavButton>
          <NavButton onClick={() => goToSlide(slideIndex + 1)} aria-label="Siguiente">
            <ArrowRight className="size-[14px]" />
          </NavButton>

          <Divider />

          <Tooltip>
            <TooltipTrigger render={
              <IconButton onClick={handlePdf} disabled={!!exportingFormat}>
                <FileText className="size-[11px]" />
                PDF
              </IconButton>
            } />
            <TooltipContent side="bottom">Exportar a PDF</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger render={
              <IconButton onClick={handlePptx} disabled={!!exportingFormat}>
                <MonitorPlay className="size-[11px]" />
                PPTX
              </IconButton>
            } />
            <TooltipContent side="bottom">Exportar a PPTX</TooltipContent>
          </Tooltip>

          <Divider />

          <Tooltip>
            <TooltipTrigger render={
              <NavButton
                onClick={() => window.open(`/presentations/${encodeURIComponent(deck.file)}`, "_blank")}
                aria-label="Abrir en nueva pestaña"
              >
                <ExternalLink className="size-[11px]" />
              </NavButton>
            } />
            <TooltipContent side="bottom">Nueva pestaña</TooltipContent>
          </Tooltip>

          <RemoteHostControls
            controller={controller}
            slideIndex={slideIndex}
            slideTotal={slideTotal}
            slides={slides}
            deckLabel={deck.label}
            courseTag={course.tag}
          />

          <Tooltip>
            <TooltipTrigger render={
              <IconButton
                onClick={toggleFullscreen}
                className="border-brand text-brand hover:bg-brand/6"
              >
                {isFullscreen
                  ? <Minimize2 className="size-[11px]" />
                  : <Maximize2 className="size-[11px]" />}
                {isFullscreen ? "Salir" : "Fullscreen"}
              </IconButton>
            } />
            <TooltipContent side="bottom">
              {isFullscreen ? "Salir de pantalla completa" : "Pantalla completa (F)"}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <SlideNavigator
          deck={deck}
          slides={slides}
          activeIndex={slideIndex}
          onSelect={goToSlide}
        />

        <main className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          {slides.length === 0 && <LoadingState />}
          <iframe
            ref={iframeRef}
            className={cn(
              "w-full h-full border-none block",
              exportingFormat && "invisible"
            )}
            allow="fullscreen"
            allowFullScreen
            title={deck.label}
          />

          {exportingFormat && (
            <ExportOverlay format={exportingFormat} slideCount={slides.length || deck.slides} />
          )}
        </main>
      </div>

    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 opacity-20 pointer-events-none">
      <Expand className="size-10 text-foreground" strokeWidth={1} />
      <p className="font-mono text-[11px] tracking-widest uppercase text-muted-foreground">
        Cargando…
      </p>
    </div>
  );
}

interface ExportOverlayProps {
  format: "pdf" | "pptx";
  slideCount: number;
}

/**
 * Full-screen export overlay with fade-in, glow pulse, orbit spinner,
 * shimmer progress bar, and staggered loading dots.
 */
function ExportOverlay({ format, slideCount }: ExportOverlayProps) {
  const label = format === "pdf" ? "PDF" : "PPTX";

  return (
    <div
      className="export-overlay-enter absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/95"
      role="status"
      aria-live="polite"
      aria-label={`Exportando ${label}`}
    >
      {/* Ambient grid */}
      <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />

      {/* Subtle scanline */}
      <div className="export-scanline absolute inset-x-0 h-32 pointer-events-none" />

      {/* Center panel */}
      <div className="export-panel-enter relative flex flex-col items-center gap-7 px-10 py-9 border border-border bg-card/80 backdrop-blur-sm export-glow-pulse">
        {/* Corner accents */}
        <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-brand/50" />
        <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-brand/50" />
        <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-brand/50" />
        <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-brand/50" />

        {/* Orbit spinner */}
        <div className="relative size-16 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-brand/10" />
          <div className="export-orbit absolute inset-1 rounded-full border border-transparent border-t-brand/70" />
          <div className="export-orbit-reverse absolute inset-3 rounded-full border border-transparent border-b-brand/40" />
          <div className="size-2 rounded-full bg-brand shadow-[0_0_12px_rgba(0,232,208,0.6)]" />
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-mono text-[12px] tracking-[0.18em] uppercase text-foreground">
            Exportando {label}
          </p>
          <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
            {slideCount > 0
              ? `Procesando ${slideCount} diapositivas`
              : "Preparando diapositivas"}
            <LoadingDots />
          </p>
        </div>

        {/* Shimmer progress bar */}
        <div className="w-48 h-[3px] bg-white/6 overflow-hidden relative">
          <div className="export-shimmer export-shimmer-bar absolute inset-y-0 w-1/2" />
        </div>
      </div>
    </div>
  );
}

/** Three animated dots appended to loading copy. */
function LoadingDots() {
  return (
    <span className="inline-flex gap-[3px] ml-1 align-middle">
      <span className="export-dot-1 inline-block size-[3px] rounded-full bg-brand" />
      <span className="export-dot-2 inline-block size-[3px] rounded-full bg-brand" />
      <span className="export-dot-3 inline-block size-[3px] rounded-full bg-brand" />
    </span>
  );
}

function Divider() {
  return <span className="w-px h-[22px] bg-border" />;
}

function NavButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      className={cn(
        "size-[34px] flex items-center justify-center border border-border",
        "bg-transparent text-foreground/60 cursor-pointer",
        "transition-colors hover:border-white/30 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function IconButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      className={cn(
        "h-[34px] px-3.5 flex items-center gap-2 border border-border",
        "bg-transparent text-foreground/60 cursor-pointer",
        "font-mono text-[11px] tracking-[0.07em] uppercase",
        "transition-colors hover:border-white/30 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
