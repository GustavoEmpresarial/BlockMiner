import { useTranslation } from 'react-i18next';

interface ShopEmptyStateProps {
  message?: string;
}

export function ShopEmptyState({ message }: ShopEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 font-medium"
    >
      {message || t('shop.loading_error', { defaultValue: 'Nenhum equipamento disponível.' })}
    </div>
  );
}
