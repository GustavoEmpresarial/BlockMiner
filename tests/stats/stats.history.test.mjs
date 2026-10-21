import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  categorizeAction,
  formatActivityDetails,
  isHiddenAction,
} from "../../server/modules/stats/stats.history.service.ts";

describe("User Activity History Service", () => {
  it("puts every purchase in the purchases category, ahead of racks and offers", () => {
    assert.equal(categorizeAction("USER_API_POST_SHOP_PURCHASE"), "purchases");
    assert.equal(categorizeAction("USER_API_POST_SHOP_PURCHASE_FAN"), "purchases");
    assert.equal(categorizeAction("USER_API_POST_SHOP_PURCHASE_RACK"), "purchases");
    assert.equal(categorizeAction("USER_API_POST_OFFER_EVENTS_PURCHASE"), "purchases");
    assert.equal(categorizeAction("USER_API_POST_OFFER_EVENTS_PURCHASE_RACK"), "purchases");
    assert.equal(categorizeAction("USER_API_POST_ROOMS_SHOWCASE_RACK_BUY"), "purchases");
    assert.equal(categorizeAction("USER_API_POST_ROOMS_BUY"), "purchases");
  });

  it("splits earning sources into their own categories", () => {
    assert.equal(categorizeAction("youtube_claim"), "youtube");
    assert.equal(categorizeAction("USER_API_POST_FAUCET_CLAIM"), "faucet");
    assert.equal(categorizeAction("USER_API_POST_FAUCET_PARTNER_START"), "faucet");
    assert.equal(categorizeAction("adlinkfly_shortlink_claimed"), "shortlinks");
    assert.equal(categorizeAction("shortlink_power_claimed"), "shortlinks");
    assert.equal(categorizeAction("USER_API_POST_PTC_SESSION_START"), "ptc");
    assert.equal(categorizeAction("USER_API_POST_INTERNAL_OFFERWALL_OFFERS_ID_START"), "offerwall");
    assert.equal(categorizeAction("USER_API_POST_AUTO_MINING_GPU_V2_CLAIM_NORMAL"), "auto_mining");
    assert.equal(categorizeAction("MINIGAME_PLAYED_REWARD"), "games");
    assert.equal(categorizeAction("GAME2048_CLAIM"), "games");
    assert.equal(categorizeAction("USER_API_POST_CHECKIN_BALANCE"), "checkin");
    assert.equal(categorizeAction("power_boost_activated"), "boosts");
    assert.equal(categorizeAction("USER_API_POST_REWARD_INBOX_ID_COLLECT"), "boosts");
    assert.equal(categorizeAction("USER_API_POST_BURN_EVENTS_ID_CLAIM"), "boosts");
  });

  it("groups rack handling, wallet and account actions", () => {
    assert.equal(categorizeAction("USER_API_POST_ROOMS_RACK_INSTALL"), "machines");
    assert.equal(categorizeAction("USER_API_POST_ROOMS_RACK_UNINSTALL_BATCH"), "machines");
    assert.equal(categorizeAction("USER_API_POST_ROOMS_FAN_PLACEMENTS"), "machines");
    assert.equal(categorizeAction("USER_API_POST_VAULT_MOVE_TO_VAULT"), "machines");
    assert.equal(categorizeAction("USER_API_POST_WALLET_WITHDRAW"), "finance");
    assert.equal(categorizeAction("USER_API_POST_WALLET_DEPOSIT_SUBMIT"), "finance");
    assert.equal(categorizeAction("USER_API_POST_SWAP_EXECUTE"), "finance");
    assert.equal(categorizeAction("USER_API_POST_ENERGY_TAX_PAY_DAILY"), "finance");
    assert.equal(categorizeAction("USER_API_PATCH_MINING_ALLOCATION"), "finance");
    assert.equal(categorizeAction("USER_API_POST_NOTIFICATIONS_READ_ALL"), "account");
    assert.equal(categorizeAction("SOMETHING_UNKNOWN"), "general");
  });

  it("hides transport noise and the duplicate generic row of domain events", () => {
    assert.equal(isHiddenAction("USER_API_POST_ANTIBOT_TELEMETRY"), true);
    assert.equal(isHiddenAction("USER_API_POST_YOUTUBE_CLAIM"), true);
    assert.equal(isHiddenAction("USER_API_POST_GAMES_ID_MOVE"), true);
    assert.equal(isHiddenAction("USER_API_POST_PTC_SESSION_6D86F9DC_HEARTBEAT"), true);
    assert.equal(isHiddenAction("youtube_claim"), false);
    assert.equal(isHiddenAction("USER_API_POST_SHOP_PURCHASE"), false);
  });

  it("writes readable titles", () => {
    const capped = formatActivityDetails("youtube_claim", JSON.stringify({ hashRate: 0, tournamentOnly: true }));
    assert.equal(capped.title, "Resgate do YouTube");
    assert.ok(capped.description.includes("+1 ponto"));

    const uncapped = formatActivityDetails("youtube_claim", JSON.stringify({ hashRate: 10 }));
    assert.ok(uncapped.description.includes("+10 H/s"));

    assert.equal(formatActivityDetails("USER_API_POST_SHOP_PURCHASE_FAN", null).title, "Compra de Sistema de Refrigeração");
    assert.equal(formatActivityDetails("USER_API_POST_SHOP_PURCHASE", null).title, "Compra de Mineradora");
    assert.equal(formatActivityDetails("USER_API_POST_ROOMS_RACK_UNINSTALL_BATCH", null).title, "Rack Desmontado");
    assert.equal(formatActivityDetails("USER_API_POST_ROOMS_RACK_INSTALL", null).title, "Máquina Instalada no Rack");
    assert.equal(formatActivityDetails("MINIGAME_PLAYED_FAILED", null).title, "Partida Perdida");
    assert.equal(formatActivityDetails("USER_API_POST_SPECIAL_MISSION_START", null).title, "Special Mission Start");
  });
});
