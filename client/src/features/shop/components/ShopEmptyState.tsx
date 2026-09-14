import { useTranslation } from 'react-i18next';

interface ShopEmptyStateProps {
  message?: string;
}

export function ShopEmptyState({ message }: ShopEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="rounded-3xl border border-dashed border-gray-800 p-12 text-center text-gray-500"
    >
      {message || t('shop.loading_error', { defaultValue: 'Nenhum equipamento disponível.' })}
    </div>
  );
}
