"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import {
  Check,
  Leaf,
  Tent,
  Rocket,
  Flower2,
  Landmark,
  Palmtree,
  Map,
  SlidersHorizontal,
  Cloud,
  PencilRuler,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { whiteboardEnabled } from "@/shared/whiteboard";
import { api } from "@/lib/api";
import {
  MAPS,
  drawOfficeMap,
  getMap,
  type OfficeMap,
  type WorkspaceSettings as Settings,
} from "@/shared/maps";

function MapPreview({ map }: { map: OfficeMap }) {
  const shapes: React.ReactNode[] = [];
  drawOfficeMap(
    map,
    (x, y, width, height, color) => {
      shapes.push(
        <rect
          key={shapes.length}
          x={x}
          y={y}
          width={width}
          height={height}
          fill={"#" + color.toString(16).padStart(6, "0")}
        />,
      );
    },
    () => {},
  );
  return (
    <svg viewBox="0 0 1120 720" aria-hidden="true" shapeRendering="crispEdges">
      {shapes}
    </svg>
  );
}

export function WorkspaceSettings({
  workspace,
  refresh,
  notify,
}: {
  workspace: Settings;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"maps" | "features" | "storage">("maps");
  const [featureBusy, setFeatureBusy] = useState(false);
  const [storage, setStorage] = useState<{
    configured: boolean;
    endpoint: string;
    region: string;
    bucket: string;
  } | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [storageResult, setStorageResult] = useState("");
  useEffect(() => {
    if (tab === "storage")
      api<typeof storage>("/admin/storage")
        .then(setStorage)
        .catch((error) => notify(error.message));
  }, [tab, notify]);
  const [name, setName] = useState(workspace.name);
  const [selected, setSelected] = useState(workspace.mapId);
  const [size, setSize] = useState<"small" | "large">(
    getMap(workspace.mapId).size,
  );
  const [saving, setSaving] = useState(false);
  const map = getMap(selected);
  const changedMap = selected !== workspace.mapId;
  return (
    <section className="workspace-settings">
      <div className="workspace-overview">
        <div className="workspace-overview-map">
          <MapPreview map={getMap(workspace.mapId)} />
        </div>
        <div>
          <span className="eyebrow">{t("YOUR WORKSPACE")}</span>
          <h3>{workspace.name}</h3>
          <p>
            {t(getMap(workspace.mapId).name)} ·{" "}
            {t("{count} people", { count: getMap(workspace.mapId).people })}
          </p>
        </div>
        <span className="workspace-owner-badge">
          <ShieldCheck size={14} />
          {t("Owner controls")}
        </span>
      </div>
      <div
        className="workspace-section-tabs"
        role="tablist"
        aria-label={t("Workspace sections")}
      >
        {(
          [
            { id: "maps", label: "Maps", icon: Map },
            { id: "features", label: "Features", icon: SlidersHorizontal },
            { id: "storage", label: "File storage", icon: Cloud },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`workspace-tab-${item.id}`}
            aria-controls="workspace-content"
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const tabs = ["maps", "features", "storage"] as const;
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (tabs.indexOf(tab) +
                          (event.key === "ArrowRight" ? 1 : 2)) %
                        3;
                setTab(tabs[next]);
                document.getElementById(`workspace-tab-${tabs[next]}`)?.focus();
              }
            }}
          >
            <item.icon size={16} />
            {t(item.label)}
          </button>
        ))}
      </div>
      <div
        id="workspace-content"
        role="tabpanel"
        aria-labelledby={`workspace-tab-${tab}`}
      >
        {tab === "maps" && (
          <form
            className="workspace-map-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              try {
                await api(
                  "/admin/workspace",
                  { name, mapId: selected, revision: workspace.revision },
                  "PATCH",
                );
                await refresh();
                notify("Workspace settings saved.");
              } catch (error) {
                notify((error as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              {t("Workspace name")}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={60}
              />
            </label>
            <div className="map-selection-heading">
              <div>
                <h3>{t("A change of scenery.")}</h3>
                <p>{t("Find a place to make your team feel at home.")}</p>
              </div>
            </div>
            <div
              className="map-size-tabs"
              role="group"
              aria-label={t("Map size")}
            >
              <button
                type="button"
                aria-pressed={size === "small"}
                onClick={() => setSize("small")}
              >
                {t("4–8 people")}
                <span>
                  {t("{count} maps · 8 work seats", {
                    count: MAPS.filter((m) => m.size === "small").length,
                  })}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={size === "large"}
                onClick={() => setSize("large")}
              >
                {t("10–12 people")}
                <span>
                  {t("{count} maps · 12 work seats", {
                    count: MAPS.filter((m) => m.size === "large").length,
                  })}
                </span>
              </button>
            </div>
            <div
              className="map-picker"
              role="group"
              aria-label={t("Workspace maps")}
            >
              {MAPS.filter((option) => option.size === size).map((option) => {
                const Icon =
                  option.theme === "temple"
                    ? Landmark
                    : option.theme === "beach"
                      ? Palmtree
                      : option.theme === "zen"
                        ? Flower2
                        : option.theme === "nature"
                          ? Leaf
                          : option.theme === "camping"
                            ? Tent
                            : Rocket;
                return (
                  <button
                    type="button"
                    className={selected === option.id ? "selected" : ""}
                    key={option.id}
                    aria-label={t("{name} map", { name: t(option.name) })}
                    aria-pressed={selected === option.id}
                    onClick={() => setSelected(option.id)}
                  >
                    <MapPreview map={option} />
                    <span className="map-option-copy">
                      <span className="map-option-name">
                        <Icon size={15} />
                        <strong>{t(option.name)}</strong>
                        {selected === option.id && <Check size={16} />}
                      </span>
                      <span>{t(option.description)}</span>
                      <small>
                        {workspace.mapId === option.id
                          ? t("CURRENT MAP · ")
                          : ""}
                        {t("{count} people · 2 meeting areas", {
                          count: option.people,
                        })}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="map-apply-summary">
              <strong>{t("Selected: {name}", { name: t(map.name) })}</strong>
              <span>
                {t(
                  "Designed for {count} people. Layout sizes are recommendations, not sign-in limits.",
                  { count: map.people },
                )}
              </span>
              {changedMap && (
                <p>
                  {t(
                    "Applying this map ends current calls and screen sharing, clears meeting invitations and locks, and moves everyone to the new entrance.",
                  )}
                </p>
              )}
            </div>
            <button
              className="primary"
              disabled={
                saving || (!changedMap && name.trim() === workspace.name)
              }
            >
              {saving
                ? t("Applying…")
                : changedMap
                  ? t("Apply map to workspace")
                  : t("Save workspace")}
              <Check size={16} />
            </button>
          </form>
        )}
        {tab === "features" && (
          <div className="workspace-feature-panel">
            <div className="workspace-section-heading">
              <h3>{t("Make room for the tools you need.")}</h3>
              <p>
                {t(
                  "Choose which shared tools your team can use. Changes apply to everyone immediately.",
                )}
              </p>
            </div>
            <div className="workspace-feature-card">
              <div className="workspace-feature-icon">
                <PencilRuler size={25} />
              </div>
              <div>
                <h4>{t("Shared whiteboard")}</h4>
                <p>
                  {t(
                    "Draw, plan and brainstorm together in each area, with live cursors and automatic saving.",
                  )}
                </p>
                <small>
                  {whiteboardEnabled(workspace)
                    ? t("Visible in the control bar")
                    : t("Hidden from the control bar")}
                </small>
              </div>
              <button
                className="feature-switch"
                type="button"
                role="switch"
                aria-label={t("Enable whiteboard")}
                aria-checked={whiteboardEnabled(workspace)}
                disabled={featureBusy}
                onClick={async () => {
                  setFeatureBusy(true);
                  try {
                    await api(
                      "/admin/features",
                      {
                        features: { whiteboard: !whiteboardEnabled(workspace) },
                        revision: workspace.revision,
                      },
                      "PATCH",
                    );
                    await refresh();
                    notify("Workspace features updated.");
                  } catch (error) {
                    notify((error as Error).message);
                  } finally {
                    setFeatureBusy(false);
                  }
                }}
              >
                <span />
              </button>
            </div>
            <p className="workspace-feature-note">
              <ShieldCheck size={16} />
              {t(
                "Turning a feature off ends access, but keeps its saved content for when you enable it again.",
              )}
            </p>
          </div>
        )}
        {tab === "storage" && (
          <div className="workspace-storage-panel">
            <div className="workspace-section-heading">
              <h3>{t("Your files, in your own storage.")}</h3>
              <p>
                {t(
                  "Uploaded files live in your external S3-compatible bucket. The office VM does not keep file copies.",
                )}
              </p>
            </div>
            <div className="storage-provider-card">
              <div className="storage-provider-icon">
                <Cloud size={32} />
              </div>
              <div>
                <h4>{t("External S3 storage")}</h4>
                <p>
                  {t(
                    "Garage, AWS S3, Cloudflare R2 or another S3-compatible provider",
                  )}
                </p>
              </div>
              <span
                className={`storage-status ${storage?.configured ? "ready" : ""}`}
              >
                {t(
                  !storage
                    ? "Loading…"
                    : storage.configured
                      ? "Configured"
                      : "Not configured",
                )}
              </span>
            </div>
            {storage && (
              <dl className="storage-details">
                <div>
                  <dt>{t("Endpoint")}</dt>
                  <dd>{storage.endpoint || "—"}</dd>
                </div>
                <div>
                  <dt>{t("Bucket")}</dt>
                  <dd>{storage.bucket || "—"}</dd>
                </div>
                <div>
                  <dt>{t("Region")}</dt>
                  <dd>{storage.region}</dd>
                </div>
                <div>
                  <dt>{t("File limit")}</dt>
                  <dd>{t("5 MB per snapshot")}</dd>
                </div>
              </dl>
            )}
            <div className="storage-security-note">
              <ShieldCheck size={18} />
              <p>
                {t(
                  "Credentials stay on the server. Downloads use short-lived signed links after checking office access.",
                )}
              </p>
            </div>
            <p className="muted">
              {t(
                "Set the endpoint, region, bucket and access keys in the server environment, then restart the API.",
              )}
            </p>
            <button
              type="button"
              className="secondary storage-test-button"
              disabled={!storage?.configured || storageBusy}
              onClick={async () => {
                setStorageBusy(true);
                setStorageResult("");
                try {
                  await api("/admin/storage/check", {});
                  setStorageResult(
                    "Storage check passed. Read, write and delete are working.",
                  );
                } catch (error) {
                  setStorageResult((error as Error).message);
                } finally {
                  setStorageBusy(false);
                }
              }}
            >
              <RefreshCw size={16} />
              {t(storageBusy ? "Checking storage…" : "Test storage connection")}
            </button>
            {storageResult && (
              <p className="storage-test-result" role="status">
                {t(storageResult)}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
