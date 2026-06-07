"use server";

import * as Ably from "ably";
import { channelName, isValidRoomCode } from "@/lib/realtime/protocol";

/**
 * Input for {@link createRemoteToken}. The `clientId` lets Ably presence
 * distinguish the host from each remote within the same room.
 */
export interface CreateRemoteTokenInput {
  /** Session code, validated against the room-code format. */
  room: string;
  /** Stable per-client identifier used for presence. */
  clientId: string;
}

/**
 * Mints an Ably capability token scoped to a single session channel.
 *
 * The secret `ABLY_API_KEY` never leaves the server: the browser receives only
 * a short-lived signed TokenRequest restricted to `room:<code>` with publish,
 * subscribe and presence rights. This is the canonical "WebSockets without your
 * own backend" pattern — a Server Action handles auth, Ably handles transport.
 *
 * @throws If the API key is missing or the room code is malformed.
 */
export async function createRemoteToken(
  input: CreateRemoteTokenInput
): Promise<Ably.TokenRequest> {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ABLY_API_KEY no está configurada. Define la variable de entorno para habilitar el control remoto."
    );
  }

  const room = input.room.trim().toUpperCase();
  if (!isValidRoomCode(room)) {
    throw new Error("Código de sala inválido.");
  }

  const clientId = input.clientId.trim();
  if (!clientId) {
    throw new Error("clientId requerido para la presencia de la sesión.");
  }

  const rest = new Ably.Rest({ key: apiKey });

  return rest.auth.createTokenRequest({
    clientId,
    capability: {
      [channelName(room)]: ["publish", "subscribe", "presence"],
    },
    // Short-lived: sessions are ephemeral; the SDK auto-renews via authCallback.
    ttl: 60 * 60 * 1000,
  });
}
