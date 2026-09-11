/** Re-exports admin handlers implemented in withdrawal/withdrawal.controller.ts
 *  (the only admin surface wallet has, per the finance→wallet.admin fusion). */
export {
  adminListPendingWithdrawals,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  adminCompleteWithdrawal,
} from "./withdrawal/withdrawal.controller.js";
