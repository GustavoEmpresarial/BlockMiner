/**
 * k6 Load Test — Módulo Taxa de Energia (Popup do Dashboard)
 *
 * Alvo estrito: localhost.
 * Regra obrigatória: Falha imediatamente se apontar para blockminer.space ou dev.blockminer.space.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5118").replace(/\/$/, "");

// Guarda obrigatória de ambiente: aborta na hora se o host for produção ou staging remoto
if (BASE_URL.includes("blockminer.space") || BASE_URL.includes("dev.blockminer.space")) {
  throw new Error("PROIBIDO: Teste de carga nunca pode atingir blockminer.space nem dev.blockminer.space!");
}

const USER_TOKEN = __ENV.USER_TOKEN || "";
const VUS = Number(__ENV.VUS || 10);

const serverErrors = new Rate("server_error_5xx");
const rateLimitedRequests = new Rate("rate_limited_429");
const successfulSummary = new Rate("successful_summary_queries");
const successfulPayments = new Rate("successful_pay_daily");
const summaryDurationTrend = new Trend("energy_tax_summary_duration_ms", true);
const payDailyDurationTrend = new Trend("energy_tax_pay_daily_duration_ms", true);
const totalRequests = new Counter("energy_tax_requests_total");

export const options = {
  scenarios: {
    energy_tax_load_scenario: {
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

  // 1. GET /api/energy-tax/summary (Carregamento do resumo exibido no popup do dashboard)
  const summaryRes = http.get(`${BASE_URL}/api/energy-tax/summary`, { headers });
  totalRequests.add(1);
  summaryDurationTrend.add(summaryRes.timings.duration);
  serverErrors.add(summaryRes.status >= 500);
  rateLimitedRequests.add(summaryRes.status === 429);
  successfulSummary.add(summaryRes.status === 200);

  check(summaryRes, {
    "summary status is valid (200 or 429)": (r) => r.status === 200 || r.status === 429,
  });

  // 2. POST /api/energy-tax/pay-daily (Simulação de tentativa de quitação do popup)
  if (Math.random() < 0.25) {
    const payload = JSON.stringify({
      currency: "POL",
    });

    const payRes = http.post(`${BASE_URL}/api/energy-tax/pay-daily`, payload, { headers });
    totalRequests.add(1);
    payDailyDurationTrend.add(payRes.timings.duration);
    serverErrors.add(payRes.status >= 500);
    rateLimitedRequests.add(payRes.status === 429);
    // 200 (sucesso na 1a quitação), 409 (já quitado no dia), 400 (sem recompensas ou sem saldo), ou 429 (rate limit)
    successfulPayments.add(payRes.status === 200 || payRes.status === 409 || payRes.status === 400);

    check(payRes, {
      "pay-daily handled cleanly (200, 400, 409, or 429)": (r) =>
        r.status === 200 || r.status === 400 || r.status === 409 || r.status === 429,
    });
  }

  sleep(0.05);
}
