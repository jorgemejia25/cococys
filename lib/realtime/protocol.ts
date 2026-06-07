/**
 * Realtime control protocol shared between the presenter screen (host) and the
 * phone remote. Transport is Ably (managed WebSockets); these types describe the
 * application-level messages exchanged over a single per-session channel.
 *
 * The session channel name is always `room:<code>`. A capability token minted by
 * the `createRemoteToken` Server Action scopes a client strictly to its own room.
 */

/** Role a connected client plays within a remote-control session. */
export type RemoteRole = "host" | "remote";

/** Lifecycle of the underlying realtime connection, surfaced to the UI. */
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

/** Ably event name carrying a {@link NavCommand} (remote → host). */
export const COMMAND_EVENT = "command" as const;

/** Ably event name carrying a {@link DeckState} (host → remote). */
export const STATE_EVENT = "state" as const;

/**
 * Navigation intent published by the remote and applied by the host to the
 * live `deck-stage`. `index` is only meaningful for the `goto` action and is
 * 0-based to match the deck-stage API.
 */
export interface NavCommand {
  action: "next" | "prev" | "goto" | "reset";
  /** Target slide (0-based). Required for `goto`, ignored otherwise. */
  index?: number;
  /** Epoch ms when the command was issued; used to discard stale messages. */
  ts: number;
}

/**
 * Snapshot of the presentation broadcast by the host so the remote can render
 * an accurate counter, slide list and current title without same-origin access
 * to the deck iframe.
 */
export interface DeckState {
  /** Current slide (0-based). */
  index: number;
  /** Total number of slides in the deck. */
  total: number;
  /** Authored title of the current slide. */
  title: string;
  /** Human-readable deck label, e.g. "Semana 1 — Diagnóstico". */
  deckLabel: string;
  /** Course tag, e.g. "PROG 2". */
  courseTag: string;
  /** Authored titles for every slide, used to render the remote's jump grid. */
  slideTitles: string[];
}

/** Builds the canonical channel name for a session code. */
export function channelName(room: string): string {
  return `room:${room}`;
}

/**
 * Returns a RFC-4122 v4 UUID when the platform supports it.
 *
 * `crypto.randomUUID()` requires a secure context (HTTPS or localhost). When
 * the remote is opened over plain HTTP on a LAN IP, only `getRandomValues` is
 * available — this helper falls back to a manual v4 construction in that case.
 */
function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generates a stable per-tab client identifier for Ably presence and auth.
 * Prefixed by role so presence checks can distinguish host from remote peers.
 */
export function generateClientId(role: RemoteRole): string {
  return `${role}-${randomUuid()}`;
}

/**
 * Generates a short, unambiguous session code (Crockford-style base32, no
 * easily confused characters). Suitable as the shared pairing secret.
 */
export function generateRoomCode(length = 6): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet[values[i] % alphabet.length];
  }
  return code;
}

/**
 * Validates a room code against the format produced by {@link generateRoomCode}.
 * Used server-side to reject malformed channel scopes before minting a token.
 */
export function isValidRoomCode(room: string): boolean {
  return /^[A-HJ-NP-Z2-9]{4,12}$/.test(room);
}
