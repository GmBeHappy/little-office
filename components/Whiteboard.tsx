"use client";
import { useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  MainMenu,
  CaptureUpdateAction,
  reconcileElements,
  restoreElements,
  serializeAsJSON,
  exportToBlob,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  Collaborator,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import {
  ArrowLeft,
  Download,
  Users,
  PencilRuler,
  CloudUpload,
} from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  BoardElement,
  BOARD_MESSAGE_BYTES,
  elementStamp,
  mergeBoard,
} from "@/shared/whiteboard";

Object.assign(window, {
  EXCALIDRAW_ASSET_PATH: `${location.origin}/excalidraw/`,
});
const supported = new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "line",
  "arrow",
  "freedraw",
  "text",
  "frame",
]);
type Props = {
  scope: string;
  name: string;
  userId: string;
  active: boolean;
  enabled: boolean;
  storageConfigured: boolean;
  onClose: () => void;
};
export default function Whiteboard({
  scope,
  name,
  userId,
  active,
  enabled,
  storageConfigured,
  onClose,
}: Props) {
  const { t, locale } = useI18n();
  const [editor, setEditor] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState("Connecting whiteboard…");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState(1);
  const [archives, setArchives] = useState<
    { id: string; name: string; createdAt: string }[] | null
  >(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const known = useRef<BoardElement[]>([]);
  const inFlight = useRef<string | null>(null);
  const dirty = useRef(false);
  const applying = useRef(false);
  const blocked = useRef(false);
  const flushRef = useRef(() => {});
  const pointerAt = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("beforeunload", unload);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!editor || !active) {
      setConnected(false);
      return;
    }
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    function apply(elements: BoardElement[]) {
      known.current = mergeBoard(known.current, elements);
      const remote = restoreElements(
        known.current as unknown as ExcalidrawElement[],
        null,
      );
      const reconciled = reconcileElements(
        editor!.getSceneElementsIncludingDeleted(),
        remote as unknown as Parameters<typeof reconcileElements>[1],
        editor!.getAppState(),
      );
      applying.current = true;
      editor!.updateScene({
        elements: reconciled,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      applying.current = false;
    }
    function connect() {
      if (disposed) return;
      setStatus("Connecting whiteboard…");
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/whiteboard`,
      );
      socket.current = ws;
      let ready = false;
      inFlight.current = null;
      ws.onmessage = (event) => {
        if (disposed) return;
        const message = JSON.parse(event.data);
        if (message.type === "ready") {
          if (message.scope !== scope) {
            blocked.current = true;
            setError(
              "Your location changed. Reopen the whiteboard in your current area.",
            );
            ws.close();
            return;
          }
          apply(message.elements);
          ready = true;
          blocked.current = false;
          setConnected(true);
          setError("");
          setStatus("Saved");
          flushRef.current();
        } else if (message.type === "scene" || message.type === "saved") {
          apply(message.elements);
          if (message.type === "saved" && message.batch === inFlight.current)
            inFlight.current = null;
          if (ready) flushRef.current();
        } else if (message.type === "presence") {
          const collaborators = new Map<SocketId, Collaborator>();
          for (const person of message.people)
            if (person.id !== userId)
              collaborators.set(person.id as SocketId, {
                username: person.name,
                id: person.id,
                pointer: person.pointer
                  ? { ...person.pointer, tool: "pointer" }
                  : undefined,
                button: person.pointer?.button,
                color: { background: "#dbe8ce", stroke: "#58764a" },
              });
          setCount(message.people.length);
          editor!.updateScene({ collaborators });
        } else if (message.type === "error") {
          blocked.current = true;
          inFlight.current = null;
          dirty.current = true;
          setError(message.message);
          setStatus("Not saved");
        }
      };
      ws.onclose = (event) => {
        if (disposed) return;
        ready = false;
        setConnected(false);
        inFlight.current = null;
        setStatus("Reconnecting whiteboard…");
        if (event.code === 1008 || blocked.current) {
          setError(
            "Whiteboard access ended. Reopen it from your current area.",
          );
          return;
        }
        retry = setTimeout(connect, 1500);
      };
      flushRef.current = () => {
        if (
          !ready ||
          blocked.current ||
          inFlight.current ||
          ws.readyState !== WebSocket.OPEN
        )
          return;
        const stamps = new Map(
          known.current.map((element) => [element.id, elementStamp(element)]),
        );
        const changes = editor!
          .getSceneElementsIncludingDeleted()
          .filter(
            (element) =>
              supported.has(element.type) &&
              stamps.get(element.id) !== elementStamp(element),
          );
        if (!changes.length) {
          dirty.current = false;
          setStatus("Saved");
          return;
        }
        const parsed = BoardElement.array().safeParse(changes);
        if (!parsed.success) {
          blocked.current = true;
          dirty.current = true;
          setError("Unsupported whiteboard content or drawing limit reached.");
          setStatus("Not saved");
          return;
        }
        const batch = crypto.randomUUID();
        const elements: BoardElement[] = [];
        let bytes = 100;
        for (const element of parsed.data) {
          const size =
            new TextEncoder().encode(JSON.stringify(element)).length + 1;
          if (bytes + size >= BOARD_MESSAGE_BYTES - 1000) break;
          elements.push(element);
          bytes += size;
        }
        if (!elements.length) {
          blocked.current = true;
          setError(
            "This drawing is too large to sync. Export a copy to keep your work.",
          );
          setStatus("Not saved");
          return;
        }
        dirty.current = true;
        inFlight.current = batch;
        setStatus("Saving…");
        ws.send(JSON.stringify({ type: "change", batch, elements }));
      };
    }
    connect();
    const flush = setInterval(() => flushRef.current(), 250);
    const ping = setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN)
        socket.current.send(JSON.stringify({ type: "ping" }));
    }, 10000);
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(flush);
      clearInterval(ping);
      socket.current?.close();
      socket.current = null;
      flushRef.current = () => {};
    };
  }, [editor, active, scope, userId]);
  async function saveSnapshot() {
    if (!editor) return;
    setUploading(true);
    setUploaded(null);
    try {
      const blob = await exportToBlob({
        elements: editor.getSceneElements(),
        appState: { ...editor.getAppState(), exportBackground: true },
        files: {},
        mimeType: "image/png",
      });
      if (blob.size > 5_000_000)
        throw new Error("Upload a PNG snapshot smaller than 5 MB.");
      const response = await fetch("/api/whiteboard/files", {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: blob,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to save snapshot to storage.");
      setUploaded(result);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function download(format: "png" | "json") {
    if (!editor) return;
    try {
      const elements = editor.getSceneElementsIncludingDeleted();
      const blob =
        format === "png"
          ? await exportToBlob({
              elements,
              appState: { ...editor.getAppState(), exportBackground: true },
              files: {},
              mimeType: "image/png",
            })
          : new Blob(
              [serializeAsJSON(elements, editor.getAppState(), {}, "local")],
              { type: "application/json" },
            );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `whiteboard-${scope.replaceAll(":", "-")}.${format === "png" ? "png" : "excalidraw"}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Unable to export this whiteboard.");
    }
  }
  return (
    <section
      className="whiteboard-view"
      role="dialog"
      aria-label={t("Shared whiteboard")}
      data-board-status={status}
    >
      <header className="whiteboard-header">
        <button
          ref={closeButton}
          className="secondary"
          onClick={() => {
            flushRef.current();
            if (dirty.current || inFlight.current) setConfirmClose(true);
            else onClose();
          }}
        >
          <ArrowLeft size={16} />
          <span>{t("Back to map")}</span>
        </button>
        <div className="whiteboard-title">
          <PencilRuler size={21} />
          <div>
            <h2>
              {t("Whiteboard")} · {t(name)}
            </h2>
            <p>{t("Shared with everyone in this area")}</p>
          </div>
        </div>
        <span className="whiteboard-presence">
          <Users size={15} />
          {count}
        </span>
        <span className="whiteboard-save" role="status">
          {active ? t(status) : t("Location changed")}
        </span>
        <button
          className="icon-button"
          aria-label={t("Export PNG")}
          title={t("Export PNG")}
          onClick={() => void download("png")}
        >
          <Download size={18} />
        </button>
        {storageConfigured && (
          <button
            className="icon-button"
            disabled={uploading || !active}
            aria-label={t("Save snapshot to storage")}
            title={t("Save snapshot to storage")}
            onClick={() => void saveSnapshot()}
          >
            <CloudUpload size={18} />
          </button>
        )}
      </header>
      {archives && (
        <div className="whiteboard-archives">
          <div>
            <strong>{t("Saved snapshots")}</strong>
            <button className="secondary" onClick={() => setArchives(null)}>
              {t("Close")}
            </button>
          </div>
          {archives.length ? (
            archives.map((file) => (
              <a
                key={file.id}
                href={`/api/whiteboard/files/${file.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={14} />
                <span>{file.name}</span>
                <time>
                  {new Date(file.createdAt).toLocaleString(
                    locale === "th" ? "th-TH" : "en-US",
                  )}
                </time>
              </a>
            ))
          ) : (
            <p>{t("No snapshots saved in this area yet.")}</p>
          )}
        </div>
      )}
      {uploaded && (
        <div className="whiteboard-file-saved" role="status">
          {t("Snapshot saved to external storage.")}{" "}
          <a href={uploaded.url} target="_blank" rel="noreferrer">
            {t("Download snapshot")}
          </a>
        </div>
      )}
      {(error || !active) && (
        <div className="whiteboard-warning" role="alert">
          {t(
            !enabled
              ? "Whiteboard was disabled by the owner. Saved drawings are kept."
              : !active
                ? "Your location changed. Reopen the whiteboard in your current area."
                : error,
          )}{" "}
          <button className="secondary" onClick={() => void download("json")}>
            {t("Download editable copy")}
          </button>
        </div>
      )}
      {confirmClose && (
        <div className="whiteboard-warning" role="alert">
          <span>
            {t(
              "Some changes are not saved yet. Keep this open to reconnect, or download a copy before closing.",
            )}
          </span>
          <button className="secondary" onClick={() => setConfirmClose(false)}>
            {t("Keep open")}
          </button>
          <button className="secondary" onClick={() => void download("json")}>
            {t("Download editable copy")}
          </button>
          <button className="secondary" onClick={onClose}>
            {t("Close whiteboard")}
          </button>
        </div>
      )}
      <div
        className="whiteboard-canvas"
        onDragOver={(event) => event.preventDefault()}
        onDropCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setError(
            "Whiteboards support drawing, shapes and text. Image uploads and embeds are not supported yet.",
          );
        }}
      >
        <Excalidraw
          excalidrawAPI={setEditor}
          isCollaborating
          langCode={locale === "th" ? "th-TH" : "en"}
          name={`Whiteboard · ${name}`}
          theme="light"
          aiEnabled={false}
          validateEmbeddable={false}
          handleKeyboardGlobally={false}
          viewModeEnabled={!connected || !active || blocked.current}
          initialData={{
            appState: {
              viewBackgroundColor: "#fafbf7",
              currentItemFontFamily: 2,
            },
          }}
          UIOptions={{
            tools: { image: false },
            canvasActions: {
              loadScene: false,
              toggleTheme: false,
              changeViewBackgroundColor: false,
              saveToActiveFile: false,
              export: { saveFileToDisk: true },
            },
          }}
          onLinkOpen={(_element, event) => event.preventDefault()}
          onPaste={(data) => {
            if (
              Object.keys(data.files || {}).length > 0 ||
              data.elements?.some((element) => !supported.has(element.type))
            ) {
              setError(
                "Whiteboards support drawing, shapes and text. Image uploads and embeds are not supported yet.",
              );
              return false;
            }
            return true;
          }}
          onChange={(elements) => {
            if (applying.current) return;
            if (
              elements.some(
                (element) => !element.isDeleted && !supported.has(element.type),
              )
            ) {
              setError(
                "Whiteboards support drawing, shapes and text. Image uploads and embeds are not supported yet.",
              );
              editor?.updateScene({
                elements: elements.filter((element) =>
                  supported.has(element.type),
                ),
                captureUpdate: CaptureUpdateAction.NEVER,
              });
              return;
            }
            const stamps = new Map(
              known.current.map((element) => [
                element.id,
                elementStamp(element),
              ]),
            );
            dirty.current = elements.some(
              (element) => stamps.get(element.id) !== elementStamp(element),
            );
            if (dirty.current) setStatus("Saving…");
          }}
          onPointerUpdate={({ pointer, button }) => {
            const now = Date.now();
            if (
              now - pointerAt.current < 100 ||
              !connected ||
              socket.current?.readyState !== WebSocket.OPEN
            )
              return;
            pointerAt.current = now;
            socket.current.send(
              JSON.stringify({
                type: "pointer",
                x: pointer.x,
                y: pointer.y,
                button,
              }),
            );
          }}
        >
          <MainMenu>
            {storageConfigured && (
              <MainMenu.Item
                onSelect={() =>
                  void api<{ id: string; name: string; createdAt: string }[]>(
                    "/whiteboard/files",
                  )
                    .then(setArchives)
                    .catch((error) => setError(error.message))
                }
              >
                {t("Saved snapshots")}
              </MainMenu.Item>
            )}
            <MainMenu.Item onSelect={() => void download("json")}>
              {t("Download editable copy")}
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => void download("png")}>
              {t("Export PNG")}
            </MainMenu.Item>
            <MainMenu.DefaultItems.ClearCanvas />
          </MainMenu>
        </Excalidraw>
      </div>
    </section>
  );
}
