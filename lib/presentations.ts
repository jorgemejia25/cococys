/**
 * Presentation data for the Cococys viewer.
 *
 * Each course contains one or more decks. The `file` field is the path to the
 * HTML presentation relative to the `/presentations/` public directory.
 */

export interface Deck {
  /** Display label shown in the sidebar and top bar */
  label: string;
  /** Filename relative to /presentations/ served by Next.js public folder */
  file: string;
  /** Expected slide count (used for the counter before deck-stage fires) */
  slides: number;
}

export interface Course {
  /** Unique identifier used as URL param */
  id: string;
  /** Short tag shown on cards and badges */
  tag: string;
  /** Full course name */
  title: string;
  /** Subtitle shown in italic on cards */
  subtitle: string;
  /** Presentation decks for this course */
  decks: Deck[];
}

export const COURSES: Course[] = [
  {
    id: "flujos",
    tag: "FLUJOS",
    title: "Introducción a los Flujos y Algoritmos",
    subtitle: "Primer semestre.",
    decks: [
      {
        label: "Semana 1 — Diagnóstico",
        file: "Semana 1 - Flujos y Algoritmos.html",
        slides: 11,
      },
    ],
  },
  {
    id: "prog2",
    tag: "PROG 2",
    title: "Programación y Computación 2",
    subtitle: "Introducción a la programación.",
    decks: [
      {
        label: "Semana 1 — Diagnóstico",
        file: "Semana 1 - Programacion 2.html",
        slides: 11,
      },
    ],
  },
];

/**
 * Looks up a course by its id.
 * Returns undefined if not found.
 */
export function getCourseById(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}
