"use client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Dices,
  RotateCw,
} from "lucide-react";
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

function StyleCarousel({
  label,
  options,
  selected,
  avatar,
  onSelect,
}: {
  label: string;
  options: readonly string[];
  selected: number;
  avatar: (index: number) => string;
  onSelect: (index: number) => void;
}) {
  const { t } = useI18n();
  const move = (step: number) =>
    onSelect((selected + step + options.length) % options.length);
  const visible = [-1, 0, 1].map(
    (offset) => (selected + offset + options.length) % options.length,
  );
  return (
    <fieldset
      className="avatar-carousel-fieldset"
      data-option-count={options.length}
      data-selected={selected}
    >
      <legend>
        <span>{t(label)}</span>
        <small aria-hidden="true">
          {selected + 1} / {options.length}
        </small>
      </legend>
      <div className="avatar-carousel">
        <Button
          variant="plain"
          type="button"
          className="avatar-carousel-arrow"
          aria-label={t("Previous {category}", { category: t(label) })}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="avatar-carousel-track">
          {visible.map((index) => {
            const name = options[index];
            return (
              <Button
                variant="plain"
                type="button"
                className="avatar-carousel-choice"
                key={name}
                aria-label={t(name)}
                aria-pressed={selected === index}
                onClick={() => onSelect(index)}
              >
                <Avatar color={avatar(index)} />
                <small>{t(name)}</small>
                {selected === index && (
                  <Check className="appearance-check" size={12} />
                )}
              </Button>
            );
          })}
        </div>
        <Button
          variant="plain"
          type="button"
          className="avatar-carousel-arrow"
          aria-label={t("Next {category}", { category: t(label) })}
          onClick={() => move(1)}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
    </fieldset>
  );
}

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
  const randomize = () => {
    const next: Appearance = {
      skin: Math.floor(Math.random() * SKIN_TONES.length) as Appearance["skin"],
      hair: Math.floor(
        Math.random() * HAIR_STYLES.length,
      ) as Appearance["hair"],
      hat: Math.floor(Math.random() * HATS.length) as Appearance["hat"],
      clothes: Math.floor(
        Math.random() * OUTFITS.length,
      ) as Appearance["clothes"],
    };
    if (avatarId(next) === value)
      next.hair = ((next.hair + 1) % HAIR_STYLES.length) as Appearance["hair"];
    onChange(avatarId(next));
  };
  return (
    <div className="avatar-editor">
      <div className="avatar-preview-panel">
        <span className="eyebrow">{t("YOUR CHARACTER")}</span>
        <div className="avatar-preview-stage">
          <Avatar color={value} direction={directions[facing]} />
        </div>
        <div className="avatar-preview-actions">
          <Button
            variant="plain"
            type="button"
            className="secondary avatar-turn"
            onClick={() => setFacing((facing + 1) % directions.length)}
          >
            <RotateCw size={14} />
            {t("Rotate preview")}
          </Button>
          <Button
            variant="plain"
            type="button"
            className="secondary avatar-random"
            onClick={randomize}
          >
            <Dices size={15} />
            {t("Randomize")}
          </Button>
        </div>
        <p>{t("Mix your look. Save to wear it in the office.")}</p>
      </div>
      <div className="avatar-options">
        <fieldset>
          <legend>{t("Skin tone")}</legend>
          <div className="skin-tone-options">
            {SKIN_TONES.map((tone, index) => (
              <Button
                variant="plain"
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
              </Button>
            ))}
          </div>
        </fieldset>
        {groups.map((group) => (
          <StyleCarousel
            key={group.key}
            label={group.label}
            options={group.options}
            selected={appearance[group.key]}
            onSelect={(index) =>
              onChange(
                avatarId({
                  ...appearance,
                  [group.key]: index,
                } as Appearance),
              )
            }
            avatar={(index) => {
              const next = {
                ...appearance,
                [group.key]: index,
              } as Appearance;
              return avatarId(
                group.key === "hair" ? { ...next, hat: 0 } : next,
              );
            }}
          />
        ))}
        <details className="avatar-presets">
          <summary>{t("Start from a preset")}</summary>
          <div
            className="avatar-picker"
            role="group"
            aria-label={t("Character skins")}
          >
            {CHARACTER_LOOKS.map((look) => (
              <Button
                variant="plain"
                type="button"
                key={look.id}
                className={value === look.id ? "picked" : ""}
                aria-label={t("{name} skin", { name: t(look.name) })}
                aria-pressed={value === look.id}
                onClick={() => onChange(look.id)}
              >
                <Avatar color={look.id} />
                <span>{t(look.name)}</span>
              </Button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
