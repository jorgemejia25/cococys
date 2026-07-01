import type { Metadata } from "next";
import { Space_Grotesk, Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["italic"],
  variable: "--font-cormorant-garamond",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cococys — Presentaciones",
  description: "Visor de presentaciones para tutoría universitaria · Jorge Mejía · 2S 2026",
};

/**
 * Root layout. Applies the three custom fonts and wraps the tree with the
 * Tooltip provider required by shadcn/ui.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={[
        spaceGrotesk.variable,
        cormorantGaramond.variable,
        jetbrainsMono.variable,
        "overflow-x-hidden",
      ].join(" ")}
    >
      <body className="antialiased overflow-hidden overflow-x-hidden h-screen bg-background text-foreground">
        <TooltipProvider delay={300}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
