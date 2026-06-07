import Link from "next/link";
import { COURSES, type Course } from "@/lib/presentations";

/**
 * Home page — course selector.
 *
 * Pure RSC: no client-side state. Each course card is a Next.js Link that
 * navigates to the viewer with the course id as a query param.
 */
export default function HomePage() {
  return (
    <div className="fixed inset-0 flex flex-col bg-background bg-grid">
      {/* Top bar */}
      <header className="h-[54px] flex items-center justify-between px-10 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="size-2 rounded-full bg-brand shrink-0" />
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
            Jorge Mejía · Presentaciones
          </span>
        </div>
        <span className="font-mono text-[11px] tracking-widest uppercase text-muted-foreground">
          2S · 2026
        </span>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-center gap-16 p-10">
        {/* Heading */}
        <div className="text-center">
          <h1 className="font-sans text-[64px] font-bold tracking-[-0.03em] leading-[0.9] mb-3">
            Elige un{" "}
            <span className="text-foreground/60">curso.</span>
          </h1>
          <p className="font-mono text-sm tracking-widest uppercase text-muted-foreground mt-4">
            2S · 2026
          </p>
        </div>

        {/* Course cards */}
        <div className="flex gap-6">
          {COURSES.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>

        <SocialLinks />
      </main>
    </div>
  );
}

const SOCIAL_LINKS = [
  { label: "GitHub", href: "https://github.com/jorgemejia25" },
  { label: "Instagram", href: "https://www.instagram.com/jorgemejia___/" },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/jorge-andrés-mejía-621596219/",
  },
  { label: "jorgemejia.dev", href: "https://www.jorgemejia.dev" },
] as const;

/**
 * External links to Jorge Mejía's profiles and portfolio.
 */
function SocialLinks() {
  return (
    <nav
      aria-label="Enlaces de Jorge Mejía"
      className="flex items-center gap-6 font-mono text-[11px] tracking-widest uppercase"
    >
      {SOCIAL_LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-colors hover:text-brand"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * Individual course card component.
 * Rendered as a Next.js Link so navigation is handled at the router level.
 */
function CourseCard({ course }: { course: Course }) {
  const totalSlides = course.decks.reduce((acc, d) => acc + d.slides, 0);
  const deckCount = course.decks.length;

  return (
    <Link
      href={`/curso/${course.id}`}
      className="group w-[380px] border border-border bg-card p-9 cursor-pointer relative overflow-hidden
                 flex flex-col gap-7 transition-colors duration-200
                 hover:border-white/20 hover:bg-secondary
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Accent top bar — slides in on hover */}
      <span
        className="absolute top-0 left-0 right-0 h-[2px] bg-brand
                   scale-x-0 origin-left transition-transform duration-300
                   ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100"
      />

      {/* Tag */}
      <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-brand">
        {course.tag}
      </span>

      {/* Title + subtitle */}
      <div>
        <p className="font-sans text-[30px] font-bold tracking-[-0.02em] leading-[1.1] text-foreground">
          {course.title}
        </p>
        <p className="font-(family-name:--font-cormorant-garamond) italic text-[22px] text-foreground/55 mt-1">
          {course.subtitle}
        </p>
      </div>

      {/* Meta footer */}
      <div
        className="flex items-center justify-between
                   border-t border-border pt-5
                   font-mono text-[11px] tracking-widest uppercase text-muted-foreground"
      >
        <span>
          {deckCount} presentaci{deckCount > 1 ? "ones" : "ón"} · {totalSlides} diapositivas
        </span>
        <span className="text-lg transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brand">
          →
        </span>
      </div>
    </Link>
  );
}
