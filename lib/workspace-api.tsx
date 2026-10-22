"use client";
import { createContext, useContext, useMemo } from "react";
import { api } from "./api";

const Context = createContext({ api, base: "/api" });
export function WorkspaceProvider({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const base = `/api/workspaces/${encodeURIComponent(id)}`;
    const scoped: typeof api = (path, body, method) => {
      const shared =
        path.startsWith("/auth/") ||
        /^\/admin\/(users|auth|reset-password|storage)(\/|$)/.test(path);
      return api(path, body, method, shared ? "/api" : base);
    };
    return { api: scoped, base };
  }, [id]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useWorkspaceApi = () => useContext(Context);
