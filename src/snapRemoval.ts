import { flushSync } from "react-dom";

const running = new WeakMap<HTMLElement, Promise<void>>();
const DURATION = 1160;
const SWEEP = 0.51;
const CELL_FADE = 0.12;
const EDGE_JITTER = 0.055;
const MASK_END = SWEEP + CELL_FADE + EDGE_JITTER / 2;
// Keep the gap until the painted card is gone; moving underneath an opaque
// outgoing card makes the surviving cards appear to jump through each other.
const LAYOUT_DELAY = Math.ceil(DURATION * MASK_END);
const LAYOUT_DURATION = 150;
const MARGIN = 56;
const AREA_PER_PARTICLE = 28;
const MAX_PARTICLES = 2400;

const edgeWave = (x: number, y: number) => 0.035 * Math.sin(14 * y + 8 * x) + 0.018 * Math.sin(23 * y - 5 * x);

function paintDissolveEdge(card: HTMLElement, progress: number) {
  // Keep one CSS gradient and update its stops. Swapping image URLs can expose an undecoded mask.
  const front = (progress - EDGE_JITTER / 2) / SWEEP;
  card.style.setProperty("--snap-front", `${front * 100}%`);
  card.style.setProperty("--snap-trail", `${(front - CELL_FADE / SWEEP) * 100}%`);
  const points = Array.from({ length: 33 }, (_, row) => {
    const y = 1 - row / 32;
    const x = front - (edgeWave(front, y) + CELL_FADE * 0.72) / SWEEP;
    return `${Math.max(0, Math.min(100, x * 100)).toFixed(2)}% ${y * 100}%`;
  });
  card.style.clipPath = `polygon(100% 0%, 100% 100%, ${points.join(", ")})`;
}

export function accountCard(provider: string, id: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-account-provider][data-account-id]"))
    .find(card => card.dataset.accountProvider === provider && card.dataset.accountId === id) ?? null;
}

export function afterRemovalFocus(target: HTMLElement): HTMLElement | null {
  const scope = target.closest("section") ?? target.parentElement;
  const controls = Array.from(scope?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])
    .filter(button => !target.contains(button) && !button.closest("[inert]"));
  return controls.find(button => target.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
    ?? controls[controls.length - 1] ?? document.querySelector<HTMLElement>(".home-header .home-settings");
}

/** Measure disjoint siblings, including other provider groups when the last card is removed. */
function captureNeighbors(target: HTMLElement, panel: HTMLElement | null) {
  const positions = new Map<Element, number>();
  for (let child: Element = target; child.parentElement && child !== panel; child = child.parentElement) {
    for (const sibling of child.parentElement.children) {
      if (sibling === child || !sibling.getClientRects().length) continue;
      positions.set(sibling, sibling.getBoundingClientRect().top);
    }
    if (!panel) break;
  }
  return positions;
}

/** A painted copy keeps the outgoing card in view while the real list can reflow. */
function createExitLayer(target: HTMLElement, bounds: DOMRect, panel: HTMLElement | null) {
  const layer = document.createElement("div");
  layer.className = "snap-removal-layer home-accounts workspace-accounts";
  layer.inert = true;
  layer.setAttribute("aria-hidden", "true");
  if (panel) {
    const viewport = panel.getBoundingClientRect();
    layer.style.clipPath = `inset(${Math.max(0, viewport.top)}px 0 ${Math.max(0, window.innerHeight - viewport.bottom)}px 0)`;
  }

  const ghost = target.cloneNode(true) as HTMLElement;
  ghost.classList.add("snap-removal-card");
  ghost.style.removeProperty("mask-image");
  ghost.style.removeProperty("-webkit-mask-image");
  ghost.removeAttribute("id");
  ghost.removeAttribute("data-account-id");
  ghost.removeAttribute("data-account-provider");
  ghost.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  ghost.querySelectorAll("a, button, input, select, textarea, summary, [tabindex]").forEach(node => node.setAttribute("tabindex", "-1"));
  Object.assign(ghost.style, {
    position: "absolute", left: `${bounds.left}px`, top: `${bounds.top}px`,
    width: `${bounds.width}px`, height: `${bounds.height}px`, margin: "0",
    transform: "none", translate: "none",
  });
  paintDissolveEdge(ghost, 0);
  layer.append(ghost);
  // Keep #root's theme tokens and the home card selectors in both appearances.
  (panel?.parentElement ?? document.body).append(layer);
  return { layer, ghost };
}

