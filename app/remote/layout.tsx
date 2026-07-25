import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Control Remoto — Cococys",
  description: "Controla la presentación desde tu teléfono o tablet.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Remote layout — full-screen control surface with safe-area support on
 * notched phones and tablets.
 */
export default function RemoteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
