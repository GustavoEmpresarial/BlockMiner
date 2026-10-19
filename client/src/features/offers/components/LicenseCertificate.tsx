import { useTranslation } from 'react-i18next';

type Props = {
  /** Holder name once the license is active; omitted on the "for sale" card. */
  holder?: string | null;
  validUntil?: string | null;
  className?: string;
};

/** Small parchment certificate for the profile-photo license (art in /contract, text in HTML). */
export function LicenseCertificate({ holder, validUntil, className = '' }: Props) {
  const { t } = useTranslation();
  const issued = Boolean(holder);
  return (
    <div
      className={`relative mx-auto aspect-[3/4] w-full max-w-[220px] select-none rounded-lg shadow-[4px_4px_0px_#000000] ${className}`}
      style={{ backgroundImage: 'url(/contract/contract-parchment.webp)', backgroundSize: '100% 100%' }}
      data-testid="license-certificate"
      role="img"
      aria-label={t('profilePhoto.certificate_title')}
    >
      <div className="absolute inset-x-[13%] top-[17%] bottom-[30%] flex flex-col items-center text-center text-[#3b2a17]">
        <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[#7a5a32]">BlockMiner</p>
        <p className="mt-1 font-serif text-base font-black leading-tight">{t('profilePhoto.certificate_title')}</p>
        <div className="my-2 h-px w-3/4 bg-[#a8875a]/60" />
        <p className="text-[10px] font-semibold leading-snug">{t('profilePhoto.certificate_body')}</p>
        <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-[#7a5a32]">{t('profilePhoto.certificate_validity')}</p>
        {issued ? (
          <div className="mt-auto w-full">
            <p className="truncate font-serif text-sm font-black italic" title={holder ?? ''}>{holder}</p>
            <div className="mx-auto h-px w-4/5 bg-[#3b2a17]/50" />
            {validUntil ? <p className="mt-0.5 text-[9px] font-bold text-[#5c4326]">{t('profilePhoto.certificate_until', { date: validUntil })}</p> : null}
          </div>
        ) : (
          <div className="mt-auto w-full">
            <div className="mx-auto h-px w-4/5 border-b border-dashed border-[#3b2a17]/50" />
            <p className="mt-0.5 text-[9px] font-bold text-[#7a5a32]">{t('profilePhoto.certificate_your_name')}</p>
          </div>
        )}
      </div>
      <img
        src="/contract/contract-seal.webp"
        alt=""
        draggable={false}
        className={`absolute bottom-[7%] right-[10%] h-[18%] w-auto drop-shadow-md ${issued ? '' : 'opacity-40 grayscale'}`}
      />
    </div>
  );
}
