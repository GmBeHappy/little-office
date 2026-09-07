"use client";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import {
  Check,
  Leaf,
  Tent,
  Rocket,
  Flower2,
  Landmark,
  Palmtree,
} from "lucide-react";
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
  const [name, setName] = useState(workspace.name);
  const [selected, setSelected] = useState(workspace.mapId);
  const [size, setSize] = useState<"small" | "large">(
    getMap(workspace.mapId).size,
  );
  const [saving, setSaving] = useState(false);
  const map = getMap(selected);
  const changedMap = selected !== workspace.mapId;
  return (
    <form
      className="workspace-settings"
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
      <div className="map-size-tabs" role="group" aria-label={t("Map size")}>
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
      <div className="map-picker" role="group" aria-label={t("Workspace maps")}>
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
                  {workspace.mapId === option.id ? t("CURRENT MAP · ") : ""}
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
        disabled={saving || (!changedMap && name.trim() === workspace.name)}
      >
        {saving
          ? t("Applying…")
          : changedMap
            ? t("Apply map to workspace")
            : t("Save workspace")}
        <Check size={16} />
      </button>
    </form>
  );
}
