import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Subscribes to viewport changes around the mobile breakpoint.
 *
 * Implemented with `useSyncExternalStore` so the value is read directly from
 * the media query without synchronous state updates inside an effect, and
 * resolves to `false` during server rendering.
 */
function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
