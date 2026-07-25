"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, RotateCcw, Wifi, WifiOff } from "lucide-react";
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
 * Phone and tablet remote. Joins the session channel, mirrors the host's deck
 * state, and publishes navigation commands. Falls back to a manual code entry
 * form when no valid room is supplied via the URL.
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
  const script = deck?.script?.trim() ?? "";
  const hasScript = script.length > 0;
  const title = deck?.title || (ready ? "Sin título" : "Esperando pantalla…");
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground select-none overflow-hidden">
      <RemoteHeader
        room={room}
        courseTag={deck?.courseTag}
        deckLabel={deck?.deckLabel}
        ready={ready}
        connecting={status === "connecting"}
      />

      <div className="flex-1 min-h-0 flex flex-col md:flex-row phone-landscape:flex-row md:overflow-hidden">
        {/* Main panel — slide info + script */}
        <div className="flex-1 min-h-0 flex flex-col min-w-0 md:overflow-hidden">
          <SlideReadout
            index={index}
            total={total}
            title={title}
            hasScript={hasScript}
            ready={ready}
            pad={pad}
            className={cn(!hasScript && "md:flex-1 md:justify-center")}
          />

          {hasScript && (
            <ScriptPanel script={script} className="flex-1 min-h-0 md:px-8 lg:px-10" />
          )}

          {/* Phone: navigation when no script */}
          {!hasScript && (
            <div className="flex-1 grid grid-cols-2 gap-3 px-5 min-h-0 md:hidden phone-landscape:hidden">
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
          )}

          {/* Phone: compact nav when script is visible */}
          {hasScript && (
            <div className="shrink-0 grid grid-cols-2 gap-2 px-4 py-3 safe-area-pb md:hidden phone-landscape:hidden">
              <CompactNavButton
                label="Anterior"
                disabled={!ready}
                onClick={() => send({ action: "prev" })}
              >
                <ArrowLeft className="size-5" strokeWidth={1.5} />
              </CompactNavButton>
              <CompactNavButton
                label="Siguiente"
                accent
                disabled={!ready}
                onClick={() => send({ action: "next" })}
              >
                <ArrowRight className="size-5" strokeWidth={1.5} />
              </CompactNavButton>
            </div>
          )}

          {/* Phone: jump grid */}
          <JumpPanel
            className="md:hidden phone-landscape:hidden"
            variant="grid"
            compact={hasScript}
            total={total}
            index={index}
            ready={ready}
            deck={deck}
            pad={pad}
            onGoto={(i) => send({ action: "goto", index: i })}
            onReset={() => send({ action: "reset" })}
          />
        </div>

        {/* Tablet+: control rail */}
        <aside
          className={cn(
            "hidden md:flex phone-landscape:flex md:flex-col phone-landscape:flex-col md:shrink-0",
            "md:border-l phone-landscape:border-l md:border-border phone-landscape:border-border",
            "md:w-[min(38vw,380px)] lg:w-[min(34vw,440px)] phone-landscape:w-[min(42vw,320px)]",
            "bg-card/20 safe-area-pb"
          )}
        >
          <div className="flex-1 min-h-0 flex flex-col gap-4 p-5 lg:p-6">
            {hasScript ? (
              <div className="shrink-0 grid grid-cols-2 gap-3">
                <SidebarNavButton
                  label="Anterior"
                  disabled={!ready}
                  onClick={() => send({ action: "prev" })}
                >
                  <ArrowLeft className="size-6" strokeWidth={1.5} />
                </SidebarNavButton>
                <SidebarNavButton
                  label="Siguiente"
                  accent
                  disabled={!ready}
                  onClick={() => send({ action: "next" })}
                >
                  <ArrowRight className="size-6" strokeWidth={1.5} />
                </SidebarNavButton>
              </div>
            ) : (
              <div className="shrink-0 grid grid-cols-2 gap-3 min-h-[180px] lg:min-h-[220px]">
                <NavPad
                  label="Anterior"
                  disabled={!ready}
                  onClick={() => send({ action: "prev" })}
                  size="sidebar"
                >
                  <ArrowLeft className="size-12 lg:size-14" strokeWidth={1.5} />
                </NavPad>
                <NavPad
                  label="Siguiente"
                  accent
                  disabled={!ready}
                  onClick={() => send({ action: "next" })}
                  size="sidebar"
                >
                  <ArrowRight className="size-12 lg:size-14" strokeWidth={1.5} />
                </NavPad>
              </div>
            )}

            <JumpPanel
              className="flex-1 min-h-0"
              variant="list"
              compact={false}
              total={total}
              index={index}
              ready={ready}
              deck={deck}
              pad={pad}
              onGoto={(i) => send({ action: "goto", index: i })}
              onReset={() => send({ action: "reset" })}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

interface RemoteHeaderProps {
  room: string;
  courseTag?: string;
  deckLabel?: string;
  ready: boolean;
  connecting: boolean;
}

