"use client";

import { useCallback, type RefObject } from "react";

/**
 * The subset of the `deck-stage` web component's public API used to drive
 * navigation from outside the presentation iframe.
 */
interface DeckStageElement extends Element {
  goTo?: (index: number) => void;
  next?: () => void;
  prev?: () => void;
  reset?: () => void;
}

/** Imperative navigation surface for a loaded presentation deck. */
export interface DeckController {
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
}

/**
 * Wraps a presentation `<iframe>` and returns a stable controller that proxies
 * navigation to the embedded `deck-stage` element.
 *
 * All calls are no-ops until the iframe has loaded a deck (and silently fail if
 * same-origin access is unavailable), so callers can invoke them freely without
 * guarding against load timing.
 */
export function useDeckController(
  iframeRef: RefObject<HTMLIFrameElement | null>
): DeckController {
  const getStage = useCallback((): DeckStageElement | null => {
    try {
      return (
        (iframeRef.current?.contentWindow?.document.querySelector(
          "deck-stage"
        ) as DeckStageElement | null) ?? null
      );
    } catch {
      return null;
    }
  }, [iframeRef]);

  const goTo = useCallback(
    (index: number) => {
      getStage()?.goTo?.(index);
    },
    [getStage]
  );

  const next = useCallback(() => {
    getStage()?.next?.();
  }, [getStage]);

  const prev = useCallback(() => {
    getStage()?.prev?.();
  }, [getStage]);

  const reset = useCallback(() => {
    getStage()?.reset?.();
  }, [getStage]);

  return { goTo, next, prev, reset };
}
