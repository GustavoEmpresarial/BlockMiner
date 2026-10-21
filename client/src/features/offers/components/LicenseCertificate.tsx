import { useTranslation } from 'react-i18next';

type Props = {
  /** Name drawn on the signature line; a dashed placeholder when empty. */
  holder?: string | null;
  className?: string;
  /** Bigger text for the purchase popup. */
  size?: 'sm' | 'lg';
};

/**
 * Preview of the license certificate, laid out like the AI-generated one: parchment, two-line
 * serif title, "valid for 1 year", the holder name in calligraphy on a signature line, wax seal
 * bottom-right. Art in /contract, fonts self-hosted.
 */
export function LicenseCertificate({ holder, className = '', size = 'sm' }: Props) {
  const { t } = useTranslation();
  const lg = size === 'lg';
  const name = holder?.trim() || null;
  const [titleFirst, ...titleWords] = String(t('profilePhoto.certificate_title')).split(' ');
  const titleRest = titleWords.join(' ');
  return (
    <div
      className={`relative mx-auto aspect-[3/4] w-full select-none overflow-hidden rounded-lg shadow-[4px_4px_0px_#000000] ${lg ? 'max-w-[300px]' : 'max-w-[220px]'} ${className}`}
      style={{ backgroundImage: 'url(/contract/contract-parchment.webp)', backgroundSize: '100% 100%' }}
      data-testid="license-certificate"
      role="img"
      aria-label={`${t('profilePhoto.certificate_title')}${name ? ` — ${name}` : ''}`}
    >
      <div className="absolute inset-x-[10%] top-[22%] flex flex-col items-center text-center text-[#4a2c17]">
        {/* First word alone on the first line, like the generated art. */}
        <p className={`leading-[1.02] ${lg ? 'text-[40px]' : 'text-[29px]'}`} style={{ fontFamily: "'Cert Serif', Georgia, serif", fontWeight: 700 }}>
          <span className="block">{titleFirst}</span>
          <span className="block">{titleRest}</span>
        </p>
        <p className={`mt-3 ${lg ? 'text-[15px]' : 'text-[11px]'}`} style={{ fontFamily: "'Cert Serif', Georgia, serif", fontWeight: 700 }}>
          {t('profilePhoto.certificate_validity')}
        </p>
      </div>
      <div className="absolute inset-x-[16%] top-[64%] flex flex-col items-center text-[#4a2c17]">
        {name ? (
          <p
            className={`max-w-full truncate leading-none ${lg ? 'text-[34px]' : 'text-[24px]'}`}
            style={{ fontFamily: "'Cert Script', 'Brush Script MT', cursive" }}
            data-testid="certificate-holder"
          >
            {name}
          </p>
        ) : (
          <p className={`font-bold text-[#7a5a32] ${lg ? 'text-xs' : 'text-[9px]'}`}>{t('profilePhoto.certificate_your_name')}</p>
        )}
        <div className="mt-1 h-px w-full bg-[#4a2c17]/60" />
      </div>
      <img
        src="/contract/contract-seal.webp"
        alt=""
        draggable={false}
        className={`absolute bottom-[7%] right-[10%] h-[16%] w-auto drop-shadow-md ${name ? '' : 'opacity-50 grayscale'}`}
      />
    </div>
  );
}
