import LoginPage from "@/components/LoginPage";
import { I18nProvider } from "@/lib/i18n";
export default function Page() {
  return (
    <I18nProvider>
      <LoginPage />
    </I18nProvider>
  );
}
