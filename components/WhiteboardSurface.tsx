"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useWorkspaceApi } from "@/lib/workspace-api";
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
  const [context, setContext] = useState<Context | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
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
  }, [api]);
  if (error) return <p role="alert">{error}</p>;
  if (!context) return <p role="status">Opening whiteboard…</p>;
  return <Whiteboard {...context} active onClose={() => setContext(null)} />;
}
