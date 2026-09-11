/**
 * Real user activation vs HTMLElement.click() / scripted dispatch.
 *
 * Browsers mark element.click() as isTrusted:true, so isTrusted alone is not enough.
 * Real clicks (and keyboard activation) leave a short-lived pointer/key gesture we can check.
 */

/** Max age of a pointerdown that may authorize a following click. */
export const POINTER_GESTURE_MAX_AGE_MS = 2500;

/** Max age of Enter/Space keydown that may authorize a following click (a11y). */
export const KEY_ACTIVATE_MAX_AGE_MS = 2500;

type PointerGesture = {
  at: number;
  x: number;
  y: number;
  target: EventTarget | null;
};

type KeyGesture = {
  at: number;
  target: EventTarget | null;
};

let lastPointer: PointerGesture | null = null;
let lastKeyActivate: KeyGesture | null = null;
let installed = false;

export function nodesRelated(a: EventTarget | null | undefined, b: EventTarget | null | undefined): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  if (typeof Node !== "undefined" && a instanceof Node && b instanceof Node) {
    try {
      return a.contains(b) || b.contains(a);
    } catch {
      return false;
    }
  }
  return false;
}

export function isActivateKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

/** Pure check — used by unit tests and validateTrustedEvent. */
export function hasRecentPointerGesture(
  target: EventTarget | null | undefined,
  now: number,
  gesture: PointerGesture | null,
  maxAgeMs: number = POINTER_GESTURE_MAX_AGE_MS,
): boolean {
  if (!gesture) return false;
  if (now - gesture.at > maxAgeMs) return false;
  if (!Number.isFinite(gesture.x) || !Number.isFinite(gesture.y)) return false;
  return nodesRelated(gesture.target, target);
}

export function hasRecentKeyActivate(
  target: EventTarget | null | undefined,
  now: number,
  gesture: KeyGesture | null,
  maxAgeMs: number = KEY_ACTIVATE_MAX_AGE_MS,
): boolean {
  if (!gesture) return false;
  if (now - gesture.at > maxAgeMs) return false;
  return nodesRelated(gesture.target, target);
}

export function hasRecentUserGesture(target: EventTarget | null | undefined, now: number = Date.now()): boolean {
  return (
    hasRecentPointerGesture(target, now, lastPointer) ||
    hasRecentKeyActivate(target, now, lastKeyActivate)
  );
}

function recordPointer(e: PointerEvent): void {
  if (!e.isTrusted) return;
  lastPointer = {
    at: Date.now(),
    x: e.clientX,
    y: e.clientY,
    target: e.target,
  };
}

function recordKey(e: KeyboardEvent): void {
  if (!e.isTrusted) return;
  if (!isActivateKey(e.key)) return;
  const t = e.target;
  if (!(t instanceof Element)) return;
  const tag = t.tagName;
  const role = t.getAttribute("role");
  const activatable =
    tag === "BUTTON" ||
    tag === "A" ||
    tag === "SUMMARY" ||
    role === "button" ||
    role === "link" ||
    (t instanceof HTMLInputElement && (t.type === "submit" || t.type === "button"));
  if (!activatable) return;
  lastKeyActivate = { at: Date.now(), target: t };
}

/** Idempotent capture-phase listeners on document. */
export function installPointerGestureTracker(): void {
  if (typeof document === "undefined" || installed) return;
  installed = true;
  document.addEventListener("pointerdown", recordPointer, true);
  document.addEventListener("keydown", recordKey, true);
}

/** Test helper — clears gesture memory (not for product UI). */
export function resetPointerGesturesForTests(): void {
  lastPointer = null;
  lastKeyActivate = null;
}

/** Test helper — inject a gesture without DOM events. */
export function seedPointerGestureForTests(gesture: PointerGesture | null): void {
  lastPointer = gesture;
}

export function seedKeyActivateForTests(gesture: KeyGesture | null): void {
  lastKeyActivate = gesture;
}
