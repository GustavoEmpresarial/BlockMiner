import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { changeLanguageSafe } from '../../i18n/config';

const LANGUAGES: Array<{ code: 'pt-BR' | 'es' | 'en'; label: string; flag: string }> = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
];

/** Language switcher — default product language is pt-BR; es/en are opt-in. */
export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const current = LANGUAGES.find((l) => (i18n.language || '').startsWith(l.code.slice(0, 2))) ?? LANGUAGES[0];

  function handleSelect(code: string) {
    void changeLanguageSafe(code);
    try {
      window.localStorage?.setItem('i18nextLngUserSet', '1');
    } catch {
      /* private mode / storage disabled */
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all flex items-center gap-1"
        title="Idioma"
        aria-label="Alterar idioma"
      >
        <Globe className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 rounded-xl border border-gray-800/70 bg-gray-900/95 backdrop-blur-xl shadow-xl overflow-hidden z-50">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleSelect(lang.code)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-800/70 transition-colors ${
                lang.code === current.code ? 'text-primary font-bold' : 'text-gray-300'
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
