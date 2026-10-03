import OfficeApp from "@/components/OfficeApp";
import { I18nProvider } from "@/lib/i18n";

// The shell must be fetched after each deploy so browsers do not retain an
// old asset manifest and miss newly shipped client features.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <I18nProvider>
      <OfficeApp />
    </I18nProvider>
  );
}
