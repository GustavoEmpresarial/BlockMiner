/** Challenge / pass shapes — canvas click-to-find captcha. */
import type { BmCaptchaProvider } from "./bm-captcha.config.js";

export type BmCaptchaPurpose = "offerwall_external";

/** Public sprite — no isTarget flag. */
export type BmCaptchaSpritePublic = {
  id: number;
  /** Shape family 0..5 (crystal, hex, star, ring, bolt, shard). */
  family: number;
  /** Morph variant 0..3 — anti-pattern deformation. */
  morph: number;
  x: number;
  y: number;
  scale: number;
  rot: number;
  hue: number;
  sat: number;
  lit: number;
  glow: number;
};

export type BmCaptchaChallengePublic = {
  kind: "canvas_click";
  challengeId: string;
  purpose: BmCaptchaPurpose;
  provider: BmCaptchaProvider;
  expiresAt: number;
  canvasSize: number;
  findCount: number;
  sample: Omit<BmCaptchaSpritePublic, "id" | "x" | "y">;
  sprites: BmCaptchaSpritePublic[];
  sceneSeed: string;
  pow: { difficulty: number; prefix: string };
};

export type BmCaptchaChallengeSecret = {
  challengeId: string;
  userId: number;
  purpose: BmCaptchaPurpose;
  provider: BmCaptchaProvider;
  createdAt: number;
  expiresAt: number;
  targetIds: number[];
  targetSig: string;
  canvasSize: number;
  powDifficulty: number;
  powPrefix: string;
  attempts: number;
  solved: boolean;
  dialTargetDeg: number;
  correctTileId: number;
  code: string;
};

export type BmCaptchaPassRecord = {
  passId: string;
  userId: number;
  purpose: BmCaptchaPurpose;
  provider: BmCaptchaProvider;
  createdAt: number;
  expiresAt: number;
  consumed: boolean;
};

export type BmCaptchaClick = {
  id?: number;
  x: number;
  y: number;
  t: number;
};

export type BmCaptchaVerifyBody = {
  challengeId: string;
  clicks: BmCaptchaClick[];
  powCounter: number;
};
