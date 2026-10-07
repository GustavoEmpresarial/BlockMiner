/**
 * Load against the 3D rack catalog routes on localhost.
 * Unauthenticated calls must be rejected. This script does not buy anything.
 * It refuses blockminer.space and dev.blockminer.space.
 */
import http from "k6/http";
import { check } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const host = BASE_URL.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
if (host === "blockminer.space" || host === "dev.blockminer.space" || host.endsWith(".blockminer.space")) {
  throw new Error("refusing load test against " + host);
}

const shopDuration = new Trend("showcase_shop_list_ms", true);
const offerDuration = new Trend("showcase_offer_list_ms", true);
const purchaseDuration = new Trend("showcase_purchase_rejected_ms", true);
const requests = new Counter("showcase_rack_requests");
const serverErrors = new Rate("showcase_rack_5xx");

export const options = {
  scenarios: {
    showcase_rack_gate: {
      executor: "constant-vus",
      vus: 5,
      duration: "15s",
    },
  },
  thresholds: {
    showcase_rack_5xx: ["rate==0"],
  },
};

export default function () {
  const shop = http.get(`${BASE_URL}/api/shop/miners`);
  requests.add(1);
  shopDuration.add(shop.timings.duration);
  serverErrors.add(shop.status >= 500);
  check(shop, { "shop list is not 5xx": (r) => r.status < 500 });

  const offers = http.get(`${BASE_URL}/api/offer-events/active`);
  requests.add(1);
  offerDuration.add(offers.timings.duration);
  serverErrors.add(offers.status >= 500);
  check(offers, { "offer list is not 5xx": (r) => r.status < 500 });

  const purchase = http.post(
    `${BASE_URL}/api/shop/purchase-rack`,
    JSON.stringify({ sku: "showcase_3d_rack", quantity: 1 }),
    { headers: { "Content-Type": "application/json" } },
  );
  requests.add(1);
  purchaseDuration.add(purchase.timings.duration);
  serverErrors.add(purchase.status >= 500);
  check(purchase, { "purchase without session is not 5xx": (r) => r.status < 500 && r.status !== 200 });
}
