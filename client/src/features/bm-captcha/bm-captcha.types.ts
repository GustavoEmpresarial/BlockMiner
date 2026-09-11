export type BmCaptchaProvider = 'zerads' | 'offerwallme' | 'moneyrain' | 'multiwall' | 'offerwallgg';

export type BmCaptchaTile = {
  id: number;
  glyphSeed: string;
  hue: number;
  shape: number;
  rot: number;
};

export type BmCaptchaChallenge = {
  challengeId: string;
  purpose: string;
  provider: BmCaptchaProvider;
  expiresAt: number;
  dialSeed: string;
  dialPoints: Array<{ x: number; y: number }>;
  tiles: BmCaptchaTile[];
  targetTilePreview: BmCaptchaTile;
  pow: { difficulty: number; prefix: string };
  dialToleranceDeg: number;
};
