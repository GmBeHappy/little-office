import { nativeMap } from "../server/native-scene";
import { MAPS } from "../shared/maps";
import {
  animalPosition,
  drawHabitat,
  habitatLayout,
  habitatTarget,
} from "../shared/habitats";
import { drawMapEffects, type PixelRect } from "../shared/map-effects";
import {
  FARM_EGG_SPOTS,
  FARM_PLOTS,
  FARM_GROWTH,
  farmTarget,
  drawFarmHen,
  drawFarmAnimal,
} from "../shared/farm";
import { Office } from "../server/office";

export const capturePixels = (
  draw: (
    r: (
      x: number,
      y: number,
      w: number,
      h: number,
      color: number,
      alpha?: number,
    ) => void,
  ) => void,
) => {
  const rectangles: PixelRect[] = [];
  draw((x, y, w, h, color, alpha) =>
    rectangles.push({
      x,
      y,
      w,
      h,
      color,
      ...(alpha === undefined ? {} : { alpha }),
    }),
  );
  return rectangles;
};
export function nativeFixtures() {
  const times = [0, 160, 900, 2300, 12345, 1700000000123];
  const scenes = MAPS.map((map) => nativeMap(map.id));
  const animals = MAPS.flatMap((map) =>
    [0, 1, 2].flatMap((index) =>
      times.map((time) => ({
        mapId: map.id,
        index,
        time,
        expected: animalPosition(map.id, index, time),
      })),
    ),
  );
  const habitat = MAPS.flatMap((map) =>
    [false, true].flatMap((still) =>
      [0, 1, 2, 3].map((step) => {
        const time = 12345,
          state = {
            revision: 7,
            step,
            updatedAt: 12000,
            animal: 1,
            affectionUntil: 17000,
          };
        return {
          mapId: map.id,
          time,
          still,
          state,
          expected: capturePixels((r) =>
            drawHabitat(map.id, state, time, true, true, still, r),
          ),
        };
      }),
    ),
  );
  const effects = scenes.flatMap((scene) =>
    [false, true].map((still) => ({
      mapId: scene.mapId,
      time: 12345,
      still,
      expected: capturePixels((r) =>
        drawMapEffects(scene.animation.effects, 12345, still, r),
      ),
    })),
  );
  const targets = MAPS.flatMap((map) => {
    const [station] = habitatLayout(map.id);
    return [0, 63.999, 64].map((distance) => {
      const person = {
        x: station.x + distance,
        y: station.y,
        zone: "floor" as const,
      };
      return {
        mapId: map.id,
        person,
        time: 12345,
        wildlife: false,
        activities: true,
        expected: habitatTarget(map.id, person, false, true, 12345),
      };
    });
  });
  const [eggX, eggY] = FARM_EGG_SPOTS[0],
    [cropX, cropY] = FARM_PLOTS[0];
  const farmTargets = [
    ...[47.999, 48].map((distance) => ({
      person: { x: eggX + distance, y: eggY },
      time: 1000,
      eggs: [[0, 1001]] as [number, number][],
      plots: FARM_PLOTS.map(() => 0),
    })),
    ...[1000, 1001].map((time) => ({
      person: { x: eggX, y: eggY },
      time,
      eggs: [[0, 1001]] as [number, number][],
      plots: FARM_PLOTS.map(() => 0),
    })),
    ...[FARM_GROWTH, FARM_GROWTH + 1].map((time) => ({
      person: { x: cropX, y: cropY },
      time,
      eggs: [] as [number, number][],
      plots: FARM_PLOTS.map(() => 1),
    })),
    ...[53.999, 54].map((distance) => ({
      person: { x: cropX - distance, y: cropY },
      time: 1000,
      eggs: [] as [number, number][],
      plots: FARM_PLOTS.map(() => 0),
    })),
  ].map((input) => ({
    ...input,
    expected: farmTarget(input.person, input.eggs, input.plots, input.time),
  }));
  const farmAnimals = ["left", "right"].flatMap((direction) =>
    [0, 120, 160, 240, 789].flatMap((time) => [
      ...["idle", "walk", "peck"].map((mode) => {
        const hen = {
          x: 450,
          y: 500,
          direction: direction as "left" | "right",
          mode: mode as "idle" | "walk" | "peck",
          walkTime: time,
          since: 0,
          body: 0xf5f2e8,
          wing: 0xd9d2c0,
        };
        return {
          kind: "hen",
          input: hen,
          time,
          expected: capturePixels((r) => drawFarmHen(hen, time, r)),
        };
      }),
      ...["cow", "sheep"].flatMap((kind) =>
        ["idle", "walk", "graze"].map((mode) => {
          const animal = {
            kind: kind as "cow" | "sheep",
            x: 210,
            y: 330,
            direction: direction as "left" | "right",
            mode: mode as "idle" | "walk" | "graze",
            walkTime: time,
            since: 0,
          };
          return {
            kind,
            input: animal,
            time,
            expected: capturePixels((r) => drawFarmAnimal(animal, time, r)),
          };
        }),
      ),
    ]),
  );
  const office = new Office();
  const member = office.add(
    { id: "fixture", name: "Fixture", role: "member" },
    "fixture",
    Date.now() + 60000,
    () => {},
    () => {},
  );
  Object.assign(member, habitatLayout(office.workspace.mapId)[0]);
  const interactions = [
    { time: 10000, revision: 0 },
    { time: 10000, revision: 0 },
    { time: 10500, revision: 1 },
    { time: 12000, revision: 1 },
    { time: 14000, revision: 2 },
    { time: 16000, revision: 3 },
    { time: 74000, revision: 3 },
  ].map(({ time, revision }) => {
    const command = { type: "interact" as const, target: 0, revision };
    office.handle(member.id, command, time);
    return { time, command, expected: { ...office.habitat } };
  });
  office.remove(member.id);
  return {
    version: 1,
    scenes,
    animals,
    habitat,
    effects,
    targets,
    farmTargets,
    farmAnimals,
    interactions,
  };
}
if (import.meta.main) {
  const data = JSON.stringify(nativeFixtures()) + "\n";
  if (process.argv[2]) await Bun.write(process.argv[2], data);
  else process.stdout.write(data);
}
