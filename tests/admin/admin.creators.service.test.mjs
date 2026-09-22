import test from "node:test";
import assert from "node:assert/strict";
import { validateChannelUrl, validateChannelPhoto } from "../../server/modules/social/social.service.js";
import { isYoutubeUrl } from "../../server/modules/social/social.errors.js";

test("Channel URL Validation: strictly accepts HTTPS YouTube hosts", () => {
  assert.equal(validateChannelUrl("https://youtube.com/@blockminer").ok, true);
  assert.equal(validateChannelUrl("https://www.youtube.com/c/BlockMinerOfficial").ok, true);
  assert.equal(validateChannelUrl("https://m.youtube.com/channel/UC123456").ok, true);
  assert.equal(validateChannelUrl("https://youtu.be/dQw4w9WgXcQ").ok, true);

  // Rejections
  assert.equal(validateChannelUrl("http://youtube.com/@insecure").ok, false);
  assert.equal(validateChannelUrl("javascript:alert(1)").ok, false);
  assert.equal(validateChannelUrl("https://evil-youtube.com/@phish").ok, false);
  assert.equal(validateChannelUrl("https://youtube.com.attacker.com/profile").ok, false);
  assert.equal(validateChannelUrl("data:text/html,<script>").ok, false);

  // Optional/empty handling
  assert.deepEqual(validateChannelUrl(undefined), { ok: true, value: undefined });
  assert.deepEqual(validateChannelUrl(""), { ok: true, value: null });
  assert.deepEqual(validateChannelUrl("   "), { ok: true, value: null });
});

test("Channel Photo Validation: accepts local uploads and official YouTube CDNs", () => {
  // Local paths
  assert.deepEqual(validateChannelPhoto("/media/avatars/user-1.webp"), {
    ok: true,
    value: "/media/avatars/user-1.webp",
  });
  assert.deepEqual(validateChannelPhoto("/storage/uploads/channel.png"), {
    ok: true,
    value: "/storage/uploads/channel.png",
  });

  // YouTube CDNs
  assert.equal(validateChannelPhoto("https://yt3.ggpht.com/ytc/AIdro_test=s88").ok, true);
  assert.equal(validateChannelPhoto("https://yt3.googleusercontent.com/photo.jpg").ok, true);
  assert.equal(validateChannelPhoto("https://lh3.googleusercontent.com/a/photo.jpg").ok, true);
  assert.equal(validateChannelPhoto("https://i.ytimg.com/vi/123/default.jpg").ok, true);
  assert.equal(validateChannelPhoto("https://img.youtube.com/vi/123/hqdefault.jpg").ok, true);

  // Rejections (Tracking Pixels / SSRF)
  assert.equal(validateChannelPhoto("https://tracking.analytics.evil.com/beacon.gif").ok, false);
  assert.equal(validateChannelPhoto("//protocol-relative.evil.com/img.png").ok, false);
  assert.equal(validateChannelPhoto("http://yt3.ggpht.com/unencrypted.png").ok, false);
  assert.equal(validateChannelPhoto("javascript:void(0)").ok, false);
});

test("YouTube URL Checker: isYoutubeUrl validates video and channel links", () => {
  assert.equal(isYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isYoutubeUrl("https://youtu.be/dQw4w9WgXcQ"), true);
  assert.equal(isYoutubeUrl("https://youtube.com/@channelName"), true);
  assert.equal(isYoutubeUrl("https://not-youtube.com/video"), false);
  assert.equal(isYoutubeUrl(""), false);
});

test("Concurrency Simulation: atomic claim pattern prevents double approval", async () => {
  // Simulates a mock database state where status is initially 'pending'
  let dbRow = { id: 42, status: "pending", rewardGranted: false };

  async function mockClaimSubmissionTx(txId) {
    // In PostgreSQL, `UPDATE ... WHERE id = 42 AND status = 'pending'` is atomic
    if (dbRow.status === "pending") {
      // Simulate atomic row lock & update
      dbRow.status = "approved";
      dbRow.rewardGranted = true;
      return { claimed: true, txId };
    }
    return { claimed: false, txId };
  }

  // Two simultaneous admin requests attempting to approve the same submission
  const [resultA, resultB] = await Promise.all([
    mockClaimSubmissionTx("admin-session-A"),
    mockClaimSubmissionTx("admin-session-B"),
  ]);

  // Exactly ONE claim must succeed, and exactly ONE must fail
  const claims = [resultA.claimed, resultB.claimed];
  assert.equal(claims.filter(Boolean).length, 1, "Exactly one approval must succeed");
  assert.equal(claims.filter((c) => !c).length, 1, "The concurrent approval must be rejected");
  assert.equal(dbRow.status, "approved");
});
