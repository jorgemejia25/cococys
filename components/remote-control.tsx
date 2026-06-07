"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { useRemoteChannel } from "@/lib/realtime/use-remote-channel";
import {
  isValidRoomCode,
  type DeckState,
  type NavCommand,
} from "@/lib/realtime/protocol";
import { cn } from "@/lib/utils";

interface RemoteControlProps {
  /** Room code taken from the QR/URL; empty when the user must type it. */
  initialRoom: string;
}

/**
 * Phone-side remote. Joins the session channel, mirrors the host's deck state,
 * and publishes navigation commands. Falls back to a manual code entry form when
 * no valid room is supplied via the URL.
 */
export function RemoteControl({ initialRoom }: RemoteControlProps) {
  const normalizedInitial = initialRoom.trim().toUpperCase();
  const [room, setRoom] = useState(
    isValidRoomCode(normalizedInitial) ? normalizedInitial : ""
  );

  if (!room) {
    return <RoomEntryForm onSubmit={setRoom} />;
  }

  return <ConnectedRemote room={room} />;
}

interface ConnectedRemoteProps {
  room: string;
}

function ConnectedRemote({ room }: ConnectedRemoteProps) {
  const [deck, setDeck] = useState<DeckState | null>(null);

  const handleState = useCallback((state: DeckState) => setDeck(state), []);

  const { status, peerPresent, sendCommand } = useRemoteChannel({
    room,
    role: "remote",
    onState: handleState,
  });

  const send = useCallback(
    (command: Omit<NavCommand, "ts">) => {
      sendCommand({ ...command, ts: Date.now() });
    },
    [sendCommand]
  );

  const ready = status === "connected" && peerPresent;
  const index = deck?.index ?? 0;
  const total = deck?.total ?? 0;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground select-none">
      {/* Header */}
      <header className="shrink-0 border-b border-border px-5 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-widest uppercase text-brand">
            {deck?.courseTag ?? "Control Remoto"}
          </p>
          <p className="font-sans text-sm font-medium truncate text-foreground/80">
            {deck?.deckLabel ?? `Sala ${room}`}
          </p>
        </div>
        <ConnectionBadge ready={ready} connecting={status === "connecting"} />
      </header>

      {/* Current slide readout */}
      <div className="shrink-0 flex flex-col items-center justify-center gap-3 py-8 px-5 text-center">
        <span className="font-sans text-[64px] leading-none font-bold tracking-tight tabular-nums">
          {total ? `${pad(index + 1)}` : "—"}
          <span className="text-foreground/30 text-[40px]">
            {" / "}
            {total ? pad(total) : "—"}
          </span>
        </span>
        <p className="font-(family-name:--font-cormorant-garamond) italic text-xl text-foreground/60 min-h-7">
          {deck?.title || (ready ? "Sin título" : "Esperando pantalla…")}
        </p>
      </div>

      {/* Prev / Next */}
      <div className="flex-1 grid grid-cols-2 gap-3 px-5 min-h-0">
        <NavPad
          label="Anterior"
          disabled={!ready}
          onClick={() => send({ action: "prev" })}
        >
          <ArrowLeft className="size-10" strokeWidth={1.5} />
        </NavPad>
        <NavPad
          label="Siguiente"
          accent
          disabled={!ready}
          onClick={() => send({ action: "next" })}
        >
          <ArrowRight className="size-10" strokeWidth={1.5} />
        </NavPad>
      </div>

      {/* Jump grid + reset */}
      <div className="shrink-0 border-t border-border p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
            Ir a diapositiva
          </span>
          <button
            type="button"
            disabled={!ready}
            onClick={() => send({ action: "reset" })}
            className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase
                       text-muted-foreground transition-colors hover:text-brand disabled:opacity-30"
          >
            <RotateCcw className="size-3" />
            Inicio
          </button>
        </div>

        <div className="grid grid-cols-6 gap-2 max-h-[22vh] overflow-y-auto">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              type="button"
              disabled={!ready}
              onClick={() => send({ action: "goto", index: i })}
              aria-label={deck?.slideTitles[i] ?? `Diapositiva ${i + 1}`}
              className={cn(
                "aspect-square flex items-center justify-center border font-mono text-xs tabular-nums",
                "transition-colors disabled:opacity-30",
                i === index
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-foreground/60 hover:border-white/30 hover:text-foreground"
              )}
            >
              {pad(i + 1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface NavPadProps {
  label: string;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function NavPad({ label, accent, disabled, onClick, children }: NavPadProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-3 border h-full w-full",
        "font-mono text-[10px] tracking-widest uppercase",
        "transition-colors active:scale-[0.98] disabled:opacity-30 disabled:active:scale-100",
        "touch-manipulation",
        accent
          ? "border-brand/40 text-brand bg-brand/6 active:bg-brand/15"
          : "border-border text-foreground/70 active:bg-secondary"
      )}
    >
      {children}
      {label}
    </button>
  );
}

interface ConnectionBadgeProps {
  ready: boolean;
  connecting: boolean;
}

function ConnectionBadge({ ready, connecting }: ConnectionBadgeProps) {
  const label = ready ? "En vivo" : connecting ? "Conectando" : "Sin pantalla";
  return (
    <div
      className={cn(
        "shrink-0 flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[9px] tracking-widest uppercase",
        ready ? "border-brand/40 text-brand" : "border-border text-muted-foreground"
      )}
    >
      {ready ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
      {label}
    </div>
  );
}

interface RoomEntryFormProps {
  onSubmit: (room: string) => void;
}

function RoomEntryForm({ onSubmit }: RoomEntryFormProps) {
  const [value, setValue] = useState("");
  const normalized = value.trim().toUpperCase();
  const valid = isValidRoomCode(normalized);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 bg-background bg-grid px-6">
      <div className="text-center">
        <p className="font-mono text-[10px] tracking-widest uppercase text-brand mb-3">
          Control Remoto
        </p>
        <h1 className="font-sans text-3xl font-bold tracking-tight">
          Ingresa el código
        </h1>
        <p className="font-mono text-[11px] tracking-widest uppercase text-muted-foreground mt-3">
          Lo verás en la pantalla de presentación
        </p>
      </div>

      <form
        className="flex flex-col items-center gap-4 w-full max-w-xs"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSubmit(normalized);
        }}
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          placeholder="ABC123"
          aria-label="Código de sala"
          className="w-full bg-card border border-border text-center font-sans text-3xl font-bold
                     tracking-[0.3em] pl-[0.3em] py-4 text-foreground placeholder:text-muted-foreground/30
                     focus-visible:outline-none focus-visible:border-brand"
        />
        <button
          type="submit"
          disabled={!valid}
          className="w-full border border-brand/40 bg-brand/6 text-brand py-3.5
                     font-mono text-[11px] tracking-widest uppercase
                     transition-colors active:bg-brand/15 disabled:opacity-30"
        >
          Conectar
        </button>
      </form>
    </div>
  );
}