function RemoteHeader({ room, courseTag, deckLabel, ready, connecting }: RemoteHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border px-4 py-3 md:px-6 md:py-4 flex items-center justify-between gap-3 safe-area-pt">
      <div className="min-w-0">
        <p className="font-mono text-[10px] md:text-[11px] tracking-widest uppercase text-brand">
          {courseTag ?? "Control Remoto"}
        </p>
        <p className="font-sans text-sm md:text-base font-medium truncate text-foreground/80">
          {deckLabel ?? `Sala ${room}`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden lg:inline font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          {room}
        </span>
        <ConnectionBadge ready={ready} connecting={connecting} />
      </div>
    </header>
  );
}

interface SlideReadoutProps {
  index: number;
  total: number;
  title: string;
  hasScript: boolean;
  ready: boolean;
  pad: (n: number) => string;
  className?: string;
}

function SlideReadout({
  index,
  total,
  title,
  hasScript,
  ready,
  pad,
  className,
}: SlideReadoutProps) {
  return (
    <div
      className={cn(
        "shrink-0 flex flex-col items-center text-center border-b border-border/60",
        hasScript
          ? "gap-1 py-3 px-4 md:gap-2 md:py-5 md:px-8 lg:py-6 phone-landscape:py-2 phone-landscape:gap-1"
          : "gap-3 py-8 px-5 md:gap-4 md:py-10 phone-landscape:py-4 phone-landscape:gap-2",
        className
      )}
    >
      <span
        className={cn(
          "font-sans leading-none font-bold tracking-tight tabular-nums",
          hasScript
            ? "text-[32px] md:text-[44px] lg:text-[52px] phone-landscape:text-[28px]"
            : "text-[64px] md:text-[80px] lg:text-[96px] phone-landscape:text-[48px]"
        )}
      >
        {total ? `${pad(index + 1)}` : "—"}
        <span
          className={cn(
            "text-foreground/30",
            hasScript
              ? "text-[22px] md:text-[28px] lg:text-[32px]"
              : "text-[40px] md:text-[48px] lg:text-[56px]"
          )}
        >
          {" / "}
          {total ? pad(total) : "—"}
        </span>
      </span>
      <p
        className={cn(
          "font-(family-name:--font-cormorant-garamond) italic text-foreground/60 max-w-2xl",
          hasScript
            ? "text-base md:text-xl lg:text-2xl min-h-5 line-clamp-2 md:line-clamp-3"
            : "text-xl md:text-2xl lg:text-3xl min-h-7 md:max-w-3xl"
        )}
      >
        {title}
      </p>
    </div>
  );
}

interface ScriptPanelProps {
  script: string;
  className?: string;
}

function ScriptPanel({ script, className }: ScriptPanelProps) {
  return (
    <section
      className={cn("flex flex-col border-b border-border/60 md:border-b-0", className)}
      aria-label="Guión de la diapositiva"
    >
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 md:px-0 md:pt-2 border-b border-border/40 md:border-b-0">
        <BookOpen className="size-3.5 md:size-4 text-brand shrink-0" />
        <span className="font-mono text-[10px] md:text-[11px] tracking-widest uppercase text-muted-foreground">
          Guión
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 md:px-0 md:py-3 lg:py-4">
        <p className="font-sans text-[15px] md:text-[17px] lg:text-[18px] leading-[1.65] md:leading-[1.7] text-foreground/85 whitespace-pre-wrap max-w-3xl mx-auto md:mx-0">
          {script}
        </p>
      </div>
    </section>
  );
}

interface JumpPanelProps {
  className?: string;
  variant: "grid" | "list";
  compact: boolean;
  total: number;
  index: number;
  ready: boolean;
  deck: DeckState | null;
  pad: (n: number) => string;
  onGoto: (index: number) => void;
  onReset: () => void;
}