/** Commit the removal once; the visual exit can finish or be interrupted independently. */
export function snapRemoval(node: HTMLElement | null, complete: () => void, { pointer, delay = 0 }: { pointer: boolean; delay?: number }): Promise<void> {
  if (node && running.has(node)) return running.get(node)!;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const bounds = node?.getBoundingClientRect();
  if (!node || !pointer || document.documentElement.dataset.keyboard === "true" || reduce?.matches || document.hidden || !bounds?.width || !bounds.height
    || bounds.bottom <= 0 || bounds.top >= window.innerHeight) {
    complete();
    return Promise.resolve();
  }

  const target = node;
  const panel = target.closest<HTMLElement>(".home-accounts");
  const wasInert = target.inert;
  const layoutAnimations: Animation[] = [];
  let layer: HTMLElement | undefined;
  let frame = 0;
  let timeout = 0;
  let ended = false;
  let committed = false;
  let started = false;
  let expectedScroll = panel?.scrollTop;
  let resolve!: () => void;
  const finished = new Promise<void>(done => { resolve = done; });
  running.set(target, finished);

  const commit = () => {
    if (committed) return;
    committed = true;
    complete();
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(frame);
    window.clearTimeout(timeout);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", finish);
    window.removeEventListener("resize", finish);
    window.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("keydown", finish, true);
    document.removeEventListener("pointerdown", finish, true);
    reduce?.removeEventListener?.("change", finish);
    layoutAnimations.forEach(animation => animation.cancel());
    layer?.remove();
    target.inert = wasInert;
    running.delete(target);
    try { commit(); } finally { resolve(); }
  };
  const onVisibility = () => { if (document.hidden) finish(); };
  const onScroll = (event: Event) => {
    // Closing sheets restore focus and scroll before the exit is painted. Only
    // movement of the card's own viewport can invalidate a painted exit.
    if (!started || (panel && event.target !== panel)) return;
    // A shorter list can clamp its scroll position as part of the removal itself.
    if (event.target !== panel || panel?.scrollTop !== expectedScroll) finish();
  };

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) { finish(); return finished; }

    const style = getComputedStyle(target);
    const ink = getComputedStyle(target.querySelector(".workspace-account-title, .codex-reset-head") ?? target).color;
    const accent = getComputedStyle(target.querySelector(".account-monogram, .codex-reset-mark") ?? target).color;
    const colors = [style.backgroundColor, ink, accent];
    const easing = style.getPropertyValue("--ease-in-out").trim() || "ease-in-out";
    const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;
    let seed = 731;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const particleRadius = Math.min(radius, bounds.width / 2, bounds.height / 2);
    const particleCount = Math.min(MAX_PARTICLES, Math.ceil(bounds.width * bounds.height / AREA_PER_PARTICLE));
    const particles = Array.from({ length: particleCount }, () => {
      const x = random() * bounds.width;
      const y = random() * bounds.height;
      const cornerX = Math.max(particleRadius - x, x - (bounds.width - particleRadius), 0);
      const cornerY = Math.max(particleRadius - y, y - (bounds.height - particleRadius), 0);
      const fractionX = x / bounds.width;
      const fractionY = y / bounds.height;
      // Nearby specks loosen in small clouds instead of all releasing in one moving column.
      const cloudDelay = 0.065 * (1 + Math.sin(fractionX * 27 + fractionY * 17));
      const start = Math.max(0, fractionX * SWEEP + edgeWave(fractionX, fractionY) + cloudDelay + random() * 0.16);
      const tone = random();
      return {
        x, y, start,
        visible: Math.hypot(cornerX, cornerY) <= particleRadius,
        lifetime: Math.min(1 - start, 0.24 + random() * 0.19),
        lift: 9 + random() * 19,
        phase: random() * Math.PI * 2,
        turn: (random() < 0.5 ? -1 : 1) * (7 + random() * 6),
        eddy: 4 + random() * 8,
        size: 0.55 + random() * 1.2,
        color: colors[tone < 0.58 ? 0 : tone < 0.92 ? 1 : 2],
        opacity: tone < 0.58 ? 0.55 : 0.25,
      };
    }).filter(particle => particle.visible);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = bounds.width + MARGIN * 2;
    const height = bounds.height + MARGIN * 2;
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    canvas.className = "snap-removal-dust";
    Object.assign(canvas.style, {
      position: "absolute", left: `${bounds.left - MARGIN}px`, top: `${bounds.top - MARGIN}px`,
      width: `${width}px`, height: `${height}px`,
    });
    context.scale(dpr, dpr);

    target.inert = true;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", finish);
    window.addEventListener("resize", finish);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", finish, true);
    document.addEventListener("pointerdown", finish, true);
    reduce?.addEventListener?.("change", finish);
    timeout = window.setTimeout(finish, delay + DURATION + 150);

    const readyAt = performance.now() + delay;
    let startedAt: number | undefined;
    let ghost: HTMLElement;
    const draw = (time: number) => {
      if (time < readyAt) { frame = requestAnimationFrame(drawSafely); return; }
      if (startedAt === undefined) {
        if (!target.isConnected) { finish(); return; }
        // Focus restoration can move the list while the sheet is closing.
        // The initial bounds were only an eligibility check, not an exit position.
        const exitBounds = target.getBoundingClientRect();
        if (!exitBounds.width || !exitBounds.height || exitBounds.bottom <= 0 || exitBounds.top >= window.innerHeight) { finish(); return; }
        const neighbors = captureNeighbors(target, panel);
        ({ layer, ghost } = createExitLayer(target, exitBounds, panel));
        canvas.style.left = `${exitBounds.left - MARGIN}px`;
        canvas.style.top = `${exitBounds.top - MARGIN}px`;
        layer.append(canvas);
        flushSync(commit);
        expectedScroll = panel?.scrollTop;
        // The UI is already in its final layout. Play from the old positions on the same frame.
        const moves = Array.from(neighbors, ([element, top]) => ({ element, top }))
          .filter(({ element }) => element.isConnected && typeof element.animate === "function")
          .map(({ element, top }) => ({ element, offset: top - element.getBoundingClientRect().top }));
        for (const { element, offset } of moves) {
          if (Math.abs(offset) < 1) continue;
          layoutAnimations.push(element.animate([{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }], {
            duration: LAYOUT_DURATION, delay: LAYOUT_DELAY, easing, fill: "backwards",
          }));
        }
        startedAt = time;
        started = true;
      }

      const progress = (time - startedAt) / DURATION;
      if (progress >= 1) { finish(); return; }
      if (progress >= MASK_END) ghost.remove();
      else {
        paintDissolveEdge(ghost, progress);
        ghost.style.opacity = String(1 - progress * 0.36);
      }
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        const age = (progress - particle.start) / particle.lifetime;
        if (age < 0 || age >= 1) continue;
        const angle = particle.phase + particle.turn * age;
        const spread = particle.eddy * Math.min(1, age * 4);
        const x = particle.x + Math.sin(angle) * spread;
        const y = particle.y - particle.lift * age + Math.cos(angle) * spread * 0.6;
        const fadeIn = Math.min(1, age / 0.18);
        const fade = fadeIn * fadeIn * (3 - 2 * fadeIn) * (1 - age) ** 2;
        const size = particle.size * (1 - age * 0.7);
        context.globalAlpha = fade * particle.opacity;
        context.fillStyle = particle.color;
        context.fillRect(MARGIN + x, MARGIN + y, size, size);
      }
      frame = requestAnimationFrame(drawSafely);
    };
    const drawSafely = (time: number) => {
      try { draw(time); } catch { finish(); }
    };
    frame = requestAnimationFrame(drawSafely);
  } catch { finish(); }
  return finished;
}
