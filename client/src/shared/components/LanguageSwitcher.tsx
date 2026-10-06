import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { changeLanguageSafe } from '../../i18n/config';
import { LANGUAGE_MENU_WIDTH_PX, useAnchoredFixedMenu } from '../hooks/anchoredMenuPosition';

const LANGUAGES: Array<{ code: 'pt-BR' | 'es' | 'en'; label: string; flag: string }> = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
];

/** Language switcher — default product language is pt-BR; es/en are opt-in. */
export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPos = useAnchoredFixedMenu(open, buttonRef, menuRef, LANGUAGE_MENU_WIDTH_PX);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
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

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 mt-2 w-40 rounded-xl border border-gray-800/70 bg-gray-900/95 backdrop-blur-xl shadow-xl overflow-hidden"
            style={
              menuPos
                ? { top: menuPos.top, left: menuPos.left }
                : { top: 0, left: 0, visibility: 'hidden' }
            }
          >
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        title="Idioma"
        aria-label="Alterar idioma"
        aria-expanded={open}
      >
        <Globe className="w-5 h-5" />
      </button>
      {menu}
    </div>
  );
}
