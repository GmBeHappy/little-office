import { WorkspaceProvider } from "@/lib/workspace-api";
import { I18nProvider } from "@/lib/i18n";
import WhiteboardSurface from "@/components/WhiteboardSurface";
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
        <WhiteboardSurface />
      </WorkspaceProvider>
    </I18nProvider>
  );
}