function JumpPanel({
  className,
  variant,
  compact,
  total,
  index,
  ready,
  deck,
  pad,
  onGoto,
  onReset,
}: JumpPanelProps) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border flex flex-col",
        compact ? "gap-3 p-3" : "gap-4 p-5",
        variant === "list" && "border-t-0 p-0 min-h-0",
        className
      )}
    >
      <div className="flex items-center justify-between px-1 shrink-0">
        <span className="font-mono text-[10px] md:text-[11px] tracking-widest uppercase text-muted-foreground">
          Ir a diapositiva
        </span>
        <button
          type="button"
          disabled={!ready}
          onClick={onReset}
          className="flex items-center gap-1.5 font-mono text-[10px] md:text-[11px] tracking-widest uppercase
                     text-muted-foreground transition-colors hover:text-brand disabled:opacity-30 touch-manipulation"
        >
          <RotateCcw className="size-3" />
          Inicio
        </button>
      </div>

      {variant === "grid" ? (
        <div
          className={cn(
            "grid gap-1.5 overflow-y-auto",
            compact
              ? "grid-cols-6 max-h-[14vh] sm:grid-cols-8 sm:max-h-[16vh]"
              : "grid-cols-5 sm:grid-cols-6 gap-2 max-h-[22vh]"
          )}
        >
          {Array.from({ length: total }).map((_, i) => (
            <JumpGridButton
              key={i}
              slideNumber={pad(i + 1)}
              active={i === index}
              disabled={!ready}
              label={deck?.slideTitles[i] ?? `Diapositiva ${i + 1}`}
              compact={compact}
              onClick={() => onGoto(i)}
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1 flex flex-col gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <JumpListButton
              key={i}
              slideNumber={pad(i + 1)}
              title={deck?.slideTitles[i] ?? `Diapositiva ${i + 1}`}
              active={i === index}
              disabled={!ready}
              onClick={() => onGoto(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface JumpGridButtonProps {
  slideNumber: string;
  active: boolean;
  disabled: boolean;
  label: string;
  compact: boolean;
  onClick: () => void;
}

function JumpGridButton({
  slideNumber,
  active,
  disabled,
  label,
  compact,
  onClick,
}: JumpGridButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={cn(
        "aspect-square flex items-center justify-center border font-mono tabular-nums",
        "transition-colors disabled:opacity-30 touch-manipulation",
        compact ? "text-[10px] sm:text-xs" : "text-xs sm:text-sm",
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-border text-foreground/60 hover:border-white/30 hover:text-foreground"
      )}
    >
      {slideNumber}
    </button>
  );
}

interface JumpListButtonProps {
  slideNumber: string;
  title: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

function JumpListButton({
  slideNumber,
  title,
  active,
  disabled,
  onClick,
}: JumpListButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 lg:py-3 border text-left",
        "transition-colors disabled:opacity-30 touch-manipulation",
        active
          ? "border-brand/50 bg-brand/8"
          : "border-transparent hover:border-border hover:bg-white/3"
      )}
    >
      <span
        className={cn(
          "font-mono text-xs lg:text-sm tabular-nums w-6 shrink-0",
          active ? "text-brand" : "text-muted-foreground"
        )}
      >
        {slideNumber}
      </span>
      <span
        className={cn(
          "font-sans text-sm lg:text-[15px] leading-snug truncate",
          active ? "text-foreground" : "text-foreground/70"
        )}
      >
        {title}
      </span>
    </button>
  );
}

interface NavPadProps {
  label: string;
  accent?: boolean;
  disabled?: boolean;
  size?: "default" | "sidebar";
  onClick: () => void;
  children: React.ReactNode;
}

function NavPad({ label, accent, disabled, size = "default", onClick, children }: NavPadProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center border h-full w-full",
        "font-mono tracking-widest uppercase",
        "transition-colors active:scale-[0.98] disabled:opacity-30 disabled:active:scale-100",
        "touch-manipulation",
        size === "sidebar" ? "gap-4 text-[11px] lg:text-xs" : "gap-3 text-[10px]",
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

interface CompactNavButtonProps {
  label: string;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function CompactNavButton({
  label,
  accent,
  disabled,
  onClick,
  children,
}: CompactNavButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex items-center justify-center gap-2 border py-3.5 w-full",
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

function SidebarNavButton({
  label,
  accent,
  disabled,
  onClick,
  children,
}: CompactNavButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex flex-col items-center justify-center gap-2 border py-5 lg:py-6 w-full",
        "font-mono text-[10px] lg:text-[11px] tracking-widest uppercase",
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
        "shrink-0 flex items-center gap-1.5 border px-2.5 py-1 md:px-3 md:py-1.5",
        "font-mono text-[9px] md:text-[10px] tracking-widest uppercase",
        ready ? "border-brand/40 text-brand" : "border-border text-muted-foreground"
      )}
    >
      {ready ? <Wifi className="size-3 md:size-3.5" /> : <WifiOff className="size-3 md:size-3.5" />}
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
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 md:gap-10 bg-background bg-grid px-6 md:px-10 overflow-x-hidden safe-area-pt safe-area-pb">
      <div className="text-center max-w-md">
        <p className="font-mono text-[10px] md:text-[11px] tracking-widest uppercase text-brand mb-3">
          Control Remoto
        </p>
        <h1 className="font-sans text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
          Ingresa el código
        </h1>
        <p className="font-mono text-[11px] md:text-xs tracking-widest uppercase text-muted-foreground mt-3">
          Lo verás en la pantalla de presentación
        </p>
      </div>

      <form
        className="flex flex-col items-center gap-4 w-full max-w-xs md:max-w-sm"
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
          className="w-full bg-card border border-border text-center font-sans text-3xl md:text-4xl font-bold
                     tracking-[0.3em] pl-[0.3em] py-4 md:py-5 text-foreground placeholder:text-muted-foreground/30
                     focus-visible:outline-none focus-visible:border-brand"
        />
        <button
          type="submit"
          disabled={!valid}
          className="w-full border border-brand/40 bg-brand/6 text-brand py-3.5 md:py-4
                     font-mono text-[11px] md:text-xs tracking-widest uppercase
                     transition-colors active:bg-brand/15 disabled:opacity-30 touch-manipulation"
        >
          Conectar
        </button>
      </form>
    </div>
  );
}
