import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence } from "framer-motion";
import type { Transition } from "framer-motion";
import { ArrowLeft, Clock, Coins, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../shared/auth/auth.store";
import { moveBoard, parseBoard, type Board2048, type Direction2048 } from "@game2048/engine";
import { CRYPTO_ICONS, COIN_COLORS } from "../lib/cryptoGameIcons";
import type { GameFlowStat } from "../lib/finish";
import { saveGameVerifyRecord } from "../lib/finish/gameVerifyStorage";
import type {
  Game2048Session,
  Game2048StatusResponse,
  Game2048StartResponse,
  Game2048MoveResponse,
} from "./lib/game2048.types";
import { formatMmSs, useRoundSecondsRemaining } from "./lib/game2048.helpers";
import { Chain2048Tile } from "./components/Chain2048Tile";
import { Game2048BoardSkeleton } from "./components/Game2048BoardSkeleton";

export default function Game2048Page() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Game2048StatusResponse | null>(null);
  const [session, setSession] = useState<Game2048Session | null>(null);
  /** Latest session for async handlers (avoids stale closures + out-of-order move responses). */
  const sessionRef = useRef<Game2048Session | null>(null);
  /** Touch / pen swipe tracking (pointer id + capture — fixes iOS lost touchend). */
  const pointerSwipeRef = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const boardGestureActiveRef = useRef(false);
  const boardGridRef = useRef<HTMLDivElement | null>(null);
  const timeoutRefreshRef = useRef(false);
  const autoStartInFlightRef = useRef(false);
  /** Moves do not use global `busy` so swipes are not ignored while the API round-trip runs. */
  const moveInFlightRef = useRef(false);
  const pendingSwipeDirRef = useRef<Direction2048 | null>(null);
  const sendMoveRef = useRef<(d: Direction2048) => void>(() => {});
  /** Snapshot before optimistic board apply; restored on move API failure. */
  const moveRevertRef = useRef<Game2048Session | null>(null);

  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get<Game2048StatusResponse>("/games/2048/status");
      if (data?.ok) {
        setStatus(data);
        if (data.activeSession) {
          sessionRef.current = data.activeSession;
          setSession(data.activeSession);
        } else {
          sessionRef.current = null;
          setSession(null);
        }
      }
    } catch {
      toast.error(t("game2048.errors.load_status"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const startGame = useCallback(async ({ silent = false } = {}) => {
    setBusy(true);
    try {
      const { data } = await api.post<Game2048StartResponse>("/games/2048/start");
      if (!data?.ok) {
        if (!silent && data?.code === "COOLDOWN_ACTIVE") {
          toast.error(t("game2048.errors.COOLDOWN_ACTIVE"));
        } else if (!silent) {
          toast.error(t("game2048.errors.start_failed"));
        }
        await refreshStatus();
        return { ok: false, code: data?.code || "START_FAILED" };
      }
      if (data.session) {
        sessionRef.current = data.session;
        setSession(data.session);
      }
      await refreshStatus();
      return { ok: true };
    } catch {
      if (!silent) toast.error(t("game2048.errors.start_failed"));
      return { ok: false, code: "START_FAILED" };
    } finally {
      setBusy(false);
    }
  }, [t, refreshStatus]);

  useEffect(() => {
    if (loading) return;
    if (!status || status.ok === false) return;
    if (session?.status === "ACTIVE" && !session?.gameOver) return;
    if (!status.allowNewStart || (status.cooldownSecondsRemaining ?? 0) > 0) return;
    if (busy || autoStartInFlightRef.current) return;

    autoStartInFlightRef.current = true;
    void startGame({ silent: true }).finally(() => {
      autoStartInFlightRef.current = false;
    });
  }, [loading, status, session, busy, startGame]);

  useEffect(() => {
    return () => {
      autoStartInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    const sessionBoardSize = Array.isArray(session?.board) ? session.board.length : 0;
    const sessionHasBoard = sessionBoardSize > 0;
    if (!loading && !sessionHasBoard && !busy && status?.allowNewStart && (status?.cooldownSecondsRemaining ?? 0) === 0) {
      // Keep trying to bootstrap an initial board if the first auto-start race fails.
      const retryId = setTimeout(() => {
        if (!autoStartInFlightRef.current) {
          autoStartInFlightRef.current = true;
          void startGame({ silent: true }).finally(() => {
            autoStartInFlightRef.current = false;
          });
        }
      }, 1200);
      return () => clearTimeout(retryId);
    }
    return undefined;
  }, [loading, session, busy, status, startGame]);

  const roundSeconds = useRoundSecondsRemaining(session);

  /** Prefer the smaller of client tick and server snapshot so the timer never runs ahead of the authority clock. */
  const displaySeconds = useMemo(() => {
    const limit = session?.timeLimitSeconds ?? 0;
    if (limit <= 0) return 0;
    const server = session?.secondsRemaining;
    if (typeof server === "number" && roundSeconds != null) {
      return Math.max(0, Math.min(server, roundSeconds));
    }
    if (roundSeconds != null) return roundSeconds;
    if (typeof server === "number") return Math.max(0, server);
    return 0;
  }, [session?.timeLimitSeconds, session?.secondsRemaining, roundSeconds]);

  useEffect(() => {
    if (roundSeconds !== 0 || !session || session.status !== "ACTIVE" || session.gameOver) {
      timeoutRefreshRef.current = false;
      return;
    }
    if ((session.timeLimitSeconds ?? 0) <= 0) return;
    if (timeoutRefreshRef.current) return;
    timeoutRefreshRef.current = true;
    void refreshStatus();
  }, [roundSeconds, session, refreshStatus]);

  const sendMove = useCallback(
    async (direction: Direction2048) => {
      const s0 = sessionRef.current;
      if (!s0?.id) return;
      if (s0.status !== "ACTIVE" || s0.gameOver) return;

      const moveTargetId = s0.id;

      const parsedBoard = parseBoard(s0.board);
      let optimisticBoard: Board2048 | null = null;
      let optimisticScoreDelta = 0;
      if (parsedBoard) {
        const { board: afterSlide, scoreDelta, moved } = moveBoard(
          parsedBoard.map((r: number[]) => [...r]),
          direction,
        );
        if (!moved) return;
        optimisticBoard = afterSlide;
        optimisticScoreDelta = scoreDelta;
      }

      if (moveInFlightRef.current) {
        pendingSwipeDirRef.current = direction;
        return;
      }
      moveInFlightRef.current = true;

      moveRevertRef.current =
        s0.board && Array.isArray(s0.board)
          ? { ...s0, board: s0.board.map((r: number[]) => [...r]) }
          : { ...s0 };

      if (optimisticBoard) {
        setSession((s) => {
          if (!s || s.id !== moveTargetId || s.status !== "ACTIVE" || s.gameOver) return s;
          const next: Game2048Session = {
            ...s,
            board: optimisticBoard,
            score: (Number(s.score) || 0) + optimisticScoreDelta,
          };
          sessionRef.current = next;
          return next;
        });
      }

      try {
        const { data } = await api.post<Game2048MoveResponse>("/games/2048/move", {
          sessionId: moveTargetId,
          direction,
        });
        const stillThisRound = sessionRef.current?.id === moveTargetId;

        if (!data?.ok) {
          if (stillThisRound) {
            const rev = moveRevertRef.current;
            if (rev) {
              sessionRef.current = rev;
              setSession(rev);
            }
            const code = data?.code;
            const msg = code
              ? t(`game2048.errors.${code}`, { defaultValue: t("game2048.errors.move_failed") })
              : t("game2048.errors.move_failed");
            toast.error(msg);
          }
          if (data?.session?.id === moveTargetId && sessionRef.current?.id === moveTargetId) {
            sessionRef.current = data.session;
            setSession(data.session);
          }
          return;
        }
        if (
          data.session &&
          data.session.id === moveTargetId &&
          sessionRef.current?.id === moveTargetId
        ) {
          sessionRef.current = data.session;
          setSession(data.session);
        }
      } catch {
        if (sessionRef.current?.id === moveTargetId) {
          const rev = moveRevertRef.current;
          if (rev) {
            sessionRef.current = rev;
            setSession(rev);
          }
          toast.error(t("game2048.errors.move_failed"));
        }
      } finally {
        moveRevertRef.current = null;
        moveInFlightRef.current = false;
        const next = pendingSwipeDirRef.current;
        pendingSwipeDirRef.current = null;
        if (next) {
          queueMicrotask(() => {
            const cur = sessionRef.current;
            if (cur?.status === "ACTIVE" && !cur.gameOver) void sendMoveRef.current(next);
          });
        }
      }
    },
    [t],
  );

  useEffect(() => {
    sendMoveRef.current = sendMove;
  }, [sendMove]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent | KeyboardEvent) => {
      const key = e.key;
      const isArrow = key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
      if (!isArrow) return;
      const el = e.target as EventTarget | null;
      const tag = el && typeof (el as HTMLElement).tagName === "string" ? (el as HTMLElement).tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement | null)?.isContentEditable)
        return;
      e.preventDefault();
      e.stopPropagation();
      const s = sessionRef.current;
      if (!s || s.status !== "ACTIVE" || s.gameOver) return;
      let dir: Direction2048 | null = null;
      if (key === "ArrowUp") dir = "up";
      else if (key === "ArrowDown") dir = "down";
      else if (key === "ArrowLeft") dir = "left";
      else if (key === "ArrowRight") dir = "right";
      if (!dir) return;
      void sendMove(dir);
    },
    [sendMove],
  );

  useEffect(() => {
    const opts = { capture: true, passive: false };
    const listener = (ev: KeyboardEvent) => onKeyDown(ev);
    window.addEventListener("keydown", listener, opts);
    return () => window.removeEventListener("keydown", listener, opts);
  }, [onKeyDown]);

  /** Lock document scroll so arrow keys do not scroll the page or nested overflow regions. */
  useEffect(() => {
    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const restartGame = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.post<Game2048StartResponse>("/games/2048/restart");
      if (!data?.ok) {
        if (data?.code === "COOLDOWN_ACTIVE") {
          toast.error(t("game2048.errors.COOLDOWN_ACTIVE"));
        } else {
          toast.error(t("game2048.errors.restart_failed"));
        }
        await refreshStatus();
        return;
      }
      if (data.session) {
        sessionRef.current = data.session;
        setSession(data.session);
      }
      await refreshStatus();
    } catch {
      toast.error(t("game2048.errors.restart_failed"));
    } finally {
      setBusy(false);
    }
  }, [t, refreshStatus]);

  /** Guards the verify hand-off so each ended session navigates exactly once. */
  const finishedSessionIdRef = useRef<string | null>(null);

  /**
   * When the round ends, hand off to the RollerCoin-style /games/verify page
   * (full page with the app sidebar + navbar — no overlay on top of the game).
   * The claim itself runs on the verify page; the endpoint is idempotent
   * server-side, so reloads can never grant the reward twice.
   */
  useEffect(() => {
    if (!session?.gameOver) return;
    const sid = String(session.id);
    if (finishedSessionIdRef.current === sid) return;
    finishedSessionIdRef.current = sid;

    const scoreVal = Number(session.score) || 0;
    const stats: GameFlowStat[] = [
      { label: t("game2048.score"), value: String(scoreVal) },
    ];
    const limit = session.timeLimitSeconds ?? 0;
    if (limit > 0 && session.startedAt && session.endedAt) {
      const elapsed = Math.max(
        0,
        Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000),
      );
      stats.push({ label: t("gameResult.stats.duration"), value: formatMmSs(elapsed) });
    }

    // Only claimable rounds can validate as success; otherwise it's a plain loss.
    const claimable = Boolean(session.canClaim || session.won);
    saveGameVerifyRecord({
      gameKey: "2048",
      gameLabelKey: "game2048.title",
      playAgainPath: "/games/2048",
      stats,
      claim: claimable ? { kind: "game2048", sessionId: session.id } : null,
      resolution: claimable
        ? null
        : { outcome: "failure", rewardMessage: null, cooldownSeconds: 0, reasonKey: null, reasonMessage: null },
      cooldownSeconds: status?.cooldownSecondsRemaining ?? 0,
    });
    navigate("/games/verify", { replace: true });
  }, [session, status?.cooldownSecondsRemaining, navigate, t]);

  const minSwipePx = useMemo(() => {
    if (typeof window === "undefined") return 24;
    return Math.round(Math.max(22, Math.min(44, window.innerWidth * 0.055)));
  }, []);

  const onBoardPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const s = sessionRef.current;
    if (!s || s.status !== "ACTIVE" || s.gameOver) return;
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    boardGestureActiveRef.current = true;
    pointerSwipeRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers reject capture on non-interactive stacking; swipe still works if finger stays on grid.
    }
  }, []);

  const clearPointerSwipe = useCallback((target: EventTarget | null, pointerId: number) => {
    boardGestureActiveRef.current = false;
    pointerSwipeRef.current = null;
    try {
      const el = target as Element | null;
      if (el && typeof el.hasPointerCapture === "function" && el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
  }, []);

  const onBoardPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = pointerSwipeRef.current;
      if (!start || start.id !== e.pointerId) return;
      clearPointerSwipe(e.currentTarget, e.pointerId);

      const s = sessionRef.current;
      if (!s || s.status !== "ACTIVE" || s.gameOver) return;
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < minSwipePx) return;
      if (ax > ay) void sendMove(dx > 0 ? "right" : "left");
      else void sendMove(dy > 0 ? "down" : "up");
    },
    [sendMove, minSwipePx, clearPointerSwipe],
  );

  const onBoardPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerSwipeRef.current?.id === e.pointerId) {
        clearPointerSwipe(e.currentTarget, e.pointerId);
      }
    },
    [clearPointerSwipe],
  );

  const onBoardLostPointerCapture = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerSwipeRef.current?.id === e.pointerId) {
      boardGestureActiveRef.current = false;
      pointerSwipeRef.current = null;
    }
  }, []);

  const cdSec = status?.cooldownSecondsRemaining ?? 0;
  const board = session?.board;
  const showTimer = (session?.timeLimitSeconds ?? 0) > 0 && session?.status === "ACTIVE" && !session?.gameOver;

  const boardSize = board?.length || 0;
  const hasBoard = Boolean(board && boardSize > 0);

  useEffect(() => {
    const el = boardGridRef.current;
    if (!el || !hasBoard) return undefined;
    const blockNativeScroll = (ev: TouchEvent | PointerEvent) => {
      if (ev.cancelable) ev.preventDefault();
    };
    el.addEventListener("touchmove", blockNativeScroll, { passive: false });
    el.addEventListener("pointermove", blockNativeScroll, { passive: false });
    return () => {
      el.removeEventListener("touchmove", blockNativeScroll);
      el.removeEventListener("pointermove", blockNativeScroll);
    };
  }, [hasBoard]);

  const skeletonLabelKey = loading
    ? "game2048.grid_loading_aria"
    : busy
      ? "game2048.starting"
      : "game2048.grid_placeholder_aria";

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] touch-manipulation flex-col overflow-hidden bg-[#020617] pt-[env(safe-area-inset-top)]"
      style={{ direction: "ltr", overscrollBehavior: "none" }}
    >
      <>
        <span className="sr-only">{t("game2048.title")}</span>
        {loading && (
          <span className="sr-only" aria-live="polite">
            {t("game2048.loading")}
          </span>
        )}
        <header className="flex shrink-0 items-center justify-between gap-1.5 border-b border-slate-800 bg-[#050a14] px-2 py-2 sm:gap-2 sm:px-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link
                to="/games"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700/60 text-slate-400 transition-colors hover:border-sky-500/40 hover:text-sky-400"
                aria-label={t("game2048.back_arena")}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 sm:px-3">
                <Coins className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-200/80">
                    {t("game2048.score")}
                  </span>
                  <span className="text-lg font-black tabular-nums leading-none text-amber-50 sm:text-xl">
                    {Number(session?.score) || 0}
                  </span>
                </div>
              </div>
            </div>
            <h1 className="pointer-events-none shrink-0 text-center text-[10px] font-black uppercase italic tracking-tight text-white sm:text-xs">
              <span className="bg-gradient-to-b from-sky-300 via-blue-400 to-indigo-600 bg-clip-text text-transparent">
                {t("game2048.brand")}
              </span>
              <span className="sr-only">{t("game2048.brand_aria")}</span>
            </h1>
            <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
              {(showTimer || (session?.timeLimitSeconds ?? 0) > 0) && (
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-[8px] font-black uppercase tracking-widest text-slate-500 sm:text-[9px]">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden />
                    {t("game2048.time")}
                  </p>
                  <p className="font-mono text-lg font-black tabular-nums leading-none text-sky-300 sm:text-xl">
                    {showTimer ? formatMmSs(displaySeconds) : formatMmSs(0)}
                  </p>
                </div>
              )}
              {session?.status === "ACTIVE" && !session?.gameOver && (
                <button
                  type="button"
                  onClick={() => void restartGame()}
                  disabled={busy}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/20 text-red-400 transition-all hover:bg-red-500/40 disabled:opacity-40"
                  aria-label={t("game2048.reset_aria")}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-none">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden overscroll-none px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:p-4">
              {cdSec > 0 && !session && (
                <p className="text-center text-sm text-amber-400">
                  {t("game2048.errors.COOLDOWN_ACTIVE")} ({cdSec}s)
                </p>
              )}

              <div className="mx-auto flex w-full max-w-[min(420px,min(calc(100dvw-1rem),calc(100vw-1rem)))] flex-col items-center sm:max-w-[420px]">
                <div className="flex w-full min-w-0 justify-center">
                  {hasBoard && board && session ? (
                    <div
                      ref={boardGridRef}
                      role="grid"
                      aria-label={t("game2048.grid_aria")}
                      className="relative aspect-square w-full max-w-full touch-none select-none overflow-hidden rounded-xl border border-sky-600/30 bg-[#060d18] p-1.5 shadow-[inset_0_0_24px_rgba(0,0,0,0.45)] sm:p-2"
                      style={{ touchAction: "none" }}
                      onPointerDown={onBoardPointerDown}
                      onPointerUp={onBoardPointerUp}
                      onPointerCancel={onBoardPointerCancel}
                      onLostPointerCapture={onBoardLostPointerCapture}
                    >
                      <div
                        className="grid h-full w-full gap-1.5 sm:gap-2"
                        style={{
                          gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
                          gridTemplateRows: `repeat(${boardSize}, minmax(0, 1fr))`,
                        }}
                      >
                        {board.map((row: number[], ri: number) =>
                          row.map((value: number, ci: number) => (
                            <Chain2048Tile key={`cell-${ri}-${ci}`} value={value} row={ri} col={ci} t={t} />
                          )),
                        )}
                      </div>
                    </div>
                  ) : (
                    <Game2048BoardSkeleton t={t} labelKey={skeletonLabelKey} />
                  )}
                </div>
              </div>

              {busy && !hasBoard && (
                <p className="text-center text-[11px] text-slate-600">{t("game2048.starting")}</p>
              )}
            </div>
        </div>

        
      </>
    </div>
  );
}
