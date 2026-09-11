import { isAddress } from 'ethers';

/** Injected browser wallet deposit is only offered when treasury or contract addresses are configured. */
export function canUseInjectedDepositChannel(
  systemContractAddress: string | null,
  systemDepositAddress: string | null,
): boolean {
  const contractOk =
    typeof systemContractAddress === 'string' &&
    systemContractAddress.trim().length > 0 &&
    isAddress(systemContractAddress.trim());
  const treasuryOk =
    typeof systemDepositAddress === 'string' &&
    systemDepositAddress.trim().length > 0 &&
    isAddress(systemDepositAddress.trim());
  return contractOk || treasuryOk;
}
