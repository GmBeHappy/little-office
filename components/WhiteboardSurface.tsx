"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useWorkspaceApi } from "@/lib/workspace-api";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
const Whiteboard = dynamic(() => import("./Whiteboard"), { ssr: false });
type Context = {
  scope: string;
  name: string;
  userId: string;
  enabled: boolean;
  storageConfigured: boolean;
};
export default function WhiteboardSurface() {
  const { api } = useWorkspaceApi();
  const { t } = useI18n();
  const [closed, setClosed] = useState(false);
  const [context, setContext] = useState<Context | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (closed) return;
    let cancelled = false;
    setContext(null);
    setError("");
    void api<Context>("/whiteboard/context")
      .then((r) => {
        if (!cancelled) setContext(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, closed]);
  if (closed)
    return (
      <section className="p-6 space-y-4" aria-label={t("Whiteboard closed")}>
        <p role="status">{t("Whiteboard closed")}</p>
        <Button onClick={() => setClosed(false)}>
          {t("Reopen whiteboard")}
        </Button>
      </section>
    );
  if (error) return <p role="alert">{error}</p>;
  if (!context) return <p role="status">Opening whiteboard…</p>;
  return (
    <Whiteboard
      {...context}
      active
      onClose={() => {
        setClosed(true);
        // The editor has already checked unsaved changes before native dismissal.
        window.dispatchEvent(new Event("littleoffice-whiteboard-closed"));
      }}
    />
  );
}
