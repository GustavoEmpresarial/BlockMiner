/**
 * Minimal ABI for BlockMinerDeposit (Polygon POL). Ported from
 * legacy/server/services/blockMinerDepositAbi.ts — keep in sync with the deployed contract
 * (legacy's contracts/contracts/BlockMinerDeposit.sol; current/ has no contracts/ yet).
 */
export const BLOCK_MINER_DEPOSIT_ABI = [
  "event DepositReceived(address indexed userId, address indexed sender, uint256 amount, uint256 timestamp)",
  "function deposit(address userId) payable",
  "function MIN_DEPOSIT() view returns (uint256)",
];
