import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import type { AxiosError } from 'axios';
import { walletApi } from './wallet.api';
import { isValidPolygonWithdrawAddress, WALLET_MIN_WITHDRAW_POL } from './wallet.validation';

export interface WithdrawalChallenge {
  challengeToken: string;
  ttlMinutes: number;
  pendingAmount: number;
  pendingAddress: string;
}

type WithdrawForm = { address: string; amount: string };

type WithdrawHandlersDeps = {
  t: TFunction;
  isActionLoading: boolean;
  setIsActionLoading: (v: boolean) => void;
  balanceAmount: number;
  withdrawForm: WithdrawForm;
  setWithdrawForm: Dispatch<SetStateAction<WithdrawForm>>;
  withdrawalChallenge: WithdrawalChallenge | null;
  setWithdrawalChallenge: Dispatch<SetStateAction<WithdrawalChallenge | null>>;
  withdrawalCode: string;
  setWithdrawalCode: Dispatch<SetStateAction<string>>;
  fetchWalletData: () => Promise<boolean>;
};

export function createWithdrawHandlers(deps: WithdrawHandlersDeps) {
  const {
    t,
    isActionLoading,
    setIsActionLoading,
    balanceAmount,
    withdrawForm,
    setWithdrawForm,
    withdrawalChallenge,
    setWithdrawalChallenge,
    withdrawalCode,
    setWithdrawalCode,
    fetchWalletData,
  } = deps;

  const handleWithdraw = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isActionLoading) return;

    const amount = parseFloat(withdrawForm.amount);
    if (!withdrawForm.address) {
      toast.error(t('wallet.dest_address'));
      return;
    }
    if (!isValidPolygonWithdrawAddress(withdrawForm.address)) {
      toast.error(t('wallet.dest_address'));
      return;
    }
    if (Number.isNaN(amount) || amount < WALLET_MIN_WITHDRAW_POL) {
      toast.error(t('wallet.min_withdraw_error', { min: WALLET_MIN_WITHDRAW_POL }));
      return;
    }
    if (amount > balanceAmount) {
      toast.error(t('wallet.insufficient_balance'));
      return;
    }

    try {
      setIsActionLoading(true);
      const res = await walletApi.postWithdraw({ amount, address: withdrawForm.address.trim() });
      if (res.data.require2FA && res.data.withdrawalChallengeToken) {
        setWithdrawalChallenge({
          challengeToken: res.data.withdrawalChallengeToken,
          ttlMinutes: res.data.ttlMinutes ?? 10,
          pendingAmount: amount,
          pendingAddress: withdrawForm.address.trim(),
        });
        setWithdrawalCode('');
        toast.info(t('wallet.withdraw_flow.code_sent_email'));
        return;
      }
      if (res.data.ok) {
        toast.success(res.data.message || t('common.success'));
        setWithdrawForm((prev) => ({ ...prev, amount: '' }));
        void fetchWalletData();
      } else {
        toast.error(res.data.message || t('common.error'));
      }
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message?: string; code?: string }>;
      if (ax.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        toast.error(t('auth.verifyEmail.banner_body'));
        return;
      }
      toast.error(ax.response?.data?.message || t('common.error'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleWithdrawalCodeSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!withdrawalChallenge || isActionLoading) return;
    if (!/^\d{6}$/.test(withdrawalCode.trim())) {
      toast.error(t('wallet.withdraw_flow.code_six_digits'));
      return;
    }

    try {
      setIsActionLoading(true);
      const res = await walletApi.postWithdraw({
        amount: withdrawalChallenge.pendingAmount,
        address: withdrawalChallenge.pendingAddress,
        withdrawalCode: withdrawalCode.trim(),
        withdrawalChallengeToken: withdrawalChallenge.challengeToken,
      });
      if (res.data.ok) {
        toast.success(res.data.message || t('common.success'));
        setWithdrawForm((prev) => ({ ...prev, amount: '' }));
        setWithdrawalChallenge(null);
        setWithdrawalCode('');
        void fetchWalletData();
      } else if (res.data.reason === 'EXPIRED') {
        toast.error(t('wallet.withdraw_flow.code_expired'));
        setWithdrawalChallenge(null);
        setWithdrawalCode('');
      } else {
        toast.error(res.data.message || t('wallet.withdraw_flow.code_invalid'));
      }
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message?: string; reason?: string }>;
      if (ax.response?.data?.reason === 'EXPIRED') {
        toast.error(t('wallet.withdraw_flow.code_expired'));
        setWithdrawalChallenge(null);
        setWithdrawalCode('');
      } else {
        toast.error(ax.response?.data?.message || t('wallet.withdraw_flow.code_invalid'));
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  return { handleWithdraw, handleWithdrawalCodeSubmit };
}
