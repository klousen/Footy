import { createContext, useContext, useState, type ReactNode } from "react";
import { loadLanguage, saveLanguage, type Language } from "../engine/storage";
import { t as translate, type TitleI18nKey } from "../engine/labels";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TitleI18nKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Simpler i18n-Kontext fürs Titelmenü (siehe Handoff Abschnitt 5) - persistiert
 * geräteweit, unabhängig von den Save-Slots. Deckt vorerst NUR die Titelmenü-
 * Strings ab (`TITLE_I18N` in labels.ts), Rest der App bleibt Deutsch.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(loadLanguage);

  function setLanguage(lang: Language) {
    setLanguageState(lang);
    saveLanguage(lang);
  }

  const value: LanguageContextValue = {
    language,
    setLanguage,
    t: (key) => translate(key, language),
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage muss innerhalb von LanguageProvider verwendet werden");
  return ctx;
}
