import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { accountCard, afterRemovalFocus, snapRemoval } from "./snapRemoval";

let frame: FrameRequestCallback;
let now = 0;
let reduced = false;
let motionChange: (() => void) | undefined;
const context = { scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), globalAlpha: 1, fillStyle: "" };
function card() {
  const section = document.createElement("section");
  section.innerHTML = '<article data-account-provider="codex" data-account-id="shared"><button>Dismiss</button></article><button>Next account</button>';
  document.body.append(section);
  const target = section.querySelector("article")!;
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 80, left: 15, width: 400, height: 160, right: 415, bottom: 240, x: 15, y: 80, toJSON: () => ({}) });
  return target;
}
beforeEach(() => {
  vi.useFakeTimers();
  now = 0; reduced = false;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduced; }, addEventListener: (_: string, callback: () => void) => { motionChange = callback; }, removeEventListener: vi.fn() }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

it("uses both provider and id to find a card, without interpreting account ids as selectors", () => {
  const target = card();
  target.dataset.accountId = 'id["]';
  const other = document.createElement("article");
  other.dataset.accountProvider = "claude"; other.dataset.accountId = target.dataset.accountId;
  document.body.prepend(other);
  expect(accountCard("codex", 'id["]')).toBe(target);
  expect(accountCard("antigravity", 'id["]')).toBeNull();
});

it.each(["keyboard", "reduced", "hidden", "no layout", "missing canvas"])("completes immediately with %s", async mode => {
  const target = card();
  reduced = mode === "reduced";
  if (mode === "hidden") vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  if (mode === "no layout") vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect());
  if (mode === "missing canvas") vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const complete = vi.fn();
  await snapRemoval(target, complete, { pointer: mode !== "keyboard" });
  expect(complete).toHaveBeenCalledOnce();
  expect(document.querySelector(".snap-removal-dust")).toBeNull();
  expect(target.inert).toBeFalsy();
});

it("commits once at the start, then dissolves an inaccessible copy", async () => {
  const target = card(); const complete = vi.fn(() => target.remove());
  target.style.maskImage = 'linear-gradient(black, black)';
  const originalMask = target.style.maskImage;
  const promise = snapRemoval(target, complete, { pointer: true });
  expect(target.inert).toBe(true);
  expect(snapRemoval(target, vi.fn(), { pointer: true })).toBe(promise);
  frame(0);
  expect(complete).toHaveBeenCalledOnce();
  expect(target).not.toBeInTheDocument();
  const layer = document.querySelector(".snap-removal-layer");
  expect(layer).toHaveAttribute("aria-hidden", "true");
  const copy = layer?.querySelector("article");
  expect(copy).not.toHaveAttribute("data-account-id");
  now = 120; frame(now);
  expect(copy?.style.clipPath).toContain("polygon(");
  expect(copy?.style.maskImage).toBe("");
  expect(context.fillRect).toHaveBeenCalled();
  now = 1161; frame(now); await promise;
  expect(complete).toHaveBeenCalledOnce();
  expect(target.style.maskImage).toBe(originalMask);
  expect(target.inert).toBeFalsy();
  expect(layer).not.toBeInTheDocument();
});

it("moves one image-free dissolve edge from left to right", async () => {
  const target = card();
  const complete = vi.fn(() => target.remove());
  const finished = snapRemoval(target, complete, { pointer: true });
  const encode = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");
  frame(0);
  const copy = document.querySelector<HTMLElement>(".snap-removal-card")!;
  const trail = () => Number.parseFloat(copy.style.getPropertyValue("--snap-trail"));
  expect(trail()).toBeLessThan(0);
  frame(366);
  expect(trail()).toBeGreaterThan(12.5);
  expect(trail()).toBeLessThan(50);
  frame(557);
  expect(trail()).toBeGreaterThan(50);
  expect(trail()).toBeLessThan(87.5);
  frame(748);
  expect(trail()).toBeGreaterThan(87.5);
  frame(771);
  expect(copy).not.toBeInTheDocument();
  expect(document.querySelector(".snap-removal-layer")).toBeInTheDocument();
  frame(1161);
  await finished;
  expect(complete).toHaveBeenCalledOnce();
  expect(encode).not.toHaveBeenCalled();
});

