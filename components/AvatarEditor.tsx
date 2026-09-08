"use client";
import { useState } from "react";
import { Check, RotateCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { CHARACTER_LOOKS } from "@/shared/avatars";
import {
  appearanceFor,
  avatarId,
  SKIN_TONES,
  HAIR_STYLES,
  HATS,
  OUTFITS,
  type Appearance,
} from "@/shared/appearance";
import type { Person } from "@/shared/world";
import { Avatar } from "./Avatar";
const directions: Person["direction"][] = ["down", "left", "up", "right"];
export function AvatarEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [facing, setFacing] = useState(0);
  const appearance = appearanceFor(value);
  const groups = [
    {
      key: "hair",
      label: "Hair",
      options: HAIR_STYLES.map((item) => item.name),
    },
    { key: "hat", label: "Hat", options: HATS },
    {
      key: "clothes",
      label: "Clothes",
      options: OUTFITS.map((item) => item.name),
    },
  ] as const;
  return (
    <div className="avatar-editor">
      <div className="avatar-preview-panel">
        <span className="eyebrow">{t("YOUR CHARACTER")}</span>
        <div className="avatar-preview-stage">
          <Avatar color={value} direction={directions[facing]} />
        </div>
        <button
          type="button"
          className="secondary avatar-turn"
          onClick={() => setFacing((facing + 1) % directions.length)}
        >
          <RotateCw size={14} />
          {t("Rotate preview")}
        </button>
        <p>{t("Mix your look. Save to wear it in the office.")}</p>
      </div>
      <div className="avatar-options">
        <fieldset>
          <legend>{t("Skin tone")}</legend>
          <div className="skin-tone-options">
            {SKIN_TONES.map((tone, index) => (
              <button
                type="button"
                key={tone.name}
                aria-label={t("{name} skin tone", { name: t(tone.name) })}
                aria-pressed={appearance.skin === index}
                style={
                  {
                    "--skin-tone": `#${tone.color.toString(16).padStart(6, "0")}`,
                  } as React.CSSProperties
                }
                onClick={() =>
                  onChange(
                    avatarId({
                      ...appearance,
                      skin: index as Appearance["skin"],
                    }),
                  )
                }
              >
                <span className="skin-tone-swatch">
                  {appearance.skin === index && <Check size={16} />}
                </span>
                <small>{t(tone.name)}</small>
              </button>
            ))}
          </div>
        </fieldset>
        {groups.map((group) => (
          <fieldset key={group.key}>
            <legend>{t(group.label)}</legend>
            <div className={`avatar-style-options avatar-style-${group.key}`}>
              {group.options.map((name, index) => {
                const next = {
                  ...appearance,
                  [group.key]: index,
                } as Appearance;
                return (
                  <button
                    type="button"
                    key={name}
                    aria-label={t(name)}
                    aria-pressed={appearance[group.key] === index}
                    onClick={() => onChange(avatarId(next))}
                  >
                    <Avatar
                      color={avatarId(
                        group.key === "hair" ? { ...next, hat: 0 } : next,
                      )}
                    />
                    <small>{t(name)}</small>
                    {appearance[group.key] === index && (
                      <Check className="appearance-check" size={12} />
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <details className="avatar-presets">
          <summary>{t("Start from a preset")}</summary>
          <div
            className="avatar-picker"
            role="group"
            aria-label={t("Character skins")}
          >
            {CHARACTER_LOOKS.map((look) => (
              <button
                type="button"
                key={look.id}
                className={value === look.id ? "picked" : ""}
                aria-label={t("{name} skin", { name: t(look.name) })}
                aria-pressed={value === look.id}
                onClick={() => onChange(look.id)}
              >
                <Avatar color={look.id} />
                <span>{t(look.name)}</span>
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
