"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type Deck } from "@/lib/presentations";
import { type SlideInfo } from "@/lib/slide-preview";

interface SlideNavigatorProps {
  deck: Deck;
  slides: SlideInfo[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Sidebar shown while a presentation is playing.
 * Shows deck info and a numbered slide list.
 */
export function SlideNavigator({
  deck,
  slides,
  activeIndex,
  onSelect,
}: SlideNavigatorProps) {
  return (
    <aside className="w-[272px] shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
      {/* Deck info */}
      <div className="px-5 py-4 border-b border-border shrink-0">
        <p className="font-sans text-[13px] font-semibold text-foreground leading-snug">
          {deck.label}
        </p>
        <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground mt-1">
          {deck.slides} diapositivas
        </p>
      </div>

      {/* Slide list */}
      <ScrollArea className="flex-1">
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
          "font-sans text-[12px] leading-snug truncate",
          isActive ? "text-foreground" : "text-foreground/60"
        )}
      >
        {slide.title}
      </span>
    </button>
  );
}
