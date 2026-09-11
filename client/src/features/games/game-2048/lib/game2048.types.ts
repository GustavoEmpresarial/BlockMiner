import type { Board2048 } from "@game2048/engine";

export interface Game2048Session {
  id: string;
  status: string;
  gameOver: boolean;
  board?: Board2048 | null;
  score?: number | string | null;
  timeLimitSeconds?: number | null;
  secondsRemaining?: number | null;
  canClaim?: boolean;
  won?: boolean;
  hasMoves?: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface Game2048StatusResponse {
  ok: boolean;
  allowNewStart?: boolean;
  cooldownSecondsRemaining?: number;
  activeSession?: Game2048Session | null;
}

export interface Game2048StartResponse {
  ok?: boolean;
  code?: string;
  session?: Game2048Session;
}

export interface Game2048MoveResponse {
  ok?: boolean;
  code?: string;
  session?: Game2048Session;
}
