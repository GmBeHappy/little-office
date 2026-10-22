import AccountProfile from "@/components/AccountProfile";
import { I18nProvider } from "@/lib/i18n";
import { WorkspaceProvider } from "@/lib/workspace-api";
import { z } from "zod";
import { notFound } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { workspace } = await searchParams;
  if (!z.uuid().safeParse(workspace).success) notFound();
  return (
    <I18nProvider>
      <WorkspaceProvider id={workspace!}>
        <AccountProfile />
      </WorkspaceProvider>
    </I18nProvider>
  );
}
