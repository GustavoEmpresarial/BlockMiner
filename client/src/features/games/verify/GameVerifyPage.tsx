/**
 * RollerCoin-style post-match page at /games/verify.
 * Game pages save a hand-off record and navigate here when a match ends.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { api } from "../../../shared/auth/auth.store";
import { setGameCooldown } from "../lib/gameCooldownStore";
import type { GameFlowResolution } from "../lib/finish/types";
import {
  clearGameVerifyRecord,
  loadGameVerifyRecord,
  updateGameVerifyRecord,
  type GameVerifyClaim,
  type GameVerifyRecord,
} from "../lib/finish/gameVerifyStorage";
import { isGameSecurityRejectCode, resolveGameFinishReasonMessage } from "../lib/finish/gameSecurityReject";
import { t } from "../lib/games.i18n";
import { ResultScene, SubmittingScene } from "./GameVerifyScenes";
import { fetchGameTurnstileStatus, submitGameTurnstilePass } from "../lib/gameTurnstileStatus";
import { GameTurnstileModal } from "../components/GameTurnstileModal";

const VALIDATION_MS = 10000;

const FALLBACK_FAILURE: GameFlowResolution = {
  outcome: "failure",
  rewardMessage: null,
  cooldownSeconds: 0,
  reasonKey: null,
  reasonMessage: null,
};

interface Game2048ClaimResponse {
  ok?: boolean;
  code?: string;
  message?: string;
  messageCode?: string;
  captchaRequired?: boolean;
  idempotent?: boolean;
  rewardPowerHours?: number | null;
  rewardHashRate?: number | string;
  rewardPowerDays?: number | null;
  powerDays?: number | null;
  cooldownSecondsRemaining?: number;
}

function resolutionFromDenyPayload(
  data: { message?: string; messageCode?: string; code?: string; cooldownSecondsRemaining?: number } | null | undefined,
): GameFlowResolution {
  const reasonKey = data?.messageCode || data?.code || null;
  return {
    outcome: isGameSecurityRejectCode(reasonKey) ? "rejected" : "failure",
    rewardMessage: null,
    cooldownSeconds: Math.max(0, Number(data?.cooldownSecondsRemaining) || 0),
    reasonKey,
    reasonMessage: resolveGameFinishReasonMessage(t, data),
  };
}

async function runClaim(
  claim: GameVerifyClaim,
  opts?: { cfTurnstileToken?: string },
): Promise<GameFlowResolution> {
  if (claim.kind !== "game2048") return FALLBACK_FAILURE;
  try {
    const { postGameAntibotTelemetry } = await import("../lib/gamesAntibotTelemetry");
    postGameAntibotTelemetry("block-2048", "claim");
    const body: { sessionId: number; cfTurnstileToken?: string } = {
      sessionId: claim.sessionId,
    };
    const token = String(opts?.cfTurnstileToken || "").trim();
    if (token) body.cfTurnstileToken = token;
    const { data } = await api.post<Game2048ClaimResponse>("/games/2048/claim", body);
    if (!data?.ok) return resolutionFromDenyPayload(data);
    const rewardText =
      data.rewardPowerHours != null && Number(data.rewardPowerHours) > 0
        ? t("game2048.claimed_toast_hours", { hr: data.rewardHashRate, hours: data.rewardPowerHours })
        : t("game2048.claimed_toast", { hr: data.rewardHashRate, days: data.rewardPowerDays ?? data.powerDays });
    return {
      outcome: "success",
      rewardMessage: rewardText,
      cooldownSeconds: Math.max(0, Number(data.cooldownSecondsRemaining) || 0),
    };
  } catch (err: unknown) {
    const ax = err as { response?: { data?: Game2048ClaimResponse } };
    if (ax?.response?.data) return resolutionFromDenyPayload(ax.response.data);
    return FALLBACK_FAILURE;
  }
}

function secondsLeft(until: number | null | undefined): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export default function GameVerifyPage() {
  const navigate = useNavigate();

  const [record, setRecord] = useState<GameVerifyRecord | null>(() => loadGameVerifyRecord());
  const alreadyValidated = Boolean(record?.validatedAt && record?.resolution);
  const [phase, setPhase] = useState<"validating" | "result" | "captcha">(
    alreadyValidated ? "result" : "validating",
  );
  const [progress, setProgress] = useState(alreadyValidated ? 1 : 0);
  const [cooldownSec, setCooldownSec] = useState(() => secondsLeft(record?.cooldownUntil));
  const claimPromiseRef = useRef<Promise<GameFlowResolution> | null>(null);
  const pendingClaimRef = useRef<GameVerifyClaim | null>(null);

  useEffect(() => {
    if (!record) navigate("/games", { replace: true });
  }, [record, navigate]);

  useEffect(() => {
    if (record?.gameKey && record.cooldownUntil) {
      setGameCooldown(record.gameKey, secondsLeft(record.cooldownUntil));
    }
  }, [record?.gameKey, record?.cooldownUntil]);

  useEffect(() => {
    if (!record || phase !== "validating") return undefined;
    let cancelled = false;
    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      if (!cancelled) setProgress(Math.min(1, (Date.now() - startedAt) / VALIDATION_MS));
    }, 80);

    const resolve = async (): Promise<GameFlowResolution | "need_captcha"> => {
      if (record.resolution) return record.resolution;
      if (record.claim) {
        if (record.claim.kind === "game2048") {
          const status = await fetchGameTurnstileStatus();
          if (status.required) {
            pendingClaimRef.current = record.claim;
            return "need_captcha";
          }
        }
        if (!claimPromiseRef.current) claimPromiseRef.current = runClaim(record.claim);
        const resolution = await claimPromiseRef.current;
        if (
          resolution.reasonKey === "captcha_required" ||
          resolution.reasonKey === "CAPTCHA_REQUIRED"
        ) {
          pendingClaimRef.current = record.claim;
          claimPromiseRef.current = null;
          return "need_captcha";
        }
        return resolution;
      }
      return FALLBACK_FAILURE;
    };

    void resolve()
      .catch(() => FALLBACK_FAILURE as GameFlowResolution)
      .then((resolution) => {
        if (resolution === "need_captcha") {
          if (!cancelled) {
            window.clearInterval(timer);
            setPhase("captcha");
          }
          return;
        }
        const remaining = Math.max(0, VALIDATION_MS - (Date.now() - startedAt));
        window.setTimeout(() => {
          if (cancelled) return;
          window.clearInterval(timer);
          setProgress(1);
          const cooldownUntil =
            resolution.cooldownSeconds > 0
              ? Date.now() + resolution.cooldownSeconds * 1000
              : record.cooldownUntil;
          const patched =
            updateGameVerifyRecord({ resolution, validatedAt: Date.now(), cooldownUntil }) ?? {
              ...record,
              resolution,
              validatedAt: Date.now(),
              cooldownUntil,
            };
          setRecord(patched);
          setCooldownSec(secondsLeft(cooldownUntil));
          setPhase("result");
        }, remaining);
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [record, phase]);

  useEffect(() => {
    if (phase !== "result") return undefined;
    const until = record?.cooldownUntil;
    if (!until || secondsLeft(until) <= 0) return undefined;
    const id = window.setInterval(() => {
      const left = secondsLeft(until);
      setCooldownSec(left);
      if (left <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, record?.cooldownUntil]);

  const onPlayAgain = useCallback(() => {
    if (!record) return;
    clearGameVerifyRecord();
    navigate(record.playAgainPath);
  }, [record, navigate]);

  const onExit = useCallback(() => {
    clearGameVerifyRecord();
    navigate("/games");
  }, [navigate]);

  const onCaptchaSolved = useCallback(
    (token: string) => {
      const claim = pendingClaimRef.current || record?.claim;
      if (!claim || !record) return;
      setPhase("validating");
      setProgress(0);
      void (async () => {
        await submitGameTurnstilePass(token);
        claimPromiseRef.current = runClaim(claim, { cfTurnstileToken: token });
        const resolution = await claimPromiseRef.current;
        const cooldownUntil =
          resolution.cooldownSeconds > 0
            ? Date.now() + resolution.cooldownSeconds * 1000
            : record.cooldownUntil;
        const patched =
          updateGameVerifyRecord({ resolution, validatedAt: Date.now(), cooldownUntil }) ?? {
            ...record,
            resolution,
            validatedAt: Date.now(),
            cooldownUntil,
          };
        setRecord(patched);
        setCooldownSec(secondsLeft(cooldownUntil));
        setPhase("result");
      })();
    },
    [record],
  );

  const gameLabel = record?.gameLabelKey ? t(record.gameLabelKey) : "";

  if (!record) return null;

  return (
    <div className="relative mx-auto w-full max-w-4xl py-4 sm:py-8" style={{ direction: "ltr" }}>
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/10 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-accent/10 blur-[90px]" aria-hidden />
      <GameTurnstileModal
        open={phase === "captcha"}
        onCancel={onExit}
        onSolved={onCaptchaSolved}
      />
      <AnimatePresence mode="wait">
        {phase === "validating" || phase === "captcha" ? (
          <SubmittingScene
            key="submitting"
            progress={progress}
            gameLabel={gameLabel}
            gameKey={record.gameKey}
            t={t}
          />
        ) : (
          <ResultScene
            key="result"
            record={record}
            gameLabel={gameLabel}
            cooldownSeconds={cooldownSec}
            onPlayAgain={onPlayAgain}
            onExit={onExit}
            t={t}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
