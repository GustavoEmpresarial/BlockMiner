/**
 * Sends native POL from each derived HD deposit address to the treasury (minus gas). Ported
 * from legacy/server/services/polygonHdSweep.ts. Runs ONLY inside phdServer.ts — the only
 * process that ever holds POLYGON_HD_MNEMONIC.
 */
import { ethers, HDNodeWallet, isAddress } from "ethers";
import type { AppPrisma } from "../core/database/prisma.js";
import { logger } from "../core/logger/index.js";

const log = logger.child("PolygonHdSweep");

function resolveSweepDestination(): { address: string; source: string | null } {
  const explicit = String(process.env.POLYGON_HD_SWEEP_TO_ADDRESS || "").trim();
  if (explicit) return { address: explicit, source: "POLYGON_HD_SWEEP_TO_ADDRESS" };

  const checkinReceiver = String(process.env.CHECKIN_RECEIVER || "").trim();
  if (checkinReceiver) return { address: checkinReceiver, source: "CHECKIN_RECEIVER" };

  const depositWallet = String(process.env.DEPOSIT_WALLET_ADDRESS || "").trim();
  if (depositWallet) return { address: depositWallet, source: "DEPOSIT_WALLET_ADDRESS" };

  return { address: "", source: null };
}

export async function sweepHdDepositAddressesOnce(
  prisma: AppPrisma,
  mnemonic: string,
): Promise<{ attempted: number; sent: number; skipped: boolean }> {
  const { address: sweepToRaw, source: sweepToSource } = resolveSweepDestination();
  const rpc = (process.env.POLYGON_RPC_URL || "").trim();
  if (!mnemonic || !sweepToRaw || !rpc) {
    log.warn("HD sweep skipped: missing required configuration", {
      hasMnemonic: Boolean(mnemonic),
      hasRpc: Boolean(rpc),
      sweepDestinationSource: sweepToSource,
    });
    return { attempted: 0, sent: 0, skipped: true };
  }
  if (!isAddress(sweepToRaw)) {
    log.warn("HD sweep skipped: invalid destination address", { sweepDestinationSource: sweepToSource });
    return { attempted: 0, sent: 0, skipped: true };
  }
  const sweepTo = ethers.getAddress(sweepToRaw);
  const provider = new ethers.JsonRpcProvider(rpc);
  const rows = await prisma.polygonHdAddress.findMany({ select: { address: true, derivationPath: true } });

  let sent = 0;
  let attempted = 0;
  for (const row of rows) {
    attempted += 1;
    try {
      const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, row.derivationPath);
      const signer = wallet.connect(provider);
      const bal = await provider.getBalance(wallet.address);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? 35n * 10n ** 9n;
      const gasLimit = 21_000n;
      const gasCost = gasPrice * gasLimit;
      if (bal <= gasCost) continue;
      const value = bal - gasCost;
      if (value <= 0n) continue;
      const tx = await signer.sendTransaction({ to: sweepTo, value, gasLimit, gasPrice });
      log.info("HD sweep broadcast", {
        from: wallet.address,
        to: sweepTo,
        sweepDestinationSource: sweepToSource,
        txHash: tx.hash,
        valueWei: value.toString(),
      });
      sent += 1;
    } catch (err: unknown) {
      log.warn("HD sweep failed for row", { address: row.address, error: err instanceof Error ? err.message : String(err) });
    }
  }
  log.info("HD sweep finished", { attempted, sent, skipped: false, sweepTo, sweepDestinationSource: sweepToSource });
  return { attempted, sent, skipped: false };
}
