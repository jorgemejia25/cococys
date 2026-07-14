import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCourseById, type Deck } from "@/lib/presentations";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Course page — deck selector.
 *
 * Shows all presentations available for a given course, styled consistently
 * with the home page. Each card links to the viewer with course + deck index.
 */
export default async function CoursePage({ params }: PageProps) {
  const { id } = await params;
  const course = getCourseById(id);
  if (!course) notFound();

  return (
    <div className="fixed inset-0 flex flex-col bg-background bg-grid overflow-x-hidden">
      {/* Top bar */}
      <header className="h-[54px] flex items-center justify-between px-5 md:px-10 border-b border-border shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-muted-foreground font-mono text-[11px]
                     tracking-widest uppercase transition-colors hover:text-brand"
        >
          <ChevronLeft className="size-3.5 shrink-0" />
          Cursos
        </Link>
        <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-brand">
          {course.tag}
        </span>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-center gap-10 md:gap-16 p-6 md:p-10 overflow-y-auto">
        {/* Heading */}
        <div className="text-center">
          <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-4">
            {course.tag}
          </p>
          <h1 className="font-sans text-3xl md:text-[56px] font-bold tracking-[-0.03em] leading-[0.92] mb-3">
            {course.title.split(" ").slice(0, 3).join(" ")}{" "}
            <em className="font-(family-name:--font-cormorant-garamond) not-italic font-normal text-foreground/60">
              {course.title.split(" ").slice(3).join(" ")}
            </em>
          </h1>
          <p className="font-mono text-sm tracking-widest uppercase text-muted-foreground mt-4">
            Elige una presentación
          </p>
        </div>

        {/* Deck cards */}
        <div className="flex flex-col md:flex-row flex-wrap gap-4 md:gap-6 justify-center items-center md:items-stretch w-full md:w-auto max-w-4xl">
          {course.decks.map((deck, index) => (
            <DeckCard key={deck.file} courseId={id} deck={deck} index={index} />
          ))}
        </div>

        {/* WhatsApp group callout */}
        {course.whatsapp && <WhatsAppGroup href={course.whatsapp} title={course.title} />}
      </main>
    </div>
  );
}

/**
 * WhatsApp group callout — invites students to join the course's group.
 */
function WhatsAppGroup({ href, title }: { href: string; title: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-3 border border-border bg-card px-5 py-3
                 transition-colors duration-200 hover:border-white/20 hover:bg-secondary
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="font-mono text-[11px] tracking-[0.12em] uppercase text-brand"
      >
        Grupo
      </span>
      <p className="font-mono text-[11px] tracking-widest uppercase text-muted-foreground">
        Click aquí para unirte al grupo de WhatsApp de {title}
      </p>
      <span className="text-lg text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brand">
        →
      </span>
    </a>
  );
}

interface DeckCardProps {
  courseId: string;
  deck: Deck;
  index: number;
}

function DeckCard({ courseId, deck, index }: DeckCardProps) {
  const weekMatch = deck.label.match(/Semana\s+(\d+)/i);
  const weekNum = weekMatch ? weekMatch[1].padStart(2, "0") : String(index + 1).padStart(2, "0");

  return (
    <Link
      href={`/viewer?course=${courseId}&deck=${index}`}
      className="group w-full max-w-sm md:w-[340px] md:max-w-none border border-border bg-card p-6 md:p-8 cursor-pointer relative overflow-hidden
                 flex flex-col gap-5 md:gap-6 transition-colors duration-200
                 hover:border-white/20 hover:bg-secondary
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Accent bar */}
      <span
        className="absolute top-0 left-0 right-0 h-[2px] bg-brand
                   scale-x-0 origin-left transition-transform duration-300
                   ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100"
      />

      {/* Week number */}
      <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-brand">
        Semana {weekNum}
      </span>

      {/* Label */}
      <p className="font-sans text-xl md:text-[26px] font-bold tracking-[-0.02em] leading-[1.1] text-foreground">
        {deck.label}
      </p>

      {/* Meta */}
      <div className="flex items-center justify-between border-t border-border pt-5
                      font-mono text-[11px] tracking-widest uppercase text-muted-foreground">
        <span>{deck.slides} diapositivas</span>
        <span className="text-lg transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brand">
          →
        </span>
      </div>
    </Link>
  );
}
