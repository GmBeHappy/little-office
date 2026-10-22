import { expect, test } from "bun:test";
import { nativeAvatar } from "../server/native-scene";
import { drawCharacter, characterLook } from "../shared/avatars";

test("native atlas matches web strides, jump and left mirroring for preset/custom avatars", () => {
  for (const avatar of ["sage", "custom:4:14:14:14"] as const) {
    const atlas = nativeAvatar(avatar);
    expect(Object.keys(atlas.frames)).toHaveLength(80);
    expect(atlas.skin).toBe(characterLook(avatar).skin);
    for (const direction of ["up", "down", "left", "right"] as const)
      for (const pose of ["stand", "sit", "sleep", "fish"] as const)
        [0, 4, 0, -4, 3].forEach((stride, frame) => {
          const expected: (typeof atlas.frames)[string] = [];
          drawCharacter(
            avatar,
            direction,
            stride,
            (x, y, w, h, color) => {
              expected.push({
                x: direction === "left" ? -x - w : x,
                y,
                w,
                h,
                color,
              });
            },
            pose,
          );
          expect(atlas.frames[`${direction}-${pose}-${frame}`]).toEqual(
            expected,
          );
        });
  }
});
