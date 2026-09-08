"use client";
import { Button } from "@/components/ui/button";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Languages } from "lucide-react";
import { translate, type Locale } from "./messages";

const I18nContext = createContext({
  locale: "en" as Locale,
  setLocale: (_locale: Locale) => {},
  t: (key: string, params?: Record<string, string | number>) =>
    translate("en", key, params),
});
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("office-language");
      if (saved === "th" || saved === "en") updateLocale(saved);
    } catch {
      /* Storage may be disabled in private browsing. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(
      locale,
      "Little Office — a place to work together",
    );
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        translate(
          locale,
          "A cozy pixel office for your team. Walk over, say hello, and work together.",
        ),
      );
  }, [locale]);
  const setLocale = useCallback((value: Locale) => {
    updateLocale(value);
    try {
      localStorage.setItem("office-language", value);
    } catch {}
  }, []);
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  );
  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}
export const useI18n = () => useContext(I18nContext);
export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <Button
      variant="plain"
      type="button"
      className="language-toggle"
      aria-label={locale === "en" ? "เปลี่ยนเป็นภาษาไทย" : "Switch to English"}
      title={locale === "en" ? "เปลี่ยนเป็นภาษาไทย" : "Switch to English"}
      onClick={() => setLocale(locale === "en" ? "th" : "en")}
    >
      <Languages size={17} />
      <span lang={locale}>{locale === "en" ? "EN" : "ไทย"}</span>
    </Button>
  );
}
