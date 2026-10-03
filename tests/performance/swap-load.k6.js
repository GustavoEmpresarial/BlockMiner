/**
 * k6 Load Test — Módulo Swap (POL -> BLK)
 *
 * Alvo estrito: localhost.
 * Regra: Falha imediatamente se apontar para blockminer.space ou dev.blockminer.space.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5116").replace(/\/$/, "");

// Guarda obrigatória de ambiente
if (BASE_URL.includes("blockminer.space") || BASE_URL.includes("dev.blockminer.space")) {
  throw new Error("PROIBIDO: Teste de carga nunca pode atingir blockminer.space nem dev.blockminer.space!");
}

const USER_TOKEN = __ENV.USER_TOKEN || "";
const VUS = Number(__ENV.VUS || 10);

const serverErrors = new Rate("server_error_5xx");
const rateLimitedRequests = new Rate("rate_limited_429");
const successfulBalances = new Rate("successful_balances_queries");
const successfulSwaps = new Rate("successful_swaps");
const balancesDurationTrend = new Trend("swap_balances_duration_ms", true);
const executeDurationTrend = new Trend("swap_execute_duration_ms", true);
const totalRequests = new Counter("swap_requests_total");

export const options = {
  scenarios: {
    swap_load_scenario: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "2s", target: VUS },
        { duration: "5s", target: VUS },
        { duration: "2s", target: 0 },
      ],
    },
  },
  thresholds: {
    server_error_5xx: ["rate==0"],
  },
};

export default function () {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (USER_TOKEN) {
    headers["Authorization"] = `Bearer ${USER_TOKEN}`;
    headers["Cookie"] = `bm_access_token=${USER_TOKEN}`;
  }

  // 1. GET /api/swap/balances
  const balRes = http.get(`${BASE_URL}/api/swap/balances`, { headers });
  totalRequests.add(1);
  balancesDurationTrend.add(balRes.timings.duration);
  serverErrors.add(balRes.status >= 500);
  rateLimitedRequests.add(balRes.status === 429);
  successfulBalances.add(balRes.status === 200);

  check(balRes, {
    "swap balances valid status (200 or 429)": (r) => r.status === 200 || r.status === 429,
  });

  // 2. POST /api/swap/execute (30% do tráfego para simular conversões concorrentes)
  if (Math.random() < 0.3) {
    const payload = JSON.stringify({
      fromAsset: "POL",
      toAsset: "BLK",
      amount: 0.001,
    });

    const execRes = http.post(`${BASE_URL}/api/swap/execute`, payload, { headers });
    totalRequests.add(1);
    executeDurationTrend.add(execRes.timings.duration);
    serverErrors.add(execRes.status >= 500);
    rateLimitedRequests.add(execRes.status === 429);
    successfulSwaps.add(execRes.status === 200);

    check(execRes, {
      "swap execute valid status (200 or 429)": (r) => r.status === 200 || r.status === 429,
    });
  }

  sleep(0.05);
}
