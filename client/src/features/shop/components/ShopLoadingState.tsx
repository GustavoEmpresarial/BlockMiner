import { useTranslation } from 'react-i18next';

export function ShopLoadingState() {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-[60vh] flex-col items-center justify-center gap-4"
    >
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
        {t('common.loading')}
      </p>
    </div>
  );
}
