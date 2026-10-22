import OfficeApp from "@/components/OfficeApp";
import { I18nProvider } from "@/lib/i18n";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <I18nProvider>
      <OfficeApp />
    </I18nProvider>
  );
}
