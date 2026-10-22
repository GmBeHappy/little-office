import OfficeApp from "@/components/OfficeApp";
import { I18nProvider } from "@/lib/i18n";
import { WorkspaceProvider } from "@/lib/workspace-api";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <I18nProvider>
      <WorkspaceProvider key={workspaceId} id={workspaceId}>
        <OfficeApp />
      </WorkspaceProvider>
    </I18nProvider>
  );
}
