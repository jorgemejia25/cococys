"use client";

import * as Ably from "ably";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRemoteToken } from "@/app/remote/actions";
import {
  COMMAND_EVENT,
  STATE_EVENT,
  channelName,
  generateClientId,
  type ConnectionStatus,
  type DeckState,
  type NavCommand,
  type RemoteRole,
} from "./protocol";

interface UseRemoteChannelOptions {
  /** Session code; the hook stays idle while `null`. */
  room: string | null;
  /** Whether this client is the presenter screen or the phone remote. */
  role: RemoteRole;
  /** Invoked on the host when a remote publishes a navigation command. */
  onCommand?: (command: NavCommand) => void;
  /** Invoked on the remote when the host broadcasts a deck snapshot. */
  onState?: (state: DeckState) => void;
}

interface UseRemoteChannelResult {
  /** Live connection status of the underlying Ably realtime client. */
  status: ConnectionStatus;
  /** Whether a client of the opposite role is currently present in the room. */
  peerPresent: boolean;
  /** Publishes a navigation command (used by the remote). */
  sendCommand: (command: NavCommand) => void;
  /** Publishes a deck snapshot (used by the host). */
  sendState: (state: DeckState) => void;
}

const PRESENCE_ACTIONS = new Set<Ably.PresenceAction>([
  "enter",
  "present",
  "update",
]);

/**
 * Connects to the per-session Ably channel and exposes role-aware messaging.
 *
 * The connection is authenticated through the {@link createRemoteToken} Server
 * Action via Ably's `authCallback`, so the API secret never reaches the client.
 * Command/state callbacks are read through refs to keep the subscription stable
 * across re-renders.
 */
export function useRemoteChannel(
  options: UseRemoteChannelOptions
): UseRemoteChannelResult {
  const { room, role } = options;

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [peerPresent, setPeerPresent] = useState(false);

  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const onCommandRef = useRef(options.onCommand);
  const onStateRef = useRef(options.onState);
  const [clientId] = useState(() => generateClientId(role));

  // Keep the latest callbacks reachable from the long-lived message handlers
  // without re-subscribing on every render.
  useEffect(() => {
    onCommandRef.current = options.onCommand;
    onStateRef.current = options.onState;
  });

  useEffect(() => {
    if (!room) return;

    const peerRole: RemoteRole = role === "host" ? "remote" : "host";

    const client = new Ably.Realtime({
      clientId,
      authCallback: (_params, callback) => {
        createRemoteToken({ room, clientId })
          .then((tokenRequest) => callback(null, tokenRequest))
          .catch((error: unknown) =>
            callback(error instanceof Error ? error.message : "auth_failed", null)
          );
      },
    });

    const mapState = (state: Ably.ConnectionState): ConnectionStatus => {
      switch (state) {
        case "connected":
          return "connected";
        case "failed":
        case "suspended":
          return "failed";
        case "closed":
        case "closing":
        case "disconnected":
          return "disconnected";
        default:
          return "connecting";
      }
    };

    client.connection.on((change) => setStatus(mapState(change.current)));

    const channel = client.channels.get(channelName(room));
    channelRef.current = channel;

    const eventName = role === "host" ? COMMAND_EVENT : STATE_EVENT;
    const handleMessage = (message: Ably.InboundMessage) => {
      if (role === "host") {
        onCommandRef.current?.(message.data as NavCommand);
      } else {
        onStateRef.current?.(message.data as DeckState);
      }
    };

    const refreshPeerPresence = async () => {
      try {
        const members = await channel.presence.get();
        setPeerPresent(members.some((m) => m.clientId?.startsWith(peerRole)));
      } catch {
        // Presence read can fail transiently during (re)connection; ignore.
      }
    };

    const handlePresence = (member: Ably.PresenceMessage) => {
      if (!member.clientId?.startsWith(peerRole)) return;
      setPeerPresent(PRESENCE_ACTIONS.has(member.action));
    };

    channel.subscribe(eventName, handleMessage).catch(() => undefined);
    channel.presence.subscribe(handlePresence).catch(() => undefined);
    channel.presence
      .enter({ role })
      .then(refreshPeerPresence)
      .catch(() => undefined);

    return () => {
      channel.unsubscribe(eventName, handleMessage);
      channel.presence.unsubscribe(handlePresence);
      void channel.presence.leave().catch(() => undefined);
      client.close();
      channelRef.current = null;
    };
  }, [room, role, clientId]);

  const sendCommand = useCallback((command: NavCommand) => {
    channelRef.current?.publish(COMMAND_EVENT, command).catch(() => undefined);
  }, []);

  const sendState = useCallback((state: DeckState) => {
    channelRef.current?.publish(STATE_EVENT, state).catch(() => undefined);
  }, []);

  return { status, peerPresent, sendCommand, sendState };
}
