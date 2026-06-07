"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Smartphone, Wifi, WifiOff } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useRemoteChannel } from "@/lib/realtime/use-remote-channel";
import { generateRoomCode, type DeckState, type NavCommand } from "@/lib/realtime/protocol";
import type { DeckController } from "@/hooks/use-deck-controller";
import type { SlideInfo } from "@/lib/slide-preview";
import { cn } from "@/lib/utils";

interface RemoteHostControlsProps {
  /** Imperative deck navigation surface applied to incoming commands. */
  controller: DeckController;
  /** Current slide (0-based). */
  slideIndex: number;
  /** Total slides in the deck. */
  slideTotal: number;
  /** Slide metadata used to broadcast titles to the remote. */
  slides: SlideInfo[];
  /** Deck label shown on the remote. */
  deckLabel: string;
  /** Course tag shown on the remote. */
  courseTag: string;
}

/**
 * Presenter-side remote control. Opens a session channel, renders a QR code and
 * pairing code for the phone to join, applies inbound navigation commands to the
 * live deck, and broadcasts deck state so the remote stays in sync.
 */
export function RemoteHostControls({
  controller,
  slideIndex,
  slideTotal,
  slides,
  deckLabel,
  courseTag,
}: RemoteHostControlsProps) {
  const [room] = useState(() => generateRoomCode());
  const [remoteUrl, setRemoteUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const lastCommandTsRef = useRef(0);

  const handleCommand = useCallback(
    (command: NavCommand) => {
      if (command.ts < lastCommandTsRef.current) return;
      lastCommandTsRef.current = command.ts;

      switch (command.action) {
        case "next":
          controller.next();
          break;
        case "prev":
          controller.prev();
          break;
        case "reset":
          controller.reset();
          break;
        case "goto":
          if (typeof command.index === "number") controller.goTo(command.index);
          break;
      }
    },
    [controller]
  );

  const { status, peerPresent, sendState } = useRemoteChannel({
    room,
    role: "host",
    onCommand: handleCommand,
  });

  useEffect(() => {
    const url = `${window.location.origin}/remote?room=${room}`;
    let active = true;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      color: { dark: "#0a0a0a", light: "#f0eeeb" },
    })
      .then((dataUrl) => {
        if (!active) return;
        setRemoteUrl(url);
        setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!active) return;
        setRemoteUrl(url);
        setQrDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [room]);

  // Broadcast the current deck snapshot whenever it changes, the connection
  // comes up, or a remote joins (so a freshly paired phone is immediately in
  // sync without waiting for the next slide change).
  useEffect(() => {
    if (status !== "connected") return;
    const snapshot: DeckState = {
      index: slideIndex,
      total: slideTotal,
      title: slides[slideIndex]?.title ?? "",
      deckLabel,
      courseTag,
      slideTitles: slides.map((slide) => slide.title),
    };
    sendState(snapshot);
  }, [status, peerPresent, slideIndex, slideTotal, slides, deckLabel, courseTag, sendState]);

  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            className="h-[34px] px-3.5 flex items-center gap-2 border border-border
                       bg-transparent text-foreground/60 cursor-pointer
                       font-mono text-[11px] tracking-[0.07em] uppercase
                       transition-colors hover:border-white/30 hover:text-foreground
                       focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Abrir control remoto"
          />
        }
      >
        <Smartphone className="size-[12px]" />
        Remoto
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-card p-0 gap-0"
      >
        <SheetHeader className="border-b border-border p-6">
          <SheetTitle className="font-mono text-[11px] tracking-widest uppercase text-brand">
            Control Remoto
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] tracking-wide uppercase text-muted-foreground">
            Escanea el código desde tu teléfono
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col items-center gap-7 p-8">
          {/* QR */}
          <div className="border border-border bg-[#f0eeeb] p-3">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="Código QR para emparejar el control remoto"
                className="size-[220px] block"
              />
            ) : (
              <div className="size-[220px] flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-black/40">
                Generando…
              </div>
            )}
          </div>

          {/* Pairing code */}
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
              Código de sala
            </span>
            <span className="font-sans text-[34px] font-bold tracking-[0.3em] text-foreground pl-[0.3em]">
              {room}
            </span>
          </div>

          {/* Connection status */}
          <StatusPill connected={status === "connected"} peerPresent={peerPresent} />

          {/* Manual URL */}
          <div className="w-full flex flex-col gap-2 border-t border-border pt-5">
            <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
              O abre esta dirección
            </span>
            <code className="font-mono text-[11px] text-foreground/70 break-all leading-relaxed">
              {remoteUrl || "—"}
            </code>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface StatusPillProps {
  connected: boolean;
  peerPresent: boolean;
}

function StatusPill({ connected, peerPresent }: StatusPillProps) {
  const label = !connected
    ? "Conectando sesión…"
    : peerPresent
      ? "Teléfono conectado"
      : "Esperando teléfono…";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border px-4 py-2 font-mono text-[10px] tracking-widest uppercase",
        peerPresent
          ? "border-brand/40 text-brand"
          : "border-border text-muted-foreground"
      )}
    >
      {peerPresent ? (
        <Wifi className="size-3.5" />
      ) : (
        <WifiOff className="size-3.5" />
      )}
      {label}
      <span
        className={cn(
          "size-1.5 rounded-full",
          connected ? "bg-brand animate-pulse" : "bg-muted-foreground/40"
        )}
      />
    </div>
  );
}
