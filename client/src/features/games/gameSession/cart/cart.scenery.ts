import type { SceneryItem } from "../lib/gameSession.types";
import { CART_LOGICAL_HEIGHT, CART_LOGICAL_WIDTH } from "./cart.constants";

export function initCartScenery(): SceneryItem[] {
  const items: SceneryItem[] = [];
  for (let i = 0; i < 8; i++) {
    items.push({
      x: Math.random() * CART_LOGICAL_WIDTH,
      y: 60 + Math.random() * 80,
      speedFactor: 0.08 + Math.random() * 0.06,
      size: 50 + Math.random() * 40,
      type: "mountain",
    });
  }
  for (let i = 0; i < 14; i++) {
    const top = Math.random() < 0.5;
    items.push({
      x: Math.random() * CART_LOGICAL_WIDTH,
      y: top ? 40 + Math.random() * 30 : CART_LOGICAL_HEIGHT - 50 + Math.random() * 20,
      speedFactor: 0.7 + Math.random() * 0.2,
      size: 16 + Math.random() * 12,
      type: Math.random() < 0.55 ? "tree" : "pole",
    });
  }
  return items.sort((a, b) => a.speedFactor - b.speedFactor);
}

export function tickCartScenery(
  items: SceneryItem[],
  deltaSeconds: number,
  scrollSpeed: number,
): void {
  for (const item of items) {
    item.x -= scrollSpeed * item.speedFactor * deltaSeconds;
    if (item.x < -item.size * 2) {
      item.x = CART_LOGICAL_WIDTH + item.size;
    }
  }
}
