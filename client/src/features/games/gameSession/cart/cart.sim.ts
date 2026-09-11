import { clampCartLane } from "../lib/gameSession.utils";
import type { CartServerEvent, CartStateRef } from "../lib/gameSession.types";
import { CART_LOGICAL_WIDTH } from "./cart.constants";

/** Interpolate server events and lane physics for one frame. */
export function advanceCartSimulation(
  state: CartStateRef,
  deltaSeconds: number,
  now: number,
): { roadPixelsPerSecond: number } {
  const serverRoadSpeed = Number(state.roadSpeed) || 0.48;
  const roadPixelsPerSecond = 120 + serverRoadSpeed * 100;

  state.roadOffset =
    ((Number(state.roadOffset) || 0) + roadPixelsPerSecond * deltaSeconds) % CART_LOGICAL_WIDTH;

  if (!state.localEvents) state.localEvents = [];

  if (state.lastProcessedUpdate !== state.lastServerUpdateAt) {
    state.lastProcessedUpdate = state.lastServerUpdateAt;
    const localMap = new Map(state.localEvents.map((e) => [e.id, e]));
    const merged: CartServerEvent[] = [];

    for (const sEvt of state.events || []) {
      if (!sEvt.id) {
        merged.push({ ...sEvt });
        continue;
      }
      const lEvt = localMap.get(sEvt.id);
      if (lEvt) {
        if (Math.abs(Number(sEvt.progress) - Number(lEvt.progress)) > 0.4) {
          lEvt.progress = sEvt.progress;
        }
        lEvt.serverProgress = sEvt.progress;
        lEvt.speed = sEvt.speed;
        lEvt.lane = sEvt.lane;
        merged.push(lEvt);
      } else {
        const elapsed = (now - state.lastServerUpdateAt) / 1000;
        const startProgress =
          (sEvt.progress ?? 0) + elapsed * (Number(sEvt.speed) || serverRoadSpeed);
        merged.push({ ...sEvt, serverProgress: sEvt.progress, progress: startProgress });
      }
    }
    state.localEvents = merged;
  }

  const elapsedSinceUpdate = (now - state.lastServerUpdateAt) / 1000;
  for (const e of state.localEvents) {
    const speed = Number(e.speed) || serverRoadSpeed;
    const target = (Number(e.serverProgress) || 0) + elapsedSinceUpdate * speed;
    const current = Number(e.progress) || 0;
    e.progress = current + (target - current) * (1 - Math.exp(-12 * deltaSeconds));
  }

  const lanes = Math.max(3, Number(state.lanes) || 3);
  const carLane = clampCartLane(Number(state.lane) || 0, lanes);
  if (state.physX === undefined) {
    state.physX = carLane;
    state.physVx = 0;
  }
  const prevPhysX = state.physX;
  state.physX = prevPhysX + (carLane - prevPhysX) * Math.min(1, 9 * deltaSeconds);
  state.physVx = (state.physX - prevPhysX) / Math.max(deltaSeconds, 0.001);
  state.renderLane = state.physX;

  return { roadPixelsPerSecond };
}
