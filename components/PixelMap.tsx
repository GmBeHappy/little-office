"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { WORLD, JUMP_DURATION, type Person } from "@/shared/world";
import { drawOfficeMap, getMap, mapZones, type MapId } from "@/shared/maps";
import { drawCharacter } from "@/shared/avatars";
import type { Command } from "@/shared/protocol";
type Props = {
  mapId: MapId;
  people: Person[];
  self: string;
  speaking: string[];
  waves: Record<string, number>;
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
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
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
      keys = new Set<string>();
      seq = 0;
      lastInput = 0;
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
          !document.querySelector('[role="dialog"], .media-expanded')
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
      create() {
        if (disposed) return;
        const g = this.add.graphics();
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
        );
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
              document.querySelector('[role="dialog"], .media-expanded')
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
              document.querySelector('[role="dialog"], .media-expanded'))
          )
            return;
          if (
            ["Digit1", "Numpad1", "Digit2", "Numpad2"].includes(e.code) &&
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
                : "sleep";
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
        const state = live.current;
        if (document.querySelector('[role="dialog"], .media-expanded')) {
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
            const wave = this.add.text(17, -48, "", {
              fontSize: "22px",
              resolution: 4,
            });
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
            reducedMotion || pose === "stand"
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
          a.label.y = -57 - height;
          a.wave.y = -54 - height;
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
          drawCharacter(p.avatar, p.direction, stride, pixel, pose);
          a.wave.setText(
            reacting && !nudge?.sender
              ? "!"
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
      aria-label={t(
        "Interactive pixel office. Move with WASD or arrow keys, or touch and drag to walk. Release to stop. Press Space to jump. Tap a person or meeting room to interact, or use the Rooms list for keyboard-accessible navigation.",
      )}
    />
  );
}
