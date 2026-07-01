/**
 * Laser cursor overlay for a presentation iframe.
 *
 * Injects a bright laser pointer into the deck document and hides the native
 * cursor while the pointer is over the slides. The dot has a white-hot core
 * with a soft red glow that breathes gently — crisp and glued to the pointer,
 * with no trailing comet. Clicks pass through (pointer-events: none) so slide
 * interactions and keyboard focus are kept.
 *
 * Returns a cleanup function that removes the overlay, styles and listeners.
 */
export function enableLaserCursor(doc: Document): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};

  const NS = "cc-laser";

  const style = doc.createElement("style");
  style.id = `${NS}-style`;
  style.textContent = `
    .${NS}-on, .${NS}-on * { cursor: none !important; }
    .${NS} {
      position: fixed; top: 0; left: 0; z-index: 2147483000;
      pointer-events: none; width: 0; height: 0;
      will-change: transform;
    }
    .${NS} > span {
      position: absolute; top: 0; left: 0; border-radius: 999px;
      transform: translate(-50%, -50%);
    }
    .${NS}-glow {
      width: 96px; height: 96px;
      background: radial-gradient(circle,
        rgba(255,72,72,0.40) 0%,
        rgba(255,60,60,0.16) 38%,
        rgba(255,60,60,0) 72%);
      animation: ${NS}-breathe 1.9s ease-in-out infinite;
    }
    .${NS}-halo {
      width: 26px; height: 26px;
      background: radial-gradient(circle,
        rgba(255,96,96,0.92) 0%,
        rgba(255,52,52,0.50) 55%,
        rgba(255,52,52,0) 100%);
    }
    .${NS}-head {
      width: 11px; height: 11px;
      background: radial-gradient(circle,
        #ffffff 0%,
        #ffd6d6 22%,
        #ff3434 62%,
        #c41414 100%);
      box-shadow:
        0 0 4px 1px rgba(255,255,255,0.95),
        0 0 10px 3px rgba(255,52,52,0.95),
        0 0 22px 7px rgba(255,52,52,0.55),
        0 0 46px 15px rgba(255,60,60,0.30);
    }
    @keyframes ${NS}-breathe {
      0%, 100% { transform: translate(-50%, -50%) scale(0.88); opacity: 0.70; }
      50%      { transform: translate(-50%, -50%) scale(1.14); opacity: 1; }
    }
  `;
  doc.head.appendChild(style);

  const root = doc.createElement("div");
  root.className = NS;
  root.setAttribute("aria-hidden", "true");
  root.style.display = "none";

  const glow = doc.createElement("span");
  glow.className = `${NS}-glow`;
  const halo = doc.createElement("span");
  halo.className = `${NS}-halo`;
  const head = doc.createElement("span");
  head.className = `${NS}-head`;
  root.append(glow, halo, head);
  doc.body.appendChild(root);

  doc.documentElement.classList.add(`${NS}-on`);

  let visible = false;

  const onMove = (e: MouseEvent) => {
    root.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    if (!visible) {
      visible = true;
      root.style.display = "";
    }
  };

  const onLeave = () => {
    visible = false;
    root.style.display = "none";
  };

  win.addEventListener("mousemove", onMove, { passive: true });
  doc.documentElement.addEventListener("mouseleave", onLeave);
  win.addEventListener("blur", onLeave);

  return () => {
    win.removeEventListener("mousemove", onMove);
    doc.documentElement.removeEventListener("mouseleave", onLeave);
    win.removeEventListener("blur", onLeave);
    root.remove();
    style.remove();
    doc.documentElement.classList.remove(`${NS}-on`);
  };
}
