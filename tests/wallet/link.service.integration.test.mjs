import test from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";

// Real Postgres integration test (dev DB on :5433, see current/.env) + real ethers signing.
// Covers: challenge generates a unique nonce; verify accepts a valid signature and rejects
// invalid signature / wrong chain / reused (already-consumed) challenge / expired challenge;
// unlink actually removes the DB link.
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const linkService = await import("../../server/modules/wallet/link/link.service.ts");
const linkRepo = await import("../../server/modules/wallet/link/link.repository.ts");

const createdUserIds = [];

async function makeUser() {
  const suffix = `walletlink_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Wallet Link Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.41",
      ip: "203.0.113.41",
      userAgent: "test-agent/1.0",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

test.after(async () => {
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("challenge generates a message containing a unique nonce per call", async () => {
  const user = await makeUser();
  const testWallet = Wallet.createRandom();

  const c1 = await linkService.createWalletLinkChallengeForUser(user.id, testWallet.address, 137);
  const c2 = await linkService.createWalletLinkChallengeForUser(user.id, testWallet.address, 137);

  assert.match(c1.message, /Nonce: [a-f0-9]{32}/);
  assert.match(c2.message, /Nonce: [a-f0-9]{32}/);
  assert.notEqual(c1.message, c2.message, "each challenge must carry a fresh nonce");
});

test("verify accepts a real signature from the test wallet and links the address", async () => {
  const user = await makeUser();
  const testWallet = Wallet.createRandom();

  const { message } = await linkService.createWalletLinkChallengeForUser(user.id, testWallet.address, 137);
  const signature = await testWallet.signMessage(message);

  const { wallet } = await linkService.verifyAndLinkWalletForUser(user.id, testWallet.address, 137, signature);
  assert.equal(wallet.address.toLowerCase(), testWallet.address.toLowerCase());
  assert.equal(wallet.chainId, 137);
  assert.ok(wallet.verifiedAt);

  const stored = await linkRepo.getUserWalletAddress(user.id);
  assert.equal(stored?.toLowerCase(), testWallet.address.toLowerCase());
});

test("verify rejects an invalid signature (signed by a different wallet)", async () => {
  const user = await makeUser();
  const testWallet = Wallet.createRandom();
  const attackerWallet = Wallet.createRandom();

  const { message } = await linkService.createWalletLinkChallengeForUser(user.id, testWallet.address, 137);
  const wrongSignature = await attackerWallet.signMessage(message);

  await assert.rejects(
    () => linkService.verifyAndLinkWalletForUser(user.id, testWallet.address, 137, wrongSignature),
    /WALLET_INVALID_SIGNATURE/,
  );

  const stored = await linkRepo.getUserWalletAddress(user.id);
  assert.equal(stored, null, "no link should be created on invalid signature");
});

test("verify rejects a reused (already-consumed) challenge — real anti-replay", async () => {
  const user = await makeUser();
  const testWallet = Wallet.createRandom();

  const { message } = await linkService.createWalletLinkChallengeForUser(user.id, testWallet.address, 137);
  const signature = await testWallet.signMessage(message);

  await linkService.verifyAndLinkWalletForUser(user.id, testWallet.address, 137, signature);

  await assert.rejects(
    () => linkService.verifyAndLinkWalletForUser(user.id, testWallet.address, 137, signature),
    /WALLET_CHALLENGE_NOT_FOUND/,
    "the same challenge/signature must not be replayable",
  );
});

test("verify rejects an expired challenge", async () => {
  const user = await makeUser();
  const testWallet = Wallet.createRandom();

  const message = [
    "BlockMiner wallet link",
    `User: ${user.id}`,
    `Address: ${testWallet.address}`,
    "Nonce: " + "a".repeat(32),
    `IssuedAt: ${new Date(Date.now() - 60_000).toISOString()}`,
  ].join("\n");
  // Manually persist an already-expired challenge (expiresAtMs in the past).
  await linkRepo.createWalletLinkChallenge(user.id, testWallet.address, 137, message, "a".repeat(32), Date.now() - 1000);

  const signature = await testWallet.signMessage(message);

  await assert.rejects(
    () => linkService.verifyAndLinkWalletForUser(user.id, testWallet.address, 137, signature),
    /WALLET_CHALLENGE_NOT_FOUND/,
  );
});

test("verify rejects a mismatched chainId", async () => {
  const user = await makeUser();
  const testWallet = Wallet.createRandom();

  const { message } = await linkService.createWalletLinkChallengeForUser(user.id, testWallet.address, 137);
  const signature = await testWallet.signMessage(message);

  await assert.rejects(() => linkService.verifyAndLinkWalletForUser(user.id, testWallet.address, 999, signature));
});

test("unlink actually removes the DB link", async () => {
  const user = await makeUser();
  const testWallet = Wallet.createRandom();

  const { message } = await linkService.createWalletLinkChallengeForUser(user.id, testWallet.address, 137);
  const signature = await testWallet.signMessage(message);
  await linkService.verifyAndLinkWalletForUser(user.id, testWallet.address, 137, signature);

  assert.notEqual(await linkRepo.getUserWalletAddress(user.id), null);

  await linkService.unlinkWalletForUser(user.id);

  assert.equal(await linkRepo.getUserWalletAddress(user.id), null);
});

test("legacy one-step verify (verifyLegacyWalletOwnership) accepts a real signature", async () => {
  const user = await makeUser();
  const testWallet = Wallet.createRandom();
  const legacyMessage = `Verify wallet ownership for Block Miner: ${testWallet.address}`;
  const signature = await testWallet.signMessage(legacyMessage);

  const { wallet } = await linkService.verifyLegacyWalletOwnership(user.id, testWallet.address, signature);
  assert.equal(wallet.address.toLowerCase(), testWallet.address.toLowerCase());

  const stored = await linkRepo.getUserWalletAddress(user.id);
  assert.equal(stored?.toLowerCase(), testWallet.address.toLowerCase());
});

test("legacy one-step verify rejects an invalid signature", async () => {
  const user = await makeUser();
  const testWallet = Wallet.createRandom();
  const attackerWallet = Wallet.createRandom();
  const legacyMessage = `Verify wallet ownership for Block Miner: ${testWallet.address}`;
  const wrongSignature = await attackerWallet.signMessage(legacyMessage);

  await assert.rejects(
    () => linkService.verifyLegacyWalletOwnership(user.id, testWallet.address, wrongSignature),
    /WALLET_INVALID_SIGNATURE/,
  );
});
