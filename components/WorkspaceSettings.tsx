"use client";
import { useState } from "react";
import { Check, Leaf, Tent, Rocket } from "lucide-react";
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
        Workspace name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={60}
        />
      </label>
      <div className="map-selection-heading">
        <div>
          <h3>A change of scenery.</h3>
          <p>Six places to make your team feel at home.</p>
        </div>
      </div>
      <div className="map-size-tabs" role="group" aria-label="Map size">
        <button
          type="button"
          aria-pressed={size === "small"}
          onClick={() => setSize("small")}
        >
          4–8 people <span>3 maps · 8 work seats</span>
        </button>
        <button
          type="button"
          aria-pressed={size === "large"}
          onClick={() => setSize("large")}
        >
          10–12 people <span>3 maps · 12 work seats</span>
        </button>
      </div>
      <div className="map-picker" role="group" aria-label="Workspace maps">
        {MAPS.filter((option) => option.size === size).map((option) => {
          const Icon =
            option.theme === "nature"
              ? Leaf
              : option.theme === "camping"
                ? Tent
                : Rocket;
          return (
            <button
              type="button"
              className={selected === option.id ? "selected" : ""}
              key={option.id}
              aria-label={`${option.name} map`}
              aria-pressed={selected === option.id}
              onClick={() => setSelected(option.id)}
            >
              <MapPreview map={option} />
              <span className="map-option-copy">
                <span className="map-option-name">
                  <Icon size={15} />
                  <strong>{option.name}</strong>
                  {selected === option.id && <Check size={16} />}
                </span>
                <span>{option.description}</span>
                <small>
                  {workspace.mapId === option.id ? "CURRENT MAP · " : ""}
                  {option.people} people · 2 meeting areas
                </small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="map-apply-summary">
        <strong>Selected: {map.name}</strong>
        <span>
          Designed for {map.people} people. Layout sizes are recommendations,
          not sign-in limits.
        </span>
        {changedMap && (
          <p>
            Applying this map ends current calls and screen sharing, clears
            meeting invitations and locks, and moves everyone to the new
            entrance.
          </p>
        )}
      </div>
      <button
        className="primary"
        disabled={saving || (!changedMap && name.trim() === workspace.name)}
      >
        {saving
          ? "Applying…"
          : changedMap
            ? "Apply map to workspace"
            : "Save workspace"}
        <Check size={16} />
      </button>
    </form>
  );
}
