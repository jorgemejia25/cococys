"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type Deck } from "@/lib/presentations";
import { type SlideInfo } from "@/lib/slide-preview";

const SCRIPT_PANEL_KEY = "cococys-script-panel-open";

interface SlideNavigatorProps {
  deck: Deck;
  slides: SlideInfo[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Sidebar shown while a presentation is playing.
 * Shows deck info, a numbered slide list and a collapsible presenter script.
 */
export function SlideNavigator({
  deck,
  slides,
  activeIndex,
  onSelect,
}: SlideNavigatorProps) {
  const activeScript = slides[activeIndex]?.script?.trim() ?? "";
  const hasScript = activeScript.length > 0;
  const slidesWithScript = slides.filter((slide) => slide.script.trim()).length;

  const [scriptOpen, setScriptOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SCRIPT_PANEL_KEY);
      if (stored === "0" || stored === "1") {
        setScriptOpen(stored === "1");
      }
    } catch {
      // localStorage unavailable — keep default open
    }
  }, []);

  const toggleScript = useCallback(() => {
    setScriptOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(SCRIPT_PANEL_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return (
    <aside className="hidden md:flex w-[272px] shrink-0 border-r border-border bg-card flex-col overflow-hidden">
      {/* Deck info */}
      <div className="px-5 py-4 border-b border-border shrink-0">
        <p className="font-sans text-[13px] font-semibold text-foreground leading-snug">
          {deck.label}
        </p>
        <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground mt-1">
          {deck.slides} diapositivas
          {slidesWithScript > 0 && ` · ${slidesWithScript} con guión`}
        </p>
      </div>

      {/* Slide list */}
      <ScrollArea
        className={cn(
          "min-h-0",
          hasScript && scriptOpen ? "max-h-[42%]" : "flex-1"
        )}
      >
        <div className="py-2 flex flex-col gap-px">
          {slides.map((slide) => (
            <SlideRow
              key={slide.index}
              slide={slide}
              isActive={slide.index === activeIndex}
              onSelect={() => onSelect(slide.index)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Collapsible presenter script */}
      {hasScript && (
        <section
          className={cn(
            "flex flex-col border-t border-border",
            scriptOpen ? "flex-1 min-h-0" : "shrink-0"
          )}
          aria-label="Guión de la diapositiva activa"
        >
          <button
            type="button"
            onClick={toggleScript}
            aria-expanded={scriptOpen}
            className={cn(
              "shrink-0 flex items-center justify-between gap-2 px-5 py-3",
              "border-b border-border/60 w-full text-left",
              "transition-colors hover:bg-white/3",
              "focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-ring"
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <BookOpen className="size-3.5 text-brand shrink-0" />
              <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
                Guión
              </span>
            </span>
            {scriptOpen ? (
              <ChevronDown className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
            ) : (
              <ChevronUp className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
            )}
          </button>

          {scriptOpen ? (
            <ScrollArea className="flex-1 min-h-0">
              <p className="px-5 py-4 font-sans text-[13px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                {activeScript}
              </p>
            </ScrollArea>
          ) : (
            <p className="px-5 py-2 font-mono text-[9px] tracking-wide uppercase text-muted-foreground/70 truncate">
              {slides[activeIndex]?.title}
            </p>
          )}
        </section>
      )}
    </aside>
  );
}

interface SlideRowProps {
  slide: SlideInfo;
  isActive: boolean;
  onSelect: () => void;
}

function SlideRow({ slide, isActive, onSelect }: SlideRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3.5 px-5 py-2.5 text-left",
        "border-l-2 transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-ring",
        isActive
          ? "border-l-brand bg-brand/5"
          : "border-l-transparent hover:bg-white/3"
      )}
    >
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums w-5 text-right shrink-0 leading-none",
          isActive ? "text-brand" : "text-muted-foreground/50"
        )}
      >
        {slide.label}
      </span>
      <span className="w-px h-3 bg-border shrink-0" />
      <span
        className={cn(
          "font-sans text-[12px] leading-snug truncate flex-1 min-w-0",
          isActive ? "text-foreground" : "text-foreground/60",
          slide.script.trim() && !isActive && "text-foreground/70"
        )}
      >
        {slide.title}
      </span>
      {slide.script.trim() && (
        <span
          className="shrink-0 size-1.5 rounded-full bg-brand/50"
          aria-hidden
          title="Tiene guión"
        />
      )}
    </button>
  );
}
