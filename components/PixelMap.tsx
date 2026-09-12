"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { WORLD, JUMP_DURATION, walkable, type Person } from "@/shared/world";
import { drawOfficeMap, getMap, mapZones, type MapId } from "@/shared/maps";
import { drawFishing, fishingPhase } from "@/shared/fishing";
import { drawMapEffects, type MapEffect } from "@/shared/map-effects";
import {
  FARM_BLOCKS,
  FARM_EGG_SPOTS,
  FARM_GROWTH,
  FARM_HENS,
  FARM_HEN_YARD,
  FARM_PLOTS,
} from "@/shared/farm";
import { drawCharacter } from "@/shared/avatars";
import type { Command } from "@/shared/protocol";
// Farm pickups render as pixel art above the avatar instead of emoji text.
const FARM_ICON_EMOJIS: Record<
  string,
  "egg" | "sprout" | "wheat" | "fish" | "puff"
> = {
  "🥚": "egg",
  "🌱": "sprout",
  "🌾": "wheat",
  "🐟": "fish",
  "💨": "puff",
};
type FarmTarget = {
  kind: "egg" | "plant" | "harvest";
  x: number;
  y: number;
};
type Props = {
  mapId: MapId;
  effectsEnabled: boolean;
  people: Person[];
  self: string;
  speaking: string[];
  waves: Record<string, number>;
  emotes: Record<string, { emoji: string; until: number }>;
  jumps: Record<string, number>;
  nudges: Record<string, { start: number; sender: boolean }>;
  send: (c: Command) => void;
  select: (id: string) => void;
};
export default function PixelMap(props: Props) {
  const { t, locale } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  useEffect(() => {
    // Render at display density; the office artwork stays in world coordinates.
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let reducedMotion = motionPreference.matches;
    const motionChange = () => {
      reducedMotion = motionPreference.matches;
    };
    motionPreference.addEventListener("change", motionChange);
    // Each React effect owns its mount, including Strict Mode's trial mount.
    const parent = document.createElement("div");
    parent.style.cssText = "width:100%;height:100%;position:absolute;inset:0";
    host.current!.appendChild(parent);
    const joystick = document.createElement("div");
    joystick.className = "touch-joystick";
    joystick.hidden = true;
    joystick.setAttribute("aria-hidden", "true");
    const thumb = joystick.appendChild(document.createElement("i"));
    parent.appendChild(joystick);
    let game: Phaser.Game | undefined;
    let disposed = false;
    let cleanupInput = () => {};
    class OfficeScene extends Phaser.Scene {
      avatars = new Map<
        string,
        {
          container: Phaser.GameObjects.Container;
          body: Phaser.GameObjects.Graphics;
          label: Phaser.GameObjects.Text;
          micIcon: Phaser.GameObjects.Graphics;
          wave: Phaser.GameObjects.Text;
          color: string;
          walkTime: number;
          pose: Person["pose"];
          poseSince: number;
        }
      >();
      effects: MapEffect[] = [];
      ambient?: Phaser.GameObjects.Graphics;
      lastAmbient = -Infinity;
      ambientStill?: boolean;
      keys = new Set<string>();
      seq = 0;
      lastInput = 0;
      // Farm mini-games are per-scene state; changing maps starts a fresh day.
      farm?: {
        eggs: Map<number, number>;
        nextEgg: number;
        plots: number[];
        hens: {
          x: number;
          y: number;
          tx: number;
          ty: number;
          mode: "walk" | "idle" | "peck";
          fast: boolean;
          until: number;
          since: number;
          direction: "left" | "right";
          walkTime: number;
          body: number;
          wing: number;
        }[];
        animals: {
          kind: "cow" | "sheep";
          x: number;
          y: number;
          tx: number;
          ty: number;
          mode: "walk" | "idle" | "graze";
          until: number;
          since: number;
          direction: "left" | "right";
          walkTime: number;
        }[];
        caught: { eggs: number; crops: number; fish: number };
      };
      farmG?: Phaser.GameObjects.Graphics;
      farmHud?: Phaser.GameObjects.Text;
      farmLegend?: Phaser.GameObjects.Text;
      farmPrompt?: Phaser.GameObjects.Text;
      touch?: {
        pointer: Phaser.Input.Pointer;
        target?: Phaser.GameObjects.GameObject;
        x: number;
        y: number;
        dx: number;
        dy: number;
        dragged: boolean;
      };
      mapPointer(pointer: Phaser.Input.Pointer) {
        return (
          pointer.event?.target === this.game.canvas &&
          !document.querySelector(
            '[role="dialog"], dialog[open], [role="listbox"], .media-expanded',
          )
        );
      }
      stopTouch() {
        if (this.touch) {
          this.touch = undefined;
          const state = live.current;
          this.seq = Math.max(
            this.seq,
            state.people.find((p) => p.id === state.self)?.seq || 0,
          );
          state.send({ type: "move", dx: 0, dy: 0, seq: ++this.seq });
        }
        joystick.hidden = true;
      }
      constructor() {
        super("office");
      }
      // The nearest farm action for the player's position; E performs it.
      farmTarget(time: number): FarmTarget | null {
        const farm = this.farm;
        if (!farm) return null;
        const self = live.current.people.find(
          (p) => p.id === live.current.self,
        );
        if (!self) return null;
        let best: FarmTarget | null = null;
        let bestD = Infinity;
        const consider = (
          kind: FarmTarget["kind"],
          x: number,
          y: number,
          max: number,
        ) => {
          const d = Math.hypot(self.x - x, self.y - y);
          if (d < max && d < bestD) {
            bestD = d;
            best = { kind, x, y };
          }
        };
        for (const [spot, until] of farm.eggs)
          if (until > time) {
            const [x, y] = FARM_EGG_SPOTS[spot];
            consider("egg", x, y, 48);
          }
        for (const [index, planted] of farm.plots.entries()) {
          const [x, y] = FARM_PLOTS[index];
          if (!planted) consider("plant", x, y, 54);
          else if (time - planted >= FARM_GROWTH) consider("harvest", x, y, 54);
        }
        return best;
      }
      interactFarm(time: number) {
        const farm = this.farm;
        if (!farm) return;
        const state = live.current;
        const self = state.people.find((p) => p.id === state.self);
        if (!self) return;
        const target = this.farmTarget(time);
        if (!target) return;
        const celebrate = (emoji: string) =>
          state.send({ type: "emote", emoji });
        if (target.kind === "egg") {
          for (const [spot, until] of farm.eggs) {
            const [x, y] = FARM_EGG_SPOTS[spot];
            if (x === target.x && y === target.y && until > time) {
              farm.eggs.delete(spot);
              break;
            }
          }
          farm.caught.eggs++;
          farm.nextEgg = Math.min(farm.nextEgg, time + 6000);
          celebrate("🥚");
        } else if (target.kind === "plant" || target.kind === "harvest") {
          const index = FARM_PLOTS.findIndex(
            ([x, y]) => x === target.x && y === target.y,
          );
          if (index >= 0) {
            if (target.kind === "plant") {
              farm.plots[index] = time;
              celebrate("🌱");
            } else {
              farm.plots[index] = 0;
              farm.caught.crops++;
              celebrate("🌾");
            }
          }
        }
      }
      // Pixel-art pickup icons float over avatars in place of emoji text.
      drawFarmIcon(
        g: Phaser.GameObjects.Graphics,
        kind: "egg" | "sprout" | "wheat" | "fish" | "puff",
        x: number,
        y: number,
        alpha: number,
      ) {
        const r = (ox: number, oy: number, w: number, h: number, c: number) => {
          g.fillStyle(c, alpha);
          g.fillRect(x + ox, y + oy, w, h);
        };
        if (kind === "egg") {
          r(-5, -4, 10, 8, 0xf7f3e2);
          r(-3, -8, 6, 5, 0xf7f3e2);
          r(-4, 2, 8, 2, 0xe3d9c6);
          r(-3, -7, 4, 3, 0xffffff);
        } else if (kind === "sprout") {
          r(-1, -6, 3, 10, 0x4c7957);
          r(-6, -7, 5, 4, 0x69985f);
          r(3, -9, 5, 4, 0x8bb16f);
        } else if (kind === "wheat") {
          for (const dx of [-6, -1, 4]) {
            r(dx, -4, 2, 8, 0xc9a35b);
            r(dx - 1, -9, 4, 5, 0xe8c56a);
          }
        } else if (kind === "fish") {
          r(-6, -4, 12, 8, 0x5f9ec0);
          r(-9, -2, 4, 4, 0x4f8db0);
          r(3, -6, 3, 3, 0x4f8db0);
          r(2, -2, 2, 2, 0xf7f3e2);
        } else {
          r(-7, -5, 4, 4, 0xd9d2c0);
          r(0, -8, 5, 4, 0xd9d2c0);
          r(-2, -1, 5, 4, 0xd9d2c0);
        }
      }
      updateFarm(time: number, delta: number) {
        const farm = this.farm!;
        const step = Math.min(delta, 50);
        // Hens lay a few eggs at a time; uncollected ones fade away.
        if (farm.eggs.size < 3 && time > farm.nextEgg) {
          const free = FARM_EGG_SPOTS.map((_, i) => i).filter(
            (i) => !farm.eggs.has(i),
          );
          const spot = free[Math.floor(Math.random() * free.length)];
          farm.eggs.set(spot, time + 45000);
          farm.nextEgg = time + 9000 + Math.random() * 9000;
        }
        for (const [spot, until] of farm.eggs)
          if (until < time) farm.eggs.delete(spot);
        const g = this.farmG!;
        g.clear();
        const r = (
          x: number,
          y: number,
          w: number,
          h: number,
          c: number,
          a?: number,
        ) => {
          g.fillStyle(c, a);
          g.fillRect(x, y, w, h);
        };
        for (const [spot] of farm.eggs) {
          const [x, y] = FARM_EGG_SPOTS[spot];
          r(x - 6, y + 3, 12, 3, 0x3e5233, 0.15);
          r(x - 5, y - 3, 10, 7, 0xf7f3e2);
          r(x - 3, y - 7, 6, 4, 0xf7f3e2);
          r(x - 4, y + 1, 8, 3, 0xe3d9c6);
          r(x - 3, y - 6, 4, 3, 0xffffff);
        }
        for (const [index, planted] of farm.plots.entries()) {
          if (!planted) continue;
          const [x, y] = FARM_PLOTS[index];
          const age = time - planted;
          if (age < FARM_GROWTH * 0.25) {
            // Freshly sown: turned soil with a scatter of seeds.
            r(x - 8, y - 1, 16, 5, 0x6b4526);
            r(x - 5, y, 3, 2, 0xe8c56a);
            r(x + 2, y + 1, 3, 2, 0xe8c56a);
            r(x - 1, y - 3, 2, 2, 0xd9b45f);
          } else if (age < FARM_GROWTH * 0.55) {
            // A sprout pushes up two leaves.
            r(x - 1, y - 9, 3, 9, 0x4c7957);
            r(x - 6, y - 10, 5, 4, 0x69985f);
            r(x + 3, y - 12, 5, 4, 0x8bb16f);
          } else if (age < FARM_GROWTH) {
            // Green wheat grows tall.
            for (const dx of [-7, -2, 3]) {
              r(x + dx, y - 15, 3, 15, 0x7aa050);
              r(x + dx - 2, y - 17, 7, 4, 0x8bb16f);
            }
          } else {
            // Ripe wheat: golden heads heavy over a tied bundle.
            for (const dx of [-8, -2, 4]) {
              r(x + dx, y - 17, 3, 17, 0xc9a35b);
              r(x + dx - 2, y - 24, 7, 9, 0xe8c56a);
              r(x + dx - 1, y - 23, 2, 2, 0xf2d98c);
              r(x + dx + 2, y - 21, 2, 2, 0xf2d98c);
            }
            r(x - 6, y - 6, 14, 3, 0xb98f57);
          }
        }
        // Hens wander the pen, peck at the ground, and scatter from people.
        const self = live.current.people.find(
          (p) => p.id === live.current.self,
        );
        const yard = FARM_HEN_YARD;
        for (const hen of farm.hens) {
          const playerDist = self
            ? Math.hypot(self.x - hen.x, self.y - hen.y)
            : Infinity;
          if (hen.mode !== "walk" && playerDist < 40) {
            hen.tx = Math.max(
              yard.x,
              Math.min(
                yard.x + yard.w,
                hen.x + (hen.x - (self?.x ?? hen.x) >= 0 ? 60 : -60),
              ),
            );
            hen.ty = Math.max(
              yard.y,
              Math.min(
                yard.y + yard.h,
                hen.y + (hen.y - (self?.y ?? hen.y) >= 0 ? 45 : -45),
              ),
            );
            hen.mode = "walk";
            hen.fast = true;
          }
          if (hen.mode === "walk") {
            const dx = hen.tx - hen.x,
              dy = hen.ty - hen.y;
            const dist = Math.hypot(dx, dy);
            const speed = (hen.fast ? 60 : 24) * (step / 1000);
            if (dist <= speed) {
              hen.x = hen.tx;
              hen.y = hen.ty;
              hen.mode = Math.random() < 0.45 ? "peck" : "idle";
              hen.until = time + 900 + Math.random() * 2800;
              hen.since = time;
              hen.fast = false;
            } else {
              hen.x += (dx / dist) * speed;
              hen.y += (dy / dist) * speed;
              hen.walkTime += step;
              hen.direction = dx < 0 ? "left" : "right";
            }
          } else if (time > hen.until) {
            hen.tx = yard.x + Math.random() * yard.w;
            hen.ty = yard.y + Math.random() * yard.h;
            hen.mode = "walk";
          }
          const frame = Math.floor(hen.walkTime / 120) % 2;
          const bob =
            hen.mode === "walk"
              ? frame % 2
                ? -1
                : 0
              : Math.sin(time / 400 + hen.x) > 0.6
                ? -1
                : 0;
          const peck =
            hen.mode === "peck"
              ? Math.floor((time - hen.since) / 160) % 2
                ? 6
                : 0
              : 0;
          const mirrored = hen.direction === "left";
          const p = (ox: number, oy: number, w: number, h: number, c: number) =>
            r(hen.x + (mirrored ? -ox - w : ox), hen.y + oy + bob, w, h, c);
          r(hen.x - 8, hen.y + 8, 16, 3, 0x3e5233, 0.15);
          p(-9, -7, 18, 11, hen.body);
          p(-13, -10, 5, 6, hen.wing);
          p(-3, -3, 8, 6, hen.wing);
          if (hen.mode === "walk") {
            p(-4, 4, 2, 5 - (frame ? 2 : 0), 0xe8a23c);
            p(2, 4, 2, 5 - (frame ? 0 : 2), 0xe8a23c);
          } else {
            p(-4, 4, 2, 5, 0xe8a23c);
            p(2, 4, 2, 5, 0xe8a23c);
          }
          p(6, -13 + peck, 8, 8, hen.body);
          p(8, -16 + peck, 4, 4, 0xd75b4a);
          p(13, -10 + peck, 4, 3, 0xe8a23c);
          p(11, -11 + peck, 2, 2, 0x3e5233);
        }
        // Cows and sheep graze anywhere their hooves can carry them.
        for (const animal of farm.animals) {
          if (animal.mode === "walk") {
            const dx = animal.tx - animal.x,
              dy = animal.ty - animal.y;
            const dist = Math.hypot(dx, dy);
            const speed = (animal.kind === "cow" ? 11 : 14) * (step / 1000);
            const nx = animal.x + (dx / dist) * speed,
              ny = animal.y + (dy / dist) * speed;
            if (dist <= speed) {
              animal.x = animal.tx;
              animal.y = animal.ty;
              animal.mode = Math.random() < 0.5 ? "graze" : "idle";
              animal.until = time + 1500 + Math.random() * 4000;
              animal.since = time;
            } else if (walkable(nx, ny, FARM_BLOCKS)) {
              animal.x = nx;
              animal.y = ny;
              animal.walkTime += step;
              animal.direction = dx < 0 ? "left" : "right";
            } else {
              animal.mode = "idle";
              animal.until = time + 600;
            }
          } else if (time > animal.until) {
            for (let tries = 0; tries < 24; tries++) {
              const tx = 70 + Math.random() * 980,
                ty = 100 + Math.random() * 540;
              if (walkable(tx, ty, FARM_BLOCKS)) {
                animal.tx = tx;
                animal.ty = ty;
                break;
              }
            }
            animal.mode = "walk";
          }
          const frame = Math.floor(animal.walkTime / 160) % 2;
          const bob = animal.mode === "walk" && frame % 2 ? -1 : 0;
          const graze =
            animal.mode === "graze" &&
            Math.floor((time - animal.since) / 240) % 2
              ? 7
              : 0;
          const p = (ox: number, oy: number, w: number, h: number, c: number) =>
            r(
              animal.x + (animal.direction === "left" ? -ox - w : ox),
              animal.y + oy + bob,
              w,
              h,
              c,
            );
          if (animal.kind === "cow") {
            r(animal.x - 17, animal.y + 13, 34, 4, 0x3e5233, 0.15);
            p(-16, -12, 32, 17, 0xf2ead2);
            p(-11, -9, 8, 8, 0x4a4038);
            p(5, -4, 9, 8, 0x4a4038);
            if (animal.mode === "walk") {
              p(-13, 5, 4, 8 - (frame ? 2 : 0), 0x4a4038);
              p(9, 5, 4, 8 - (frame ? 0 : 2), 0x4a4038);
            } else {
              p(-13, 5, 4, 8, 0x4a4038);
              p(9, 5, 4, 8, 0x4a4038);
            }
            p(13, -17 + graze, 11, 11, 0xf2ead2);
            p(13, -20 + graze, 4, 4, 0xd9c8a4);
            p(21, -10 + graze, 4, 4, 0xe8a8a0);
            p(16, -15 + graze, 2, 2, 0x3e5233);
          } else {
            r(animal.x - 13, animal.y + 11, 26, 4, 0x3e5233, 0.15);
            p(-12, -10, 24, 15, 0xf5f2e8);
            p(-14, -7, 4, 7, 0xf5f2e8);
            p(8, -12, 5, 5, 0xf5f2e8);
            if (animal.mode === "walk") {
              p(-9, 5, 3, 7 - (frame ? 2 : 0), 0x4a4a52);
              p(5, 5, 3, 7 - (frame ? 0 : 2), 0x4a4a52);
            } else {
              p(-9, 5, 3, 7, 0x4a4a52);
              p(5, 5, 3, 7, 0x4a4a52);
            }
            p(11, -13 + graze, 9, 9, 0x4a4a52);
            p(9, -15 + graze, 4, 3, 0x4a4a52);
            p(17, -9 + graze, 3, 2, 0x4a4a52);
            p(14, -11 + graze, 2, 2, 0xf5f2e8);
          }
        }
        const prompt = this.farmPrompt!;
        const target = this.farmTarget(time);
        if (target) {
          prompt
            .setText(
              target.kind === "egg"
                ? t("[E] Collect the egg")
                : target.kind === "plant"
                  ? t("[E] Plant seeds")
                  : t("[E] Harvest the wheat"),
            )
            .setPosition(target.x, target.y - 32)
            .setVisible(true);
        } else prompt.setVisible(false);
        this.farmHud!.setText(
          `🥚 ${farm.caught.eggs}   🌾 ${farm.caught.crops}   🐟 ${farm.caught.fish}`,
        );
      }
      create() {
        if (disposed) return;
        const g = this.add.graphics().setDepth(-2);
        drawOfficeMap(
          getMap(props.mapId),
          (x, y, w, h, color) => {
            g.fillStyle(color);
            g.fillRect(x, y, w, h);
          },
          (text, x, y, size, color) => {
            this.add
              .text(x, y, t(text), {
                fontFamily:
                  locale === "th"
                    ? '"IBM Plex Sans Thai", sans-serif'
                    : "monospace",
                fontSize: size + "px",
                color,
                letterSpacing: locale === "th" ? 0 : 1,
                resolution: 4,
              })
              .setOrigin(0.5);
          },
          (effect) => this.effects.push(effect),
        );
        this.ambient = this.add.graphics().setDepth(-1);
        if (getMap(props.mapId).theme === "farm") {
          this.farm = {
            eggs: new Map(),
            nextEgg: 4000,
            plots: FARM_PLOTS.map(() => 0),
            hens: FARM_HENS.map(([x, y], i) => ({
              x,
              y,
              tx: x,
              ty: y,
              mode: "idle" as const,
              fast: false,
              until: 1000 + i * 700,
              since: 0,
              direction: "right" as const,
              walkTime: 0,
              body: i % 2 ? 0xc98d5a : 0xf5f2e8,
              wing: i % 2 ? 0xb0794a : 0xd9d2c0,
            })),
            animals: (
              [
                ["cow", 210, 330],
                ["cow", 860, 350],
                ["sheep", 150, 460],
                ["sheep", 660, 430],
                ["sheep", 300, 630],
              ] as const
            ).map(([kind, x, y]) => ({
              kind,
              x,
              y,
              tx: x,
              ty: y,
              mode: "idle" as const,
              until: 2000 + Math.random() * 3000,
              since: 0,
              direction: "right" as const,
              walkTime: 0,
            })),
            caught: { eggs: 0, crops: 0, fish: 0 },
          };
          this.farmG = this.add.graphics().setDepth(950);
          this.farmHud = this.add
            .text(12, 8, "", {
              fontSize: "15px",
              color: "#3e5233",
              backgroundColor: "#faf7e9",
              padding: { left: 6, right: 6, top: 3, bottom: 3 },
              resolution: 4,
            })
            .setOrigin(0, 0)
            .setDepth(3000);
          this.farmLegend = this.add
            .text(1108, 8, t("WASD move · SPACE jump · E interact"), {
              fontSize: "12px",
              color: "#f4f1e0",
              stroke: "#3e5233",
              strokeThickness: 3,
              resolution: 4,
            })
            .setOrigin(1, 0)
            .setDepth(3000);
          this.farmPrompt = this.add
            .text(0, 0, "", {
              fontSize: "13px",
              color: "#3e5233",
              backgroundColor: "#faf7e9",
              padding: { left: 6, right: 6, top: 3, bottom: 3 },
              resolution: 4,
            })
            .setOrigin(0.5, 1)
            .setDepth(3000)
            .setVisible(false);
        }
        for (const room of mapZones(getMap(props.mapId)).filter(
          (zone) => zone.id !== "floor",
        )) {
          this.add
            .zone(room.x, room.y, room.w, room.h)
            .setOrigin(0)
            .setInteractive({ useHandCursor: true })
            .setData("tap", () =>
              live.current.send({ type: "zone", zone: room.id }),
            )
            .on("pointerdown", (pointer: Phaser.Input.Pointer) => {
              if (!pointer.wasTouch && this.mapPointer(pointer))
                live.current.send({ type: "zone", zone: room.id });
            });
        }
        this.input.on(
          "pointerdown",
          (
            pointer: Phaser.Input.Pointer,
            targets: Phaser.GameObjects.GameObject[],
          ) => {
            if (
              !pointer.wasTouch ||
              !this.mapPointer(pointer) ||
              this.touch ||
              document.querySelector(
                '[role="dialog"], dialog[open], [role="listbox"], .media-expanded',
              )
            )
              return;
            this.touch = {
              pointer,
              target: targets[0],
              x: pointer.x,
              y: pointer.y,
              dx: 0,
              dy: 0,
              dragged: false,
            };
            joystick.style.left = `${pointer.x / density}px`;
            joystick.style.top = `${pointer.y / density}px`;
            thumb.style.transform = "translate(0px, 0px)";
            joystick.hidden = false;
          },
        );
        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
          const touch = this.touch;
          if (!touch || touch.pointer !== pointer) return;
          const x = (pointer.x - touch.x) / density,
            y = (pointer.y - touch.y) / density;
          const distance = Math.hypot(x, y);
          touch.dragged ||= distance >= 10;
          const threshold = Math.max(Math.abs(x), Math.abs(y)) * 0.4;
          touch.dx =
            distance < 10 || Math.abs(x) < threshold ? 0 : Math.sign(x);
          touch.dy =
            distance < 10 || Math.abs(y) < threshold ? 0 : Math.sign(y);
          const scale = Math.min(1, 44 / (distance || 1));
          thumb.style.transform = `translate(${x * scale}px, ${y * scale}px)`;
        });
        this.input.on(
          "pointerup",
          (
            pointer: Phaser.Input.Pointer,
            targets: Phaser.GameObjects.GameObject[],
          ) => {
            const touch = this.touch;
            if (!touch || touch.pointer !== pointer) return;
            if (
              !touch.dragged &&
              pointer.getDistance() / density < 10 &&
              pointer.event.type !== "touchcancel" &&
              touch.target &&
              targets.includes(touch.target)
            )
              touch.target.getData("tap")?.();
            this.stopTouch();
          },
        );
        this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => {
          if (this.touch?.pointer === pointer) this.stopTouch();
        });
        let active = true;
        const resize = () => {
          if (!active || !this.sys.isActive()) return;
          this.stopTouch();
          this.scale.resize(
            Math.round(parent.clientWidth * density),
            Math.round(parent.clientHeight * density),
          );
          this.cameras.main.setBounds(0, 0, 1120, 720);
          this.cameras.main.setZoom(
            density *
              Math.max(parent.clientWidth / 1120, parent.clientHeight / 720),
          );
          const self = live.current.people.find(
            (p) => p.id === live.current.self,
          );
          this.cameras.main.centerOn(self?.x || 560, self?.y || 360);
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(parent);
        let keyboardNavigation = false;
        const pointer = () => {
          keyboardNavigation = false;
        };
        const down = (e: KeyboardEvent) => {
          if (e.key === "Tab") {
            keyboardNavigation = true;
            return;
          }
          if (
            e.target instanceof HTMLElement &&
            (e.target.closest(
              'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="dialog"]',
            ) ||
              document.querySelector(
                '[role="dialog"], dialog[open], [role="listbox"], .media-expanded',
              ))
          )
            return;
          if (
            [
              "Digit1",
              "Numpad1",
              "Digit2",
              "Numpad2",
              "Digit3",
              "Numpad3",
            ].includes(e.code) &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey
          ) {
            e.preventDefault();
            if (!e.repeat) {
              const self = live.current.people.find(
                (p) => p.id === live.current.self,
              );
              const pose = ["Digit1", "Numpad1"].includes(e.code)
                ? "sit"
                : ["Digit2", "Numpad2"].includes(e.code)
                  ? "sleep"
                  : "fish";
              live.current.send({
                type: "pose",
                pose: self?.pose === pose ? "stand" : pose,
              });
            }
            return;
          }
          if (e.code === "KeyZ" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (!e.repeat) live.current.send({ type: "nudge" });
            return;
          }
          if (e.code === "KeyE" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (!e.repeat) this.interactFarm(performance.now());
            return;
          }
          if (e.code === "Space") {
            // Only Tab navigation gives controls ownership of Space. A room
            // button can retain focus after a click without owning game input.
            if (
              keyboardNavigation &&
              e.target instanceof HTMLElement &&
              e.target.closest('button,a,[role="button"],[role="checkbox"]')
            )
              return;
            e.preventDefault();
            host.current?.focus({ preventScroll: true });
            if (!e.repeat) live.current.send({ type: "jump" });
            return;
          }
          if (
            [
              "ArrowUp",
              "ArrowDown",
              "ArrowLeft",
              "ArrowRight",
              "KeyW",
              "KeyA",
              "KeyS",
              "KeyD",
            ].includes(e.code)
          ) {
            e.preventDefault();
            // Walking resumes map controls after using a room or toolbar button.
            keyboardNavigation = false;
            host.current?.focus({ preventScroll: true });
            this.keys.add(e.code);
          }
        };
        const up = (e: KeyboardEvent) => this.keys.delete(e.code);
        const blur = () => {
          this.keys.clear();
          this.stopTouch();
        };
        const visibility = () => {
          if (document.hidden) blur();
        };
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", blur);
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("pointerdown", pointer, true);
        cleanupInput = () => {
          if (!active) return;
          active = false;
          observer.disconnect();
          window.removeEventListener("keydown", down);
          window.removeEventListener("keyup", up);
          window.removeEventListener("blur", blur);
          document.removeEventListener("visibilitychange", visibility);
          blur();
          window.removeEventListener("pointerdown", pointer, true);
        };
        this.events.once("shutdown", cleanupInput);
        this.events.once("destroy", cleanupInput);
      }
      update(time: number, delta: number) {
        const still = !live.current.effectsEnabled;
        if (
          this.ambient &&
          !document.hidden &&
          (this.ambientStill !== still ||
            (!still &&
              this.effects.length > 0 &&
              time - this.lastAmbient >= 80))
        ) {
          this.ambient.clear();
          drawMapEffects(
            this.effects,
            time,
            still,
            (x, y, w, h, color, alpha = 1) => {
              this.ambient!.fillStyle(color, alpha).fillRect(x, y, w, h);
            },
          );
          this.lastAmbient = time;
          this.ambientStill = still;
        }
        if (this.farm) this.updateFarm(time, delta);
        const state = live.current;
        if (
          document.querySelector(
            '[role="dialog"], dialog[open], [role="listbox"], .media-expanded',
          )
        ) {
          this.keys.clear();
          this.stopTouch();
        }
        if (time - this.lastInput > 80) {
          const dx = this.touch
            ? this.touch.dx
            : (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
              (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
          const dy = this.touch
            ? this.touch.dy
            : (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
              (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0);
          this.seq = Math.max(
            this.seq,
            state.people.find((person) => person.id === state.self)?.seq || 0,
          );
          state.send({ type: "move", dx, dy, seq: ++this.seq });
          this.lastInput = time;
        }
        const ids = new Set(state.people.map((p) => p.id));
        for (const [id, a] of this.avatars)
          if (!ids.has(id)) {
            a.container.destroy();
            this.avatars.delete(id);
          }
        for (const p of state.people) {
          let a = this.avatars.get(p.id);
          if (!a) {
            const body = this.add.graphics();
            const label = this.add
              .text(0, -51, p.name, {
                fontFamily:
                  locale === "th"
                    ? '"IBM Plex Sans Thai", sans-serif'
                    : "sans-serif",
                fontSize: "12px",
                fontStyle: "bold",
                color: "#3b4839",
                backgroundColor: "#faf7e9",
                padding: { left: 6, right: 24, top: 4, bottom: 4 },
                resolution: 4,
              })
              .setOrigin(0.5);
            const wave = this.add
              .text(0, -66, "", {
                fontSize: "24px",
                resolution: 4,
              })
              .setOrigin(0.5, 1);
            const micIcon = this.add.graphics();
            const container = this.add.container(p.x, p.y, [
              body,
              label,
              micIcon,
              wave,
            ]);
            container
              .setSize(44, 65)
              .setInteractive()
              .setData("tap", () => live.current.select(p.id))
              .on("pointerdown", (pointer: Phaser.Input.Pointer) => {
                if (!pointer.wasTouch && this.mapPointer(pointer))
                  live.current.select(p.id);
              });
            a = {
              container,
              body,
              label,
              micIcon,
              wave,
              color: "",
              walkTime: 0,
              pose: p.pose || "stand",
              poseSince: time,
            };
            this.avatars.set(p.id, a);
          }
          a.container.x = Phaser.Math.Linear(
            a.container.x,
            p.x,
            Math.min(1, delta / 65),
          );
          a.container.y = Phaser.Math.Linear(
            a.container.y,
            p.y,
            Math.min(1, delta / 65),
          );
          a.container.setDepth(1000 + p.y);
          const pose = p.pose || "stand";
          if (a.pose !== pose) {
            a.pose = pose;
            a.poseSince = time;
          }
          const settle =
            reducedMotion || pose === "stand" || pose === "fish"
              ? 0
              : -4 * Math.max(0, 1 - (time - a.poseSince) / 250);
          const breathe =
            !reducedMotion && pose === "sleep" ? Math.sin(time / 650) : 0;
          const nudge = state.nudges[p.id];
          const nudgeTime = nudge ? performance.now() - nudge.start : 600;
          const reacting = nudgeTime >= 0 && nudgeTime < 500;
          const motion =
            !reducedMotion && reacting
              ? Math.sin((nudgeTime / 500) * Math.PI)
              : 0;
          const push = nudge?.sender
            ? motion * 8
            : motion * Math.sin(nudgeTime / 35) * 4;
          const nudgeX = nudge?.sender
            ? p.direction === "left"
              ? -push
              : p.direction === "right"
                ? push
                : 0
            : push;
          const nudgeY = nudge?.sender
            ? p.direction === "up"
              ? -push
              : p.direction === "down"
                ? push
                : 0
            : 0;
          const jumpStart = state.jumps[p.id];
          const elapsed =
            jumpStart === undefined
              ? JUMP_DURATION
              : performance.now() - jumpStart;
          const airborne = elapsed >= 0 && elapsed < 520;
          const height = airborne
            ? 28 * 4 * (elapsed / 520) * (1 - elapsed / 520)
            : 0;
          const squash =
            elapsed >= 520 && elapsed < JUMP_DURATION
              ? 0.16 *
                Math.sin(((elapsed - 520) / (JUMP_DURATION - 520)) * Math.PI)
              : 0;
          const fishing = pose === "fish" ? p.fishing : undefined;
          const fishingTime = Date.now();
          const fishingSpace =
            fishing &&
            p.direction === "up" &&
            fishingPhase(fishing, fishingTime) !== "idle"
              ? 28
              : 0;
          a.label.y = -57 - height - fishingSpace;
          a.wave.y = -66 - height - fishingSpace;
          a.label.setText(
            p.id === state.self ? t("{name} · you", { name: p.name }) : p.name,
          );
          const g = a.body;
          g.clear();
          if (reacting) {
            g.lineStyle(2, 0xefb865, 1 - nudgeTime / 500);
            g.strokeEllipse(0, 3, 40 + motion * 15, 19 + motion * 5);
          }
          const r = (x: number, y: number, w: number, h: number, c: number) => {
            g.fillStyle(c);
            g.fillRect(x, y, w, h);
          };
          g.fillStyle(0x5c6551, 0.18 - height / 400);
          g.fillEllipse(0, 4, 31 - height * 0.3, 12 - height * 0.1);
          if (p.id === state.self) {
            g.lineStyle(2, 0xfaf6d7, 0.9);
            g.strokeEllipse(0, 3, 37, 17);
          }
          const isSpeaking = state.speaking.includes(p.id);
          const labelBackground = isSpeaking ? "#28794f" : "#faf7e9";
          if (a.label.style.backgroundColor !== labelBackground) {
            a.label.setBackgroundColor(labelBackground);
            a.label.setColor(isSpeaking ? "#ffffff" : "#3b4839");
          }
          const micColor = isSpeaking
            ? 0xffffff
            : p.microphone
              ? 0x487950
              : 0x9b766b;
          a.micIcon.setPosition(a.label.width / 2 - 13, a.label.y);
          a.micIcon.clear().lineStyle(1.5, micColor, 1);
          a.micIcon.strokeRoundedRect(-2, -7, 5, 9, 2);
          a.micIcon.lineBetween(-5, -2, -5, 2);
          a.micIcon.lineBetween(-5, 2, 0, 5);
          a.micIcon.lineBetween(0, 5, 5, 2);
          a.micIcon.lineBetween(5, 2, 5, -2);
          a.micIcon.lineBetween(0, 5, 0, 8);
          a.micIcon.lineBetween(-3, 8, 3, 8);
          if (!p.microphone) a.micIcon.lineBetween(-7, -8, 7, 8);
          if (isSpeaking) {
            const pulse = reducedMotion ? 0 : Math.sin(time / 150);
            g.lineStyle(3, 0x40ba78, 0.85);
            g.strokeCircle(0, -13 - height, 29 + pulse * 2);
            r(25, -39 - height, 21, 23, 0x28794f);
            for (let bar = 0; bar < 3; bar++) {
              const h = reducedMotion
                ? 7 + (bar % 2) * 7
                : 5 + Math.round((Math.sin(time / 100 + bar * 2) + 1) * 6);
              r(29 + bar * 5, -20 - height - h, 3, h, 0xffffff);
            }
          }
          a.walkTime = p.moving ? a.walkTime + Math.min(delta, 50) : 0;
          const frame = Math.floor(a.walkTime / 110) % 4;
          const stride = airborne ? 3 : [0, 4, 0, -4][frame];
          const bob = airborne ? 0 : frame % 2 ? -1 : 0;
          // Mirror only the side-facing sprite, keeping names and waves upright.
          const pixel = (
            x: number,
            y: number,
            w: number,
            h: number,
            c: number,
          ) =>
            r(
              (p.direction === "left" ? -x - w : x) * (1 + squash / 2) + nudgeX,
              8 +
                (y + bob - 8) * (1 - squash) -
                height +
                nudgeY +
                settle +
                breathe,
              w * (1 + squash / 2),
              h * (1 - squash),
              c,
            );
          if (fishing && p.direction === "up")
            drawFishing(fishing, p.avatar, fishingTime, reducedMotion, r);
          drawCharacter(p.avatar, p.direction, stride, pixel, pose);
          if (fishing && p.direction !== "up")
            drawFishing(fishing, p.avatar, fishingTime, reducedMotion, r);
          // On the farm, pickup celebrations become pixel-art icons that
          // float up and fade instead of emoji text.
          const emote = state.emotes[p.id];
          const farmIcon =
            this.farm && emote && emote.until > Date.now()
              ? FARM_ICON_EMOJIS[emote.emoji]
              : undefined;
          if (farmIcon) {
            const remaining = emote.until - Date.now();
            const rise = ((3000 - remaining) / 3000) * 14;
            this.drawFarmIcon(
              g,
              farmIcon,
              nudgeX,
              -76 - rise + nudgeY,
              Math.min(1, remaining / 600),
            );
          }
          a.wave.setText(
            farmIcon
              ? ""
              : reacting && !nudge?.sender
                ? "!"
                : (state.emotes[p.id]?.until || 0) > Date.now()
                  ? state.emotes[p.id].emoji
                  : pose === "sleep"
                    ? "Zzz"
                    : (state.waves[p.id] || 0) > Date.now()
                      ? "👋"
                      : p.status === "dnd"
                        ? "⏾"
                        : p.status === "away"
                          ? "z"
                          : "",
          );
          if (p.id === state.self)
            this.cameras.main.centerOn(a.container.x, a.container.y);
        }
      }
    }
    const start = () => {
      if (disposed) return;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        backgroundColor: "#e2ddd0",
        antialias: true,
        scene: OfficeScene,
        scale: {
          width: Math.round(parent.clientWidth * density),
          height: Math.round(parent.clientHeight * density),
          zoom: 1 / density,
        },
        audio: { noAudio: true },
        banner: false,
      });
    };
    if (locale === "th") {
      void Promise.all([
        document.fonts.load('400 12px "IBM Plex Sans Thai"'),
        document.fonts.load('700 12px "IBM Plex Sans Thai"'),
      ]).then(start, start);
    } else start();
    return () => {
      // Phaser destruction does not emit shutdown. Release global input now,
      // including React's trial mount and workspace map changes.
      disposed = true;
      motionPreference.removeEventListener("change", motionChange);
      cleanupInput();
      game?.destroy(true);
      parent.remove();
    };
  }, [props.mapId, locale]);
  return (
    <div
      ref={host}
      className="pixel-map"
      tabIndex={0}
      onPointerDown={(event) =>
        event.currentTarget.focus({ preventScroll: true })
      }
      data-map-id={props.mapId}
      role="img"
      aria-label={
        t(
          "Interactive pixel office. Move with WASD or arrow keys, or touch and drag to walk. Release to stop. Press Space to jump. Tap a person or meeting room to interact, or use the Rooms list for keyboard-accessible navigation.",
        ) +
        (getMap(props.mapId).theme === "farm"
          ? " " + t("Press E near eggs, crops, or the pond to play.")
          : "")
      }
    />
  );
}
