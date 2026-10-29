import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Phaser from "phaser";
import PixelMap from "../../components/PixelMap";
import { DEFAULT_NAME_TAGS } from "../../lib/name-tags";
import type { Snapshot } from "../../shared/world";
import type { Command } from "../../shared/protocol";

let game: Phaser.Game;
const OriginalGame = Phaser.Game;
Phaser.Game = class extends OriginalGame {
  constructor(config: Phaser.Types.Core.GameConfig) {
    super(config);
    game = this;
  }
};
let authoritative: Snapshot | undefined;
// Test-only probe of the actual rendered sprite; no production test hooks.
Object.assign(window, {
  movementProbe: () => {
    const scene = game?.scene.getScenes(true)[0];
    const sprite = scene && Reflect.get(scene, "avatars").get("self");
    return sprite
      ? {
          x: sprite.container.x,
          y: sprite.container.y,
          server: authoritative?.people.find((p) => p.id === "self"),
        }
      : null;
  },
});
const socket = new WebSocket(`ws://${location.host}/office`);
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  socket.onmessage = (event) => {
    authoritative = JSON.parse(event.data);
    setSnapshot(authoritative);
  };
  return snapshot ? (
    <PixelMap
      mapId={snapshot.workspace.mapId}
      wildlifeEnabled={false}
      activitiesEnabled={false}
      effectsEnabled={false}
      nameTags={DEFAULT_NAME_TAGS}
      people={snapshot.people}
      self="self"
      speaking={[]}
      waves={{}}
      emotes={{}}
      jumps={{}}
      nudges={{}}
      send={(command: Command) => socket.send(JSON.stringify(command))}
      select={() => {}}
    />
  ) : null;
}
createRoot(document.getElementById("root")!).render(<App />);