it("holds surviving cards and later provider groups until the painted card has dissolved", async () => {
  const target = card();
  const group = target.parentElement!;
  const followingCard = target.nextElementSibling!;
  const panel = document.createElement("main");
  panel.className = "home-accounts";
  const followingGroup = document.createElement("section");
  panel.append(group, followingGroup);
  document.body.append(panel);

  const trackMove = (node: Element, oldTop: number, newTop: number) => {
    vi.spyOn(node, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    vi.spyOn(node, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, target.isConnected ? oldTop : newTop, 400, 160));
    const animation = { cancel: vi.fn() };
    const animate = vi.fn(() => animation);
    Object.defineProperty(node, "animate", { value: animate });
    return { animate, animation };
  };
  const cardMove = trackMove(followingCard, 250, 80);
  const groupMove = trackMove(followingGroup, 420, 250);
  const complete = vi.fn(() => target.remove());
  const finished = snapRemoval(target, complete, { pointer: true });
  frame(0);
  expect(complete).toHaveBeenCalledOnce();
  expect(document.querySelector(".snap-removal-dust")).toBeInTheDocument();
  for (const { animate } of [cardMove, groupMove]) {
    expect(animate).toHaveBeenCalledWith([{ transform: "translateY(170px)" }, { transform: "translateY(0)" }],
      expect.objectContaining({ duration: 150, delay: 763, fill: "backwards" }));
  }
  window.dispatchEvent(new Event("blur"));
  await finished;
  expect(complete).toHaveBeenCalledOnce();
  expect(cardMove.animation.cancel).toHaveBeenCalledOnce();
  expect(groupMove.animation.cancel).toHaveBeenCalledOnce();
});

it("lets a closing sheet finish before painting the card, and finishes if frames stop", async () => {
  const target = card(); const complete = vi.fn();
  const promise = snapRemoval(target, complete, { pointer: true, delay: 220 });
  now = 150; frame(now);
  expect(target.style.maskImage).toBe("");
  expect(document.querySelector(".snap-removal-layer")).not.toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(1550); await promise;
  expect(complete).toHaveBeenCalledOnce();
  expect(document.querySelector("canvas")).toBeNull();
});

it("waits through sheet scroll restoration and measures the settled card", async () => {
  const target = card();
  const panel = document.createElement("main");
  panel.className = "home-accounts";
  target.parentElement!.replaceWith(panel);
  panel.append(target);
  const complete = vi.fn(() => target.remove());
  const promise = snapRemoval(target, complete, { pointer: true, delay: 220 });
  panel.dispatchEvent(new Event("scroll"));
  expect(complete).not.toHaveBeenCalled();
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(15, 120, 400, 160));
  frame(220);
  const ghost = document.querySelector<HTMLElement>(".snap-removal-card")!;
  expect(ghost.style.top).toBe("120px");
  // A closing modal's scroll is unrelated to the account viewport.
  window.dispatchEvent(new Event("scroll"));
  expect(ghost).toBeInTheDocument();
  panel.scrollTop = 10;
  panel.dispatchEvent(new Event("scroll"));
  await promise;
  expect(ghost).not.toBeInTheDocument();
  expect(complete).toHaveBeenCalledOnce();
});

it.each(["blur", "scroll", "pointer", "keyboard", "reduced", "detached", "paint failure"])("cleans up after %s and still applies the removal once", async mode => {
  const target = card(); const complete = vi.fn();
  const promise = snapRemoval(target, complete, { pointer: true });
  if (mode === "scroll") frame(0);
  if (mode === "blur" || mode === "scroll") window.dispatchEvent(new Event(mode));
  if (mode === "pointer") document.dispatchEvent(new Event("pointerdown"));
  if (mode === "keyboard") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  if (mode === "reduced") motionChange?.();
  if (mode === "detached") { target.remove(); frame(100); }
  if (mode === "paint failure") {
    context.clearRect.mockImplementationOnce(() => { throw new Error("unavailable"); });
    frame(100);
  }
  await promise; await vi.runAllTimersAsync();
  expect(complete).toHaveBeenCalledOnce();
  expect(target.inert).toBeFalsy();
  expect(document.querySelector("canvas")).toBeNull();
});

it("chooses the next surviving control after a removal", () => {
  const target = card();
  expect(afterRemovalFocus(target)).toBe(target.nextElementSibling);
});
